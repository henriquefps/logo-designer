package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// jobsEnv is a server whose clock the test moves.
type jobsEnv struct {
	t   *testing.T
	srv *Server
	h   http.Handler
	dir string
	ms  atomic.Int64
}

func (e *jobsEnv) advance(d time.Duration) { e.ms.Add(d.Milliseconds()) }

func newJobsEnv(t *testing.T, cfg Config) *jobsEnv {
	t.Helper()
	e := &jobsEnv{t: t, dir: t.TempDir()}
	e.ms.Store(testNow)
	e.start(cfg)
	return e
}

// start (re)builds the server on the same data folder, as after a restart.
func (e *jobsEnv) start(cfg Config) {
	e.t.Helper()
	cfg.DataDir = e.dir
	store := NewStore(e.dir, quietLogger())
	if err := store.Load(); err != nil {
		e.t.Fatal(err)
	}
	e.srv = NewServer(cfg, store, quietLogger())
	clock := func() time.Time { return time.UnixMilli(e.ms.Load()) }
	e.srv.now = clock
	store.now = clock
	if err := e.srv.jobs.Load(); err != nil {
		e.t.Fatal(err)
	}
	e.h = e.srv.Handler()
}

func (e *jobsEnv) do(method, path string, body any, opts ...reqOpt) *httptest.ResponseRecorder {
	e.t.Helper()
	raw := ""
	switch b := body.(type) {
	case nil:
	case string:
		raw = b
	default:
		buf, err := json.Marshal(b)
		if err != nil {
			e.t.Fatal(err)
		}
		raw = string(buf)
	}
	return do(e.h, method, path, raw, opts...)
}

func (e *jobsEnv) expect(want int, method, path string, body any, opts ...reqOpt) map[string]any {
	e.t.Helper()
	w := e.do(method, path, body, opts...)
	if w.Code != want {
		e.t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, want, w.Body)
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return out
}

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func shot(id string) map[string]any {
	return map[string]any{
		"id": id, "type": "screenshot", "projectId": "p1",
		"input":       map[string]any{"platform": "mobile", "name": "Home"},
		"attachments": []map[string]any{{"name": "shot.png", "mime": "image/png", "dataBase64": b64("PNGDATA")}},
	}
}

func request(id string) map[string]any {
	return map[string]any{"id": id, "type": "request", "projectId": "p1", "input": map[string]any{"text": "add a settings screen"}}
}

func (e *jobsEnv) status(id string) string {
	e.t.Helper()
	return e.expect(200, "GET", "/api/jobs/"+id, nil)["status"].(string)
}

func TestJobCreateGetListAndAttachment(t *testing.T) {
	e := newJobsEnv(t, Config{})
	job := e.expect(201, "POST", "/api/jobs", shot("j1"))
	if job["status"] != "queued" || job["cancelRequested"] != false || job["projectId"] != "p1" {
		t.Fatalf("created: %v", job)
	}
	atts := job["attachments"].([]any)
	if len(atts) != 1 || atts[0].(map[string]any)["size"] != float64(7) {
		t.Fatalf("attachments: %v", atts)
	}
	got := e.expect(200, "GET", "/api/jobs/j1", nil)
	if got["progress"] == nil || len(got["progress"].([]any)) != 0 || got["input"].(map[string]any)["platform"] != "mobile" {
		t.Fatalf("get: %v", got)
	}

	w := e.do("GET", "/api/jobs/j1/attachments/shot.png", nil)
	if w.Code != 200 || w.Body.String() != "PNGDATA" || w.Header().Get("Content-Type") != "image/png" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("attachment: %d %q %v", w.Code, w.Body, w.Header())
	}
	e.expect(404, "GET", "/api/jobs/j1/attachments/other.png", nil)
	e.expect(404, "GET", "/api/jobs/nope/attachments/shot.png", nil)
	e.expect(404, "GET", "/api/jobs/nope", nil)

	list := e.expect(200, "GET", "/api/jobs", nil)["items"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != "j1" {
		t.Fatalf("list: %v", list)
	}
	if _, has := list[0].(map[string]any)["progress"]; has {
		t.Fatal("the listing must not carry the progress log")
	}
}

