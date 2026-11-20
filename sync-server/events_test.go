package main

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// startEvents runs a real HTTP server (httptest.Recorder cannot stream).
func startEvents(t *testing.T, cfg Config, configure func(*Server)) (*httptest.Server, *Server) {
	t.Helper()
	cfg.DataDir = t.TempDir()
	store := NewStore(cfg.DataDir, quietLogger())
	if err := store.Load(); err != nil {
		t.Fatal(err)
	}
	srv := NewServer(cfg, store, quietLogger())
	if configure != nil {
		configure(srv)
	}
	ts := httptest.NewUnstartedServer(srv.Handler())
	ts.Config.RegisterOnShutdown(srv.Close)
	ts.Start()
	t.Cleanup(func() {
		srv.Close()
		ts.Close()
	})
	return ts, srv
}

type sseEvent struct{ name, data string }

// openStream connects and returns a channel of parsed events plus heartbeats
// (name ":"). The channel closes when the stream ends.
func openStream(t *testing.T, ctx context.Context, url string, hdr map[string]string) (*http.Response, <-chan sseEvent) {
	t.Helper()
	req, _ := http.NewRequestWithContext(ctx, "GET", url+"/api/events", nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	out := make(chan sseEvent, 32)
	if res.StatusCode != 200 {
		close(out)
		return res, out
	}
	go func() {
		defer close(out)
		defer res.Body.Close()
		sc := bufio.NewScanner(res.Body)
		var ev sseEvent
		for sc.Scan() {
			line := sc.Text()
			switch {
			case line == "":
				if ev.name != "" {
					out <- ev
				}
				ev = sseEvent{}
			case strings.HasPrefix(line, ":"):
				ev.name = ":"
			case strings.HasPrefix(line, "event: "):
				ev.name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				ev.data = strings.TrimPrefix(line, "data: ")
			}
		}
	}()
	return res, out
}

func next(t *testing.T, ch <-chan sseEvent, skipHeartbeats bool) sseEvent {
	t.Helper()
	timeout := time.After(3 * time.Second)
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				t.Fatal("stream ended")
			}
			if skipHeartbeats && ev.name == ":" {
				continue
			}
			return ev
		case <-timeout:
			t.Fatal("no event within 3 s")
		}
	}
}

func httpPut(t *testing.T, url, path, body string, hdr map[string]string) {
	t.Helper()
	req, _ := http.NewRequest("PUT", url+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("put %s: %d", path, res.StatusCode)
	}
}

func TestEventsStreamChanges(t *testing.T) {
	ts, _ := startEvents(t, Config{}, nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	res, ch := openStream(t, ctx, ts.URL, nil)
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("status %d, type %q", res.StatusCode, res.Header.Get("Content-Type"))
	}
	if res.Header.Get("Cache-Control") == "" || res.Header.Get("X-Accel-Buffering") != "no" {
		t.Fatalf("stream must not be cached or buffered: %v", res.Header)
	}
	if ev := next(t, ch, true); ev.name != "ready" || !strings.Contains(ev.data, "serverTime") {
		t.Fatalf("first event: %+v", ev)
	}

	httpPut(t, ts.URL, "/api/projects/dabc", oneProject, nil)
	ev := next(t, ch, true)
	var got Event
	if err := json.Unmarshal([]byte(ev.data), &got); err != nil || ev.name != "change" {
		t.Fatalf("change event: %+v (%v)", ev, err)
	}
	if got != (Event{Kind: "projects", ID: "dabc", UpdatedAt: 1000}) {
		t.Fatalf("event payload: %+v", got)
	}
	// Only ids and timestamps: never the name or the document.
	if strings.Contains(ev.data, "Logo") || strings.Contains(ev.data, "schemaVersion") {
		t.Fatalf("event leaks content: %s", ev.data)
	}

	// A PUT that is not applied (older) is not an event; the next applied one is.
	httpPut(t, ts.URL, "/api/projects/dabc", `{"name":"old","updatedAt":500,"data":{}}`, nil)
	httpPut(t, ts.URL, "/api/fonts/f1", `{"name":"Inter","updatedAt":2000,"data":{"private":true}}`, nil)
	ev = next(t, ch, true)
	if !strings.Contains(ev.data, `"kind":"fonts"`) || !strings.Contains(ev.data, `"updatedAt":2000`) {
		t.Fatalf("expected the font change, got %+v", ev)
	}
	// Deletions are changes too.
	httpPut(t, ts.URL, "/api/projects/dabc", `{"updatedAt":3000,"deleted":true}`, nil)
	if ev := next(t, ch, true); !strings.Contains(ev.data, `"id":"dabc"`) || !strings.Contains(ev.data, `3000`) {
		t.Fatalf("delete event: %+v", ev)
	}
}

