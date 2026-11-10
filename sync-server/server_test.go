package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestHandler(t *testing.T, cfg Config) http.Handler {
	t.Helper()
	cfg.DataDir = t.TempDir()
	store := NewStore(cfg.DataDir, quietLogger())
	store.now = func() time.Time { return time.UnixMilli(testNow) }
	if err := store.Load(); err != nil {
		t.Fatal(err)
	}
	srv := NewServer(cfg, store, quietLogger())
	srv.now = func() time.Time { return time.UnixMilli(testNow) }
	return srv.Handler()
}

type reqOpt func(*http.Request)

func from(addr string) reqOpt { return func(r *http.Request) { r.RemoteAddr = addr } }
func header(k, v string) reqOpt {
	return func(r *http.Request) { r.Header.Set(k, v) }
}

func do(h http.Handler, method, path, body string, opts ...reqOpt) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:50000"
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	for _, o := range opts {
		o(r)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

const oneProject = `{"name":"Logo","createdAt":1,"updatedAt":1000,"data":{"schemaVersion":1,"children":[]}}`

func TestProjectRoundTrip(t *testing.T) {
	h := newTestHandler(t, Config{})
	w := do(h, "PUT", "/api/projects/dabc", oneProject)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"applied":true`) {
		t.Fatalf("put: %d %s", w.Code, w.Body)
	}
	w = do(h, "GET", "/api/projects", "")
	var list struct{ Items []Meta }
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list.Items) != 1 || list.Items[0].ID != "dabc" || list.Items[0].Name != "Logo" || list.Items[0].Size == 0 {
		t.Fatalf("list: %s", w.Body)
	}
	if !strings.Contains(w.Body.String(), `"deleted":false`) {
		t.Fatalf("deleted must always be present: %s", w.Body)
	}
	w = do(h, "GET", "/api/projects/dabc", "")
	var rec Record
	json.Unmarshal(w.Body.Bytes(), &rec)
	if w.Code != 200 || rec.ID != "dabc" || !strings.Contains(string(rec.Data), `"schemaVersion":1`) {
		t.Fatalf("get: %d %s", w.Code, w.Body)
	}
	if w := do(h, "GET", "/api/projects/nope", ""); w.Code != 404 {
		t.Fatalf("missing: %d", w.Code)
	}
	if w := do(h, "GET", "/api/other", ""); w.Code != 404 {
		t.Fatalf("unknown kind: %d", w.Code)
	}
}

func TestPutRejectsOlderAndReturnsCurrent(t *testing.T) {
	h := newTestHandler(t, Config{})
	do(h, "PUT", "/api/projects/a", oneProject)
	w := do(h, "PUT", "/api/projects/a", `{"name":"old","updatedAt":500,"data":{}}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"applied":false`) || !strings.Contains(w.Body.String(), `"updatedAt":1000`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestPutBadRequests(t *testing.T) {
	h := newTestHandler(t, Config{})
	for name, body := range map[string]string{
		"not json":     `{`,
		"no data":      `{"name":"x","updatedAt":5}`,
		"no updatedAt": `{"name":"x","data":{}}`,
		"string time":  `{"name":"x","updatedAt":"5","data":{}}`,
		"future":       `{"name":"x","updatedAt":9999999999999999,"data":{}}`,
	} {
		if w := do(h, "PUT", "/api/projects/a", body); w.Code != 400 {
			t.Errorf("%s: got %d %s", name, w.Code, w.Body)
		}
	}
	if w := do(h, "PUT", "/api/projects/..%2Fx", oneProject); w.Code != 400 && w.Code != 404 {
		t.Errorf("traversal: got %d", w.Code)
	}
}

func TestBodyLimit(t *testing.T) {
	h := newTestHandler(t, Config{MaxBodyMB: 1})
	big := `{"name":"x","updatedAt":5,"data":{"blob":"` + strings.Repeat("a", 1<<20+10) + `"}}`
	w := do(h, "PUT", "/api/projects/a", big)
	if w.Code != 413 || !strings.Contains(w.Body.String(), "1 MB") {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
	if w := do(h, "PUT", "/api/projects/a", oneProject); w.Code != 200 {
		t.Fatalf("small body after a big one: %d", w.Code)
	}
}

func TestFontsAreSeparate(t *testing.T) {
	h := newTestHandler(t, Config{})
	do(h, "PUT", "/api/fonts/f1", `{"name":"Brand Sans","updatedAt":5,"data":{"face":{},"data":"AAAA"}}`)
	do(h, "PUT", "/api/projects/p1", oneProject)
	w := do(h, "GET", "/api/health", "")
	if !strings.Contains(w.Body.String(), `"projectCount":1`) || !strings.Contains(w.Body.String(), `"fontCount":1`) {
		t.Fatalf("health %s", w.Body)
	}
	if w := do(h, "GET", "/api/fonts/f1", ""); w.Code != 200 || !strings.Contains(w.Body.String(), "Brand Sans") {
		t.Fatalf("font get %d %s", w.Code, w.Body)
	}
}

func TestAPIKey(t *testing.T) {
	h := newTestHandler(t, Config{APIKey: "s3cret"})
	remote := []reqOpt{from("203.0.113.9:443"), header("Cf-Connecting-IP", "198.51.100.1")}
	cases := []struct {
		name string
		opts []reqOpt
		want int
	}{
		{"missing", remote, 401},
		{"wrong", append([]reqOpt{header("Authorization", "Bearer nope")}, remote...), 401},
		{"not bearer", append([]reqOpt{header("Authorization", "s3cret")}, remote...), 401},
		{"right through a tunnel", append([]reqOpt{header("Authorization", "Bearer s3cret")}, remote...), 200},
	}
	for _, c := range cases {
		for _, path := range []string{"/api/projects", "/api/fonts"} {
			t.Run(c.name+path, func(t *testing.T) {
				w := do(h, "GET", path, "", c.opts...)
				if w.Code != c.want {
					t.Fatalf("got %d want %d: %s", w.Code, c.want, w.Body)
				}
			})
		}
	}
	if w := do(h, "PUT", "/api/projects/a", oneProject, remote...); w.Code != 401 {
		t.Fatalf("put without key: %d", w.Code)
	}
	if w := do(h, "GET", "/api/health", "", remote...); w.Code != 200 {
		t.Fatalf("health needs no key when one is configured: %d", w.Code)
	}
}

func TestLocalOnlyWithoutKey(t *testing.T) {
	h := newTestHandler(t, Config{})
	cases := []struct {
		name string
		opts []reqOpt
		want int
	}{
		{"loopback", []reqOpt{from("127.0.0.1:1")}, 200},
		{"private LAN", []reqOpt{from("192.168.1.20:1")}, 200},
		{"tailscale", []reqOpt{from("100.117.70.116:1")}, 200},
		{"ipv6 loopback", []reqOpt{from("[::1]:1")}, 200},
		{"public internet", []reqOpt{from("203.0.113.9:1")}, 401},
		{"cloudflare tunnel from local connector", []reqOpt{from("172.18.0.3:1"), header("Cf-Connecting-IP", "198.51.100.1")}, 401},
		{"reverse proxy on localhost", []reqOpt{from("127.0.0.1:1"), header("X-Forwarded-For", "198.51.100.1")}, 401},
		{"forwarded header", []reqOpt{from("127.0.0.1:1"), header("Forwarded", "for=198.51.100.1")}, 401},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := do(h, "GET", "/api/projects", "", c.opts...)
			if w.Code != c.want {
				t.Fatalf("got %d want %d: %s", w.Code, c.want, w.Body)
			}
			if c.want == 401 && !strings.Contains(w.Body.String(), "no API key configured") {
				t.Fatalf("401 should explain why: %s", w.Body)
			}
		})
	}
	if w := do(h, "GET", "/api/health", "", from("127.0.0.1:1"), header("Cf-Connecting-IP", "1.1.1.1")); w.Code != 401 {
		t.Fatalf("health through a tunnel without a key: %d", w.Code)
	}
}

func TestCORS(t *testing.T) {
	h := newTestHandler(t, Config{APIKey: "k"})
	w := do(h, "OPTIONS", "/api/projects/a", "",
		header("Origin", "https://designer.hfps.dev"),
		header("Access-Control-Request-Method", "PUT"),
		header("Access-Control-Request-Headers", "authorization,content-type"),
		from("203.0.113.9:1"), header("Cf-Connecting-IP", "198.51.100.1"))
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "*" ||
		!strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "PUT") ||
		w.Header().Get("Access-Control-Allow-Headers") != "authorization,content-type" {
		t.Fatalf("preflight %d %v", w.Code, w.Header())
	}

	h = newTestHandler(t, Config{APIKey: "k", AllowedOrigins: []string{"https://designer.hfps.dev"}})
	w = do(h, "OPTIONS", "/api/projects/a", "", header("Origin", "https://designer.hfps.dev"), header("Access-Control-Request-Method", "PUT"))
	if w.Header().Get("Access-Control-Allow-Origin") != "https://designer.hfps.dev" {
		t.Fatalf("allowed origin: %v", w.Header())
	}
	w = do(h, "OPTIONS", "/api/projects/a", "", header("Origin", "https://evil.example"), header("Access-Control-Request-Method", "PUT"))
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("other origin must not be allowed: %v", w.Header())
	}
	w = do(h, "GET", "/api/projects", "", header("Authorization", "Bearer k"), header("Origin", "https://evil.example"))
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("other origin must not be allowed on a real request: %v", w.Header())
	}
}

func TestParseConfigAndRun(t *testing.T) {
	var out, errb strings.Builder
	if code := run([]string{"version"}, &out, &errb); code != 0 || !strings.Contains(out.String(), "designer-sync") {
		t.Fatalf("version: %d %s", code, out.String())
	}
	out.Reset()
	if code := run([]string{"genkey"}, &out, &errb); code != 0 || len(strings.TrimSpace(out.String())) != 64 {
		t.Fatalf("genkey: %d %q", code, out.String())
	}
	if code := run([]string{"nope"}, &out, &errb); code != 2 {
		t.Fatalf("unknown command: %d", code)
	}
	cfg, err := parseConfig([]string{"--port", "4000", "--allowed-origins", "https://a.example/, https://b.example", "--max-body-mb", "8"}, &errb)
	if err != nil || cfg.Port != "4000" || len(cfg.AllowedOrigins) != 2 || cfg.AllowedOrigins[0] != "https://a.example" || cfg.MaxBodyMB != 8 {
		t.Fatalf("%+v %v", cfg, err)
	}
	if cfg, _ := parseConfig(nil, &errb); cfg.Port != "3051" {
		t.Fatalf("default port %s", cfg.Port)
	}
}