func TestJobFilesArePrivate(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", shot("j1"))
	for _, p := range []string{filepath.Join(e.dir, "jobs", "j1.json"), filepath.Join(e.dir, "jobs", "j1", "shot.png")} {
		st, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		if st.Mode().Perm() != 0o600 {
			t.Errorf("%s has mode %v, want 0600", p, st.Mode().Perm())
		}
	}
	st, _ := os.Stat(filepath.Join(e.dir, "jobs", "j1"))
	if st.Mode().Perm()&0o077 != 0 {
		t.Errorf("attachment folder is readable by others: %v", st.Mode().Perm())
	}
}

func TestJobCreateValidation(t *testing.T) {
	e := newJobsEnv(t, Config{})
	with := func(base map[string]any, k string, v any) map[string]any {
		c := map[string]any{}
		for kk, vv := range base {
			c[kk] = vv
		}
		if v == nil {
			delete(c, k)
		} else {
			c[k] = v
		}
		return c
	}
	next := map[string]any{"id": "n1", "type": "next-screen", "projectId": "p1", "input": map[string]any{
		"fromScreenId": "s1", "fromNodeId": "n", "label": "Settings", "platform": "mobile", "at": map[string]any{"x": 10, "y": 20}}}
	adapt := map[string]any{"id": "a1", "type": "adapt", "projectId": "p1", "input": map[string]any{"screenId": "s1", "fromPlatform": "mobile", "toPlatform": "tablet"}}
	e.expect(201, "POST", "/api/jobs", next)
	e.expect(201, "POST", "/api/jobs", adapt)
	e.expect(201, "POST", "/api/jobs", request("r1"))

	bad := []struct {
		name string
		body any
	}{
		{"bad json", "not json"},
		{"bad id", with(request("x"), "id", "has space")},
		{"no id", with(request("x"), "id", nil)},
		{"bad type", with(request("x"), "type", "magic")},
		{"no project", with(request("x"), "projectId", nil)},
		{"input not an object", with(request("x"), "input", "hi")},
		{"no input", with(request("x"), "input", nil)},
		{"request without text", with(request("x"), "input", map[string]any{"text": "  "})},
		{"adapt without toPlatform", with(adapt, "input", map[string]any{"screenId": "s", "fromPlatform": "mobile"})},
		{"next-screen without at", with(next, "input", map[string]any{"fromScreenId": "s1", "fromNodeId": "n", "label": "L", "platform": "mobile"})},
		{"screenshot without attachment", with(shot("x"), "attachments", nil)},
		{"screenshot with a non-image", with(shot("x"), "attachments", []map[string]any{{"name": "a.txt", "mime": "text/plain", "dataBase64": b64("hi")}})},
		{"screenshot without platform", with(shot("x"), "input", map[string]any{})},
		{"attachment name with a slash", with(shot("x"), "attachments", []map[string]any{{"name": "../a.png", "mime": "image/png", "dataBase64": b64("x")}})},
		{"attachment name dotfile", with(shot("x"), "attachments", []map[string]any{{"name": ".a.png", "mime": "image/png", "dataBase64": b64("x")}})},
		{"attachment bad base64", with(shot("x"), "attachments", []map[string]any{{"name": "a.png", "mime": "image/png", "dataBase64": "***"}})},
		{"attachment bad mime", with(shot("x"), "attachments", []map[string]any{{"name": "a.png", "mime": "png", "dataBase64": b64("x")}})},
		{"duplicate attachment names", with(request("x"), "attachments", []map[string]any{
			{"name": "a.png", "mime": "image/png", "dataBase64": b64("x")}, {"name": "A.png", "mime": "image/png", "dataBase64": b64("y")}})},
	}
	for _, c := range bad {
		if w := e.do("POST", "/api/jobs", c.body); w.Code != 400 {
			t.Errorf("%s: got %d, want 400: %s", c.name, w.Code, w.Body)
		}
	}
	many := make([]map[string]any, maxAttachments+1)
	for i := range many {
		many[i] = map[string]any{"name": fmt.Sprintf("a%d.png", i), "mime": "image/png", "dataBase64": b64("x")}
	}
	if w := e.do("POST", "/api/jobs", with(request("x"), "attachments", many)); w.Code != 400 {
		t.Errorf("too many attachments: %d", w.Code)
	}
	if got := len(e.expect(200, "GET", "/api/jobs", nil)["items"].([]any)); got != 3 {
		t.Fatalf("rejected jobs must not be stored, have %d", got)
	}
	e.expect(409, "POST", "/api/jobs", request("r1"))
}