func TestEventsFanOutToEveryStream(t *testing.T) {
	ts, srv := startEvents(t, Config{}, nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, a := openStream(t, ctx, ts.URL, nil)
	_, b := openStream(t, ctx, ts.URL, nil)
	next(t, a, true)
	next(t, b, true)
	if n := srv.events.Count(); n != 2 {
		t.Fatalf("streams: %d", n)
	}
	httpPut(t, ts.URL, "/api/projects/x1", oneProject, nil)
	for _, ch := range []<-chan sseEvent{a, b} {
		if ev := next(t, ch, true); !strings.Contains(ev.data, `"id":"x1"`) {
			t.Fatalf("got %+v", ev)
		}
	}
	cancel()
	deadline := time.Now().Add(2 * time.Second)
	for srv.events.Count() != 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if n := srv.events.Count(); n != 0 {
		t.Fatalf("closed streams must unsubscribe, %d left", n)
	}
}

func TestEventsHeartbeat(t *testing.T) {
	ts, _ := startEvents(t, Config{}, func(s *Server) { s.heartbeat = 30 * time.Millisecond })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, ch := openStream(t, ctx, ts.URL, nil)
	next(t, ch, true) // ready
	if ev := next(t, ch, false); ev.name != ":" {
		t.Fatalf("expected a heartbeat comment, got %+v", ev)
	}
	if heartbeatEvery != 25*time.Second {
		t.Fatalf("heartbeat must stay under Cloudflare's 100 s idle limit: %v", heartbeatEvery)
	}
}

func TestEventsAuth(t *testing.T) {
	ts, _ := startEvents(t, Config{APIKey: "s3cret"}, nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if res, _ := openStream(t, ctx, ts.URL, nil); res.StatusCode != 401 {
		t.Fatalf("without key: %d", res.StatusCode)
	}
	if res, _ := openStream(t, ctx, ts.URL, map[string]string{"Authorization": "Bearer nope"}); res.StatusCode != 401 {
		t.Fatalf("wrong key: %d", res.StatusCode)
	}
	res, ch := openStream(t, ctx, ts.URL, map[string]string{"Authorization": "Bearer s3cret", "Cf-Connecting-Ip": "203.0.113.9"})
	if res.StatusCode != 200 {
		t.Fatalf("right key through a tunnel: %d", res.StatusCode)
	}
	next(t, ch, true)
}

func TestEventsLocalOnlyWithoutKey(t *testing.T) {
	ts, _ := startEvents(t, Config{}, nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if res, _ := openStream(t, ctx, ts.URL, map[string]string{"Cf-Connecting-Ip": "203.0.113.9"}); res.StatusCode != 401 {
		t.Fatalf("keyless server through a tunnel: %d", res.StatusCode)
	}
	// Non-local peer, same check as the rest of the API.
	h := newTestHandler(t, Config{})
	if w := do(h, "GET", "/api/events", "", from("203.0.113.9:4000")); w.Code != 401 {
		t.Fatalf("public peer: %d", w.Code)
	}
}

func TestEventsCORSPreflight(t *testing.T) {
	h := newTestHandler(t, Config{AllowedOrigins: []string{"https://designer.hfps.dev"}})
	w := do(h, "OPTIONS", "/api/events", "",
		header("Origin", "https://designer.hfps.dev"),
		header("Access-Control-Request-Method", "GET"),
		header("Access-Control-Request-Headers", "authorization"))
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "https://designer.hfps.dev" || w.Header().Get("Access-Control-Allow-Headers") != "authorization" {
		t.Fatalf("preflight: %d %v", w.Code, w.Header())
	}
}

// The server's WriteTimeout (2 min in production) must not cut a stream: it
// renews its own deadline on every write.
func TestEventsOutliveWriteTimeout(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir, quietLogger())
	srv := NewServer(Config{DataDir: dir}, store, quietLogger())
	srv.heartbeat = 40 * time.Millisecond
	hs := &http.Server{Handler: srv.Handler(), WriteTimeout: 150 * time.Millisecond}
	hs.RegisterOnShutdown(srv.Close)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go hs.Serve(ln)
	defer hs.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, ch := openStream(t, ctx, "http://"+ln.Addr().String(), nil)
	next(t, ch, true)
	time.Sleep(400 * time.Millisecond) // well past WriteTimeout
	httpPut(t, "http://"+ln.Addr().String(), "/api/projects/late", oneProject, nil)
	if ev := next(t, ch, true); !strings.Contains(ev.data, `"id":"late"`) {
		t.Fatalf("got %+v", ev)
	}

	// Shutdown ends the streams instead of waiting for them.
	sctx, scancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer scancel()
	start := time.Now()
	if err := hs.Shutdown(sctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	if time.Since(start) > time.Second {
		t.Fatalf("shutdown waited for the stream: %v", time.Since(start))
	}
}

func TestBrokerDropsSlowSubscribers(t *testing.T) {
	b := NewBroker()
	slow, _ := b.Subscribe()
	for i := 0; i < subscriberBuffer+1; i++ {
		b.Publish(Event{Kind: "projects", ID: "a", UpdatedAt: float64(i)})
	}
	if b.Count() != 0 {
		t.Fatal("a subscriber that does not read must be dropped, not block the publisher")
	}
	n := 0
	for range slow {
		n++
	}
	if n != subscriberBuffer {
		t.Fatalf("buffered events: %d", n)
	}
	b.Unsubscribe(slow) // already removed: no panic
}

func TestBrokerLimitsAndClose(t *testing.T) {
	b := NewBroker()
	var subs []chan Event
	for i := 0; i < maxSubscribers; i++ {
		ch, ok := b.Subscribe()
		if !ok {
			t.Fatalf("subscriber %d refused", i)
		}
		subs = append(subs, ch)
	}
	if _, ok := b.Subscribe(); ok {
		t.Fatal("over the limit must be refused")
	}
	b.Close()
	b.Close()
	for _, ch := range subs {
		if _, open := <-ch; open {
			t.Fatal("Close must end every stream")
		}
	}
	if _, ok := b.Subscribe(); ok {
		t.Fatal("closed broker must refuse")
	}
	b.Publish(Event{}) // no panic after close
}

func TestEventsTooManyStreams(t *testing.T) {
	dir := t.TempDir()
	srv := NewServer(Config{DataDir: dir}, NewStore(dir, quietLogger()), quietLogger())
	srv.Close()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/events", nil)
	r.RemoteAddr = "127.0.0.1:1"
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("closed server: %d", w.Code)
	}
}

func TestHealthAdvertisesEvents(t *testing.T) {
	h := newTestHandler(t, Config{})
	if w := do(h, "GET", "/api/health", ""); !strings.Contains(w.Body.String(), `"events":true`) {
		t.Fatalf("health: %s", w.Body)
	}
}