func TestJobAttachmentSizeLimit(t *testing.T) {
	e := newJobsEnv(t, Config{MaxBodyMB: 1})
	big := strings.Repeat("A", 2<<20)
	body := shot("big")
	body["attachments"] = []map[string]any{{"name": "big.png", "mime": "image/png", "dataBase64": b64(big)}}
	e.expect(413, "POST", "/api/jobs", body)
	// Under the body limit as base64 but over it decoded: 4/3 headroom must not let it through.
	mid := strings.Repeat("A", (1<<20)+1000)
	body["attachments"] = []map[string]any{{"name": "mid.png", "mime": "image/png", "dataBase64": b64(mid)}}
	e.expect(413, "POST", "/api/jobs", body)
	if _, err := os.Stat(filepath.Join(e.dir, "jobs", "big")); err == nil {
		t.Fatal("a rejected job left files behind")
	}
	ok := strings.Repeat("A", 900<<10)
	body["attachments"] = []map[string]any{{"name": "ok.png", "mime": "image/png", "dataBase64": b64(ok)}}
	e.expect(201, "POST", "/api/jobs", body)
	// Other endpoints have a small limit.
	e.expect(413, "POST", "/api/jobs/big/claim", `{"agentId":"a","pad":"`+strings.Repeat("x", 70<<10)+`"}`)
}

func TestClaimIsAtomic(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("j1"))
	const n = 60
	var wg sync.WaitGroup
	codes := make([]int, n)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			codes[i] = e.do("POST", "/api/jobs/j1/claim", map[string]any{"agentId": fmt.Sprintf("agent-%d", i)}).Code
		}()
	}
	close(start)
	wg.Wait()
	wins, conflicts := 0, 0
	for _, c := range codes {
		switch c {
		case 200:
			wins++
		case 409:
			conflicts++
		default:
			t.Fatalf("unexpected status %d", c)
		}
	}
	if wins != 1 || conflicts != n-1 {
		t.Fatalf("%d claims won, %d conflicted; want exactly one winner", wins, conflicts)
	}
	got := e.expect(200, "GET", "/api/jobs/j1", nil)
	if got["status"] != "running" || got["agentId"] == "" {
		t.Fatalf("job: %v", got)
	}
}

func TestClaimRules(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(404, "POST", "/api/jobs/nope/claim", map[string]any{"agentId": "a1"})
	e.expect(201, "POST", "/api/jobs", request("j1"))
	e.expect(400, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": ""})
	e.expect(400, "POST", "/api/jobs/j1/claim", "nope")
	got := e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	if got["status"] != "running" || got["agentId"] != "a1" || got["startedAt"] == nil {
		t.Fatalf("claim: %v", got)
	}
	e.expect(409, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	e.expect(201, "POST", "/api/jobs", request("j2"))
	e.expect(200, "POST", "/api/jobs/j2/cancel", nil)
	e.expect(409, "POST", "/api/jobs/j2/claim", map[string]any{"agentId": "a1"})
}

func TestProgress(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("j1"))
	e.expect(409, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": "too early"})
	e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	e.expect(409, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "other", "message": "not mine"})
	e.expect(400, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": " "})
	e.advance(time.Second)
	r := e.expect(200, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": "Reading the screenshot", "stage": "read"})
	if r["cancelRequested"] != false || r["progressCount"] != float64(1) {
		t.Fatalf("progress: %v", r)
	}
	long := strings.Repeat("é", 900)
	e.expect(200, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": long})
	got := e.expect(200, "GET", "/api/jobs/j1", nil)
	pr := got["progress"].([]any)
	first := pr[0].(map[string]any)
	if first["message"] != "Reading the screenshot" || first["stage"] != "read" || first["at"] != float64(testNow+1000) {
		t.Fatalf("progress entry: %v", first)
	}
	if n := len([]rune(pr[1].(map[string]any)["message"].(string))); n != maxMessageLen {
		t.Fatalf("message not truncated: %d", n)
	}
	e.expect(200, "POST", "/api/jobs/j1/cancel", nil)
	if r := e.expect(200, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": "x"}); r["cancelRequested"] != true {
		t.Fatalf("the bridge must learn about the cancel: %v", r)
	}
	listed := e.expect(200, "GET", "/api/jobs", nil)["items"].([]any)[0].(map[string]any)
	if listed["progressCount"] != float64(3) || listed["lastProgress"].(map[string]any)["message"] != "x" {
		t.Fatalf("listing: %v", listed)
	}
}

func TestProgressKeepsTheNewest200(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("j1"))
	e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	for i := 0; i < maxProgressKept+25; i++ {
		e.expect(200, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": fmt.Sprintf("step %d", i)})
	}
	pr := e.expect(200, "GET", "/api/jobs/j1", nil)["progress"].([]any)
	if len(pr) != maxProgressKept || pr[0].(map[string]any)["message"] != "step 25" || pr[len(pr)-1].(map[string]any)["message"] != fmt.Sprintf("step %d", maxProgressKept+24) {
		t.Fatalf("%d entries, first %v", len(pr), pr[0])
	}
}

func TestFinish(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("j1"))
	e.expect(409, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "done"})
	e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	e.expect(409, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "other", "status": "done"})
	e.expect(400, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "running"})
	e.expect(400, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "queued"})
	e.advance(5 * time.Second)
	got := e.expect(200, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "done", "summary": "Added Settings."})
	if got["status"] != "done" || got["summary"] != "Added Settings." || got["finishedAt"] != float64(testNow+5000) {
		t.Fatalf("finish: %v", got)
	}
	e.expect(409, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "failed"})

	for _, st := range []string{"failed", "cancelled"} {
		id := "j-" + st
		e.expect(201, "POST", "/api/jobs", request(id))
		e.expect(200, "POST", "/api/jobs/"+id+"/claim", map[string]any{"agentId": "a1"})
		got := e.expect(200, "POST", "/api/jobs/"+id+"/finish", map[string]any{"agentId": "a1", "status": st, "error": "why"})
		if got["status"] != st || got["error"] != "why" {
			t.Fatalf("%s: %v", st, got)
		}
	}
}

func TestCancel(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(404, "POST", "/api/jobs/nope/cancel", nil)
	e.expect(201, "POST", "/api/jobs", request("q"))
	got := e.expect(200, "POST", "/api/jobs/q/cancel", nil)
	if got["status"] != "cancelled" || got["cancelRequested"] != true || got["finishedAt"] == nil {
		t.Fatalf("queued cancel: %v", got)
	}
	e.expect(409, "POST", "/api/jobs/q/cancel", nil)

	e.expect(201, "POST", "/api/jobs", request("r"))
	e.expect(200, "POST", "/api/jobs/r/claim", map[string]any{"agentId": "a1"})
	got = e.expect(200, "POST", "/api/jobs/r/cancel", nil)
	if got["status"] != "running" || got["cancelRequested"] != true {
		t.Fatalf("running cancel: %v", got)
	}
	e.expect(200, "POST", "/api/jobs/r/cancel", nil) // idempotent while running
	e.expect(200, "POST", "/api/jobs/r/finish", map[string]any{"agentId": "a1", "status": "cancelled"})
	if e.status("r") != "cancelled" {
		t.Fatal("bridge finish")
	}
	e.expect(409, "POST", "/api/jobs/r/cancel", nil)
}

func TestListFiltersAndOrder(t *testing.T) {
	e := newJobsEnv(t, Config{})
	mk := func(id, project string) {
		b := request(id)
		b["projectId"] = project
		e.expect(201, "POST", "/api/jobs", b)
		e.advance(time.Second)
	}
	mk("a", "p1")
	mk("b", "p2")
	mk("c", "p1")
	e.expect(200, "POST", "/api/jobs/a/claim", map[string]any{"agentId": "x"})
	e.expect(200, "POST", "/api/jobs/a/finish", map[string]any{"agentId": "x", "status": "done"})
	ids := func(q string) string {
		var out []string
		for _, it := range e.expect(200, "GET", "/api/jobs"+q, nil)["items"].([]any) {
			out = append(out, it.(map[string]any)["id"].(string))
		}
		return strings.Join(out, ",")
	}
	if got := ids(""); got != "c,b,a" {
		t.Errorf("newest first: %s", got)
	}
	if got := ids("?active=1"); got != "c,b" {
		t.Errorf("active: %s", got)
	}
	if got := ids("?projectId=p1"); got != "c,a" {
		t.Errorf("projectId: %s", got)
	}
	if got := ids("?projectId=p1&active=1"); got != "c" {
		t.Errorf("both: %s", got)
	}
}

func TestAgentPresence(t *testing.T) {
	e := newJobsEnv(t, Config{})
	if items := e.expect(200, "GET", "/api/agents", nil)["items"].([]any); len(items) != 0 {
		t.Fatalf("no agents yet: %v", items)
	}
	e.expect(400, "POST", "/api/agents/heartbeat", map[string]any{"agentId": ""})
	hb := map[string]any{"agentId": "cachy-1", "name": "cachyos-fps", "host": "cachyos-fps", "version": "0.3.0", "busy": false}
	e.expect(200, "POST", "/api/agents/heartbeat", hb)
	items := e.expect(200, "GET", "/api/agents", nil)["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("agents: %v", items)
	}
	a := items[0].(map[string]any)
	if a["agentId"] != "cachy-1" || a["name"] != "cachyos-fps" || a["busy"] != false || a["lastSeen"] != float64(testNow) {
		t.Fatalf("agent: %v", a)
	}
	e.advance(30 * time.Second)
	e.expect(200, "POST", "/api/agents/heartbeat", map[string]any{"agentId": "cachy-1", "name": "cachyos-fps", "host": "cachyos-fps", "version": "0.3.0", "busy": true, "jobId": "j1"})
	a = e.expect(200, "GET", "/api/agents", nil)["items"].([]any)[0].(map[string]any)
	if a["busy"] != true || a["jobId"] != "j1" || a["lastSeen"] != float64(testNow+30000) {
		t.Fatalf("agent: %v", a)
	}
	e.advance(agentOnlineWindow + time.Second)
	if items := e.expect(200, "GET", "/api/agents", nil)["items"].([]any); len(items) != 0 {
		t.Fatalf("an agent silent for 45 s is offline: %v", items)
	}
}

type evCollector struct {
	ch chan Event
}

func (e *jobsEnv) subscribe() *evCollector {
	ch, ok := e.srv.events.Subscribe()
	if !ok {
		e.t.Fatal("subscribe")
	}
	return &evCollector{ch: ch}
}

func (c *evCollector) drain() []Event {
	var out []Event
	for {
		select {
		case ev, ok := <-c.ch:
			if !ok {
				return out
			}
			out = append(out, ev)
		default:
			return out
		}
	}
}

func TestJobAndAgentEvents(t *testing.T) {
	e := newJobsEnv(t, Config{})
	c := e.subscribe()
	e.expect(201, "POST", "/api/jobs", request("j1"))
	e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	e.expect(200, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": "hi"})
	e.expect(200, "POST", "/api/jobs/j1/cancel", nil)
	e.expect(200, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "cancelled"})
	e.expect(409, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a2"}) // no event for a refusal
	var got []string
	for _, ev := range c.drain() {
		if ev.Kind != "jobs" || ev.ID != "j1" || ev.UpdatedAt != testNow {
			t.Fatalf("event: %+v", ev)
		}
		got = append(got, ev.Status)
	}
	if strings.Join(got, ",") != "queued,running,running,running,cancelled" {
		t.Fatalf("job events: %v", got)
	}

	hb := map[string]any{"agentId": "a1", "name": "n", "host": "h", "version": "1", "busy": false}
	e.expect(200, "POST", "/api/agents/heartbeat", hb)
	e.advance(15 * time.Second)
	e.expect(200, "POST", "/api/agents/heartbeat", hb) // unchanged: no event
	e.advance(15 * time.Second)
	hb["busy"] = true
	e.expect(200, "POST", "/api/agents/heartbeat", hb)
	e.advance(agentOnlineWindow + time.Second)
	e.srv.jobs.Sweep()
	e.srv.jobs.Sweep() // offline is announced once
	got = nil
	for _, ev := range c.drain() {
		if ev.Kind != "agents" || ev.ID != "a1" {
			t.Fatalf("event: %+v", ev)
		}
		got = append(got, ev.Status)
	}
	if strings.Join(got, ",") != "online,busy,offline" {
		t.Fatalf("agent events: %v", got)
	}
}

func TestEventJSONForJobs(t *testing.T) {
	b, _ := json.Marshal(Event{Kind: "jobs", ID: "j1", Status: "queued", UpdatedAt: 5})
	if string(b) != `{"kind":"jobs","id":"j1","updatedAt":5,"status":"queued"}` {
		t.Fatal(string(b))
	}
	b, _ = json.Marshal(Event{Kind: "projects", ID: "p", UpdatedAt: 5})
	if string(b) != `{"kind":"projects","id":"p","updatedAt":5}` {
		t.Fatal("project events must stay as they were: " + string(b))
	}
}

func TestDeadAgentFailsItsJob(t *testing.T) {
	e := newJobsEnv(t, Config{})
	c := e.subscribe()
	e.expect(201, "POST", "/api/jobs", request("j1"))
	e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	hb := map[string]any{"agentId": "a1", "name": "n", "host": "h", "version": "1", "busy": true, "jobId": "j1"}

	// Heartbeats keep it alive well past two minutes in total.
	for i := 0; i < 6; i++ {
		e.advance(30 * time.Second)
		e.expect(200, "POST", "/api/agents/heartbeat", hb)
		if s := e.status("j1"); s != "running" {
			t.Fatalf("after %d heartbeats: %s", i+1, s)
		}
	}
	// Progress counts as contact too.
	e.advance(90 * time.Second)
	e.expect(200, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": "still here"})
	e.advance(agentDeadAfter - time.Second)
	if s := e.status("j1"); s != "running" {
		t.Fatalf("just under 2 min of silence: %s", s)
	}
	c.drain()
	e.advance(2 * time.Second)
	got := e.expect(200, "GET", "/api/jobs/j1", nil)
	if got["status"] != "failed" || got["error"] != "agent went away" || got["finishedAt"] == nil {
		t.Fatalf("dead agent: %v", got)
	}
	var failed bool
	for _, ev := range c.drain() {
		failed = failed || (ev.Kind == "jobs" && ev.Status == "failed")
	}
	if !failed {
		t.Fatal("no failed event")
	}
	// The dead agent cannot report on it any more.
	e.expect(409, "POST", "/api/jobs/j1/progress", map[string]any{"agentId": "a1", "message": "x"})
	e.expect(409, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "done"})
}

func TestDeadAgentWithoutAnyContactAfterClaim(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("j1"))
	e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	e.advance(agentDeadAfter + time.Second)
	if s := e.status("j1"); s != "failed" {
		t.Fatalf("status %s", s)
	}
}

func TestRestartKeepsJobsAndGivesAgentsGrace(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", shot("j1"))
	e.expect(201, "POST", "/api/jobs", request("j2"))
	e.expect(200, "POST", "/api/jobs/j2/claim", map[string]any{"agentId": "a1"})
	e.expect(200, "POST", "/api/jobs/j2/progress", map[string]any{"agentId": "a1", "message": "going"})
	e.advance(10 * time.Minute) // the server was down for a while
	e.start(Config{})
	if e.status("j1") != "queued" || e.status("j2") != "running" {
		t.Fatal("jobs lost on restart")
	}
	if pr := e.expect(200, "GET", "/api/jobs/j2", nil)["progress"].([]any); len(pr) != 1 {
		t.Fatalf("progress lost: %v", pr)
	}
	w := e.do("GET", "/api/jobs/j1/attachments/shot.png", nil)
	if w.Body.String() != "PNGDATA" {
		t.Fatal("attachment lost on restart")
	}
	e.advance(agentDeadAfter - time.Second)
	e.expect(200, "POST", "/api/jobs/j2/progress", map[string]any{"agentId": "a1", "message": "back"})
	e.advance(agentDeadAfter + time.Second)
	if e.status("j2") != "failed" {
		t.Fatal("the grace after a restart is two minutes, not forever")
	}
}

func TestCorruptJobFileIsMovedAside(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("j1"))
	if err := os.WriteFile(filepath.Join(e.dir, "jobs", "j1.json"), []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	e.start(Config{})
	e.expect(404, "GET", "/api/jobs/j1", nil)
	m, _ := filepath.Glob(filepath.Join(e.dir, "jobs", "j1.json.corrupt-*"))
	if len(m) != 1 {
		t.Fatalf("expected a .corrupt copy, got %v", m)
	}
}

func TestAttachmentsDeletedADayAfterFinish(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", shot("j1"))
	e.expect(200, "POST", "/api/jobs/j1/claim", map[string]any{"agentId": "a1"})
	e.advance(time.Minute)
	e.expect(200, "POST", "/api/jobs/j1/finish", map[string]any{"agentId": "a1", "status": "done", "summary": "ok"})
	e.expect(201, "POST", "/api/jobs", shot("j2")) // stays queued: never expires
	dir := filepath.Join(e.dir, "jobs", "j1")
	e.advance(attachmentTTL - time.Second)
	e.expect(200, "GET", "/api/jobs/j1/attachments/shot.png", nil)
	e.advance(2 * time.Second)
	e.expect(404, "GET", "/api/jobs/j1/attachments/shot.png", nil)
	if _, err := os.Stat(dir); err == nil {
		t.Fatal("attachment folder still on disk")
	}
	got := e.expect(200, "GET", "/api/jobs/j1", nil)
	if got["summary"] != "ok" || got["attachmentsDeleted"] != true {
		t.Fatalf("the job record stays, without its attachments: %v", got)
	}
	e.expect(200, "GET", "/api/jobs/j2/attachments/shot.png", nil)
	// A restart does not bring them back or re-delete.
	e.start(Config{})
	e.expect(404, "GET", "/api/jobs/j1/attachments/shot.png", nil)
}

func TestOnlyTheNewest200JobsAreKept(t *testing.T) {
	e := newJobsEnv(t, Config{})
	for i := 0; i < maxJobsKept+5; i++ {
		id := fmt.Sprintf("job-%03d", i)
		e.expect(201, "POST", "/api/jobs", shot(id))
		e.advance(time.Millisecond)
		if i < maxJobsKept+3 { // the last two stay queued
			e.expect(200, "POST", "/api/jobs/"+id+"/cancel", nil)
		}
	}
	items := e.expect(200, "GET", "/api/jobs", nil)["items"].([]any)
	if len(items) != maxJobsKept {
		t.Fatalf("%d jobs kept, want %d", len(items), maxJobsKept)
	}
	if items[0].(map[string]any)["id"] != "job-204" || items[len(items)-1].(map[string]any)["id"] != "job-005" {
		t.Fatalf("kept the wrong ones: %v ... %v", items[0], items[len(items)-1])
	}
	e.expect(404, "GET", "/api/jobs/job-000", nil)
	if _, err := os.Stat(filepath.Join(e.dir, "jobs", "job-000.json")); err == nil {
		t.Fatal("old job file still on disk")
	}
	if _, err := os.Stat(filepath.Join(e.dir, "jobs", "job-000")); err == nil {
		t.Fatal("old job attachments still on disk")
	}
}

func TestRetentionNeverDropsActiveJobs(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("old-queued"))
	for i := 0; i < maxJobsKept+2; i++ {
		e.advance(time.Millisecond)
		id := fmt.Sprintf("j-%03d", i)
		e.expect(201, "POST", "/api/jobs", request(id))
		e.expect(200, "POST", "/api/jobs/"+id+"/cancel", nil)
	}
	e.expect(200, "GET", "/api/jobs/old-queued", nil)
}

func TestJobsAuthWithKey(t *testing.T) {
	e := newJobsEnv(t, Config{APIKey: "secret"})
	auth := header("Authorization", "Bearer secret")
	routes := []struct{ method, path string }{
		{"POST", "/api/jobs"}, {"GET", "/api/jobs"}, {"GET", "/api/jobs/j1"}, {"GET", "/api/jobs/j1/attachments/shot.png"},
		{"POST", "/api/jobs/j1/claim"}, {"POST", "/api/jobs/j1/progress"}, {"POST", "/api/jobs/j1/finish"}, {"POST", "/api/jobs/j1/cancel"},
		{"POST", "/api/agents/heartbeat"}, {"GET", "/api/agents"},
	}
	for _, r := range routes {
		if w := e.do(r.method, r.path, "{}"); w.Code != 401 {
			t.Errorf("%s %s without a key: %d", r.method, r.path, w.Code)
		}
		if w := e.do(r.method, r.path, "{}", header("Authorization", "Bearer wrong")); w.Code != 401 {
			t.Errorf("%s %s with a wrong key: %d", r.method, r.path, w.Code)
		}
	}
	e.expect(201, "POST", "/api/jobs", shot("j1"), auth)
	e.expect(200, "GET", "/api/jobs/j1", nil, auth)
	if w := e.do("GET", "/api/jobs/j1/attachments/shot.png", nil, auth); w.Code != 200 {
		t.Fatalf("attachment with key: %d", w.Code)
	}
	// Through a tunnel with the key it works too.
	e.expect(200, "GET", "/api/jobs", nil, auth, header("Cf-Connecting-Ip", "203.0.113.9"), from("172.18.0.5:4000"))
	e.expect(200, "POST", "/api/agents/heartbeat", map[string]any{"agentId": "a1"}, auth)
	// /api/health stays open and says the server has jobs.
	if h := e.expect(200, "GET", "/api/health", nil); h["jobs"] != true {
		t.Fatalf("health: %v", h)
	}
}

func TestJobsLANRulesWithoutKey(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(201, "POST", "/api/jobs", request("j1"), from("192.168.1.20:5000"))
	e.expect(200, "GET", "/api/jobs", nil, from("100.87.163.92:5000")) // Tailscale
	for _, r := range []struct{ method, path string }{{"GET", "/api/jobs"}, {"GET", "/api/jobs/j1"}, {"GET", "/api/agents"}, {"POST", "/api/jobs/j1/cancel"}} {
		if w := e.do(r.method, r.path, "", from("203.0.113.9:5000")); w.Code != 401 {
			t.Errorf("%s %s from the internet: %d", r.method, r.path, w.Code)
		}
		if w := e.do(r.method, r.path, "", from("172.18.0.5:4000"), header("X-Forwarded-For", "203.0.113.9")); w.Code != 401 {
			t.Errorf("%s %s through a proxy: %d", r.method, r.path, w.Code)
		}
	}
	if e.status("j1") != "queued" {
		t.Fatal("a refused request changed the job")
	}
}

func TestJobsDoNotShadowProjectsAndFonts(t *testing.T) {
	e := newJobsEnv(t, Config{})
	e.expect(200, "PUT", "/api/projects/dabc", oneProject)
	e.expect(404, "PUT", "/api/jobs/j1", oneProject) // jobs are not a PUT collection
	e.expect(404, "GET", "/api/agents/heartbeat", nil)
	if h := e.expect(200, "GET", "/api/health", nil); h["projectCount"] != float64(1) {
		t.Fatalf("health: %v", h)
	}
	e.expect(200, "GET", "/api/projects/dabc", nil)
}

func TestAgentGoodbye(t *testing.T) {
	e := newJobsEnv(t, Config{})
	c := e.subscribe()
	hb := map[string]any{"agentId": "a1", "name": "n", "host": "h", "version": "1", "busy": true, "jobId": "j1"}
	e.expect(400, "POST", "/api/agents/heartbeat", map[string]any{"agentId": "a1", "status": "sleeping"})
	// A goodbye from an agent the server never saw changes nothing.
	e.expect(200, "POST", "/api/agents/heartbeat", map[string]any{"agentId": "ghost", "status": "offline"})
	e.expect(200, "POST", "/api/agents/heartbeat", hb)
	if items := e.expect(200, "GET", "/api/agents", nil)["items"].([]any); len(items) != 1 {
		t.Fatalf("agents: %v", items)
	}
	e.advance(2 * time.Second)
	e.expect(200, "POST", "/api/agents/heartbeat", map[string]any{"agentId": "a1", "status": "offline"})
	if items := e.expect(200, "GET", "/api/agents", nil)["items"].([]any); len(items) != 0 {
		t.Fatalf("offline at once, not after 45 s: %v", items)
	}
	e.expect(200, "POST", "/api/agents/heartbeat", map[string]any{"agentId": "a1", "status": "offline"}) // announced once
	e.advance(agentOnlineWindow + time.Second)
	e.srv.jobs.Sweep() // the window passing later announces nothing more
	var got []string
	for _, ev := range c.drain() {
		if ev.Kind != "agents" || ev.ID != "a1" {
			t.Fatalf("event: %+v", ev)
		}
		got = append(got, ev.Status)
		if ev.Status == "offline" && ev.UpdatedAt != testNow+2000 {
			t.Fatalf("offline event time: %+v", ev)
		}
	}
	if strings.Join(got, ",") != "busy,offline" {
		t.Fatalf("agent events: %v", got)
	}
	// Coming back is announced again.
	e.expect(200, "POST", "/api/agents/heartbeat", hb)
	if items := e.expect(200, "GET", "/api/agents", nil)["items"].([]any); len(items) != 1 {
		t.Fatalf("back online: %v", items)
	}
}
