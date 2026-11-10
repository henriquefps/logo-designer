package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func quietLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

const testNow = 1762500000000

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s := NewStore(t.TempDir(), quietLogger())
	s.now = func() time.Time { return time.UnixMilli(testNow) }
	if err := s.Load(); err != nil {
		t.Fatal(err)
	}
	return s
}

func put(t *testing.T, s *Store, kind, id string, updatedAt float64, data string) (bool, Meta) {
	t.Helper()
	applied, meta, err := s.Put(kind, id, Incoming{Name: "n-" + id, CreatedAt: 1, UpdatedAt: updatedAt, Data: json.RawMessage(data)})
	if err != nil {
		t.Fatal(err)
	}
	return applied, meta
}

func TestPutLastWriteWins(t *testing.T) {
	s := newTestStore(t)
	if ok, _ := put(t, s, KindProjects, "a", 100, `{"v":1}`); !ok {
		t.Fatal("first put must apply")
	}
	if ok, m := put(t, s, KindProjects, "a", 100, `{"v":"same time"}`); ok || m.UpdatedAt != 100 {
		t.Fatal("equal updatedAt must not replace the stored copy")
	}
	if ok, m := put(t, s, KindProjects, "a", 50, `{"v":"older"}`); ok || m.UpdatedAt != 100 {
		t.Fatal("older updatedAt must not replace the stored copy")
	}
	if ok, _ := put(t, s, KindProjects, "a", 200, `{"v":2}`); !ok {
		t.Fatal("newer updatedAt must apply")
	}
	raw, found, err := s.Get(KindProjects, "a")
	if err != nil || !found {
		t.Fatal(err, found)
	}
	var rec Record
	if err := json.Unmarshal(raw, &rec); err != nil {
		t.Fatal(err)
	}
	if string(rec.Data) != `{"v":2}` || rec.UpdatedAt != 200 || rec.Name != "n-a" {
		t.Fatalf("stored %s", raw)
	}
}

func TestTombstones(t *testing.T) {
	s := newTestStore(t)
	put(t, s, KindProjects, "a", 100, `{"big":"payload"}`)
	applied, m, err := s.Put(KindProjects, "a", Incoming{UpdatedAt: 200, Deleted: true})
	if err != nil || !applied || !m.Deleted || m.Size != 0 {
		t.Fatalf("tombstone: %v %v %+v", err, applied, m)
	}
	raw, _, _ := s.Get(KindProjects, "a")
	if strings.Contains(string(raw), "payload") {
		t.Fatalf("a tombstone must drop the payload: %s", raw)
	}
	if s.Count(KindProjects) != 0 || len(s.List(KindProjects)) != 1 {
		t.Fatal("tombstones are listed but not counted")
	}
	if ok, _ := put(t, s, KindProjects, "a", 150, `{"v":"edit before the delete"}`); ok {
		t.Fatal("an edit older than the delete must lose")
	}
	if ok, _ := put(t, s, KindProjects, "a", 300, `{"v":"edit after the delete"}`); !ok {
		t.Fatal("an edit newer than the delete must win")
	}
	if s.Count(KindProjects) != 1 {
		t.Fatal("resurrected project must count again")
	}
}

func TestValidation(t *testing.T) {
	s := newTestStore(t)
	bad := []struct {
		name string
		id   string
		in   Incoming
	}{
		{"path traversal", "../x", Incoming{UpdatedAt: 1, Data: json.RawMessage(`{}`)}},
		{"slash", "a/b", Incoming{UpdatedAt: 1, Data: json.RawMessage(`{}`)}},
		{"empty id", "", Incoming{UpdatedAt: 1, Data: json.RawMessage(`{}`)}},
		{"zero time", "a", Incoming{UpdatedAt: 0, Data: json.RawMessage(`{}`)}},
		{"future", "a", Incoming{UpdatedAt: testNow + float64(48*time.Hour/time.Millisecond), Data: json.RawMessage(`{}`)}},
		{"no data", "a", Incoming{UpdatedAt: 1}},
		{"null data", "a", Incoming{UpdatedAt: 1, Data: json.RawMessage(`null`)}},
	}
	for _, c := range bad {
		if _, _, err := s.Put(KindProjects, c.id, c.in); err == nil {
			t.Errorf("%s: expected an error", c.name)
		}
	}
	if _, _, err := s.Put("other", "a", Incoming{UpdatedAt: 1, Data: json.RawMessage(`{}`)}); err == nil {
		t.Error("unknown kind must fail")
	}
	if _, found, _ := s.Get(KindProjects, "../etc/passwd"); found {
		t.Error("Get must reject unsafe ids")
	}
}

func TestPersistenceOneFilePerItem(t *testing.T) {
	s := newTestStore(t)
	put(t, s, KindProjects, "p1", 100, `{"a":1}`)
	put(t, s, KindProjects, "p2", 110, `{"a":2}`)
	put(t, s, KindFonts, "f1", 120, `{"face":{},"data":"AAAA"}`)
	for _, f := range []string{"projects/p1.json", "projects/p2.json", "fonts/f1.json"} {
		info, err := os.Stat(filepath.Join(s.Dir(), f))
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0o077 != 0 {
			t.Errorf("%s is readable by others: %v", f, info.Mode())
		}
	}
	s2 := NewStore(s.Dir(), quietLogger())
	if err := s2.Load(); err != nil {
		t.Fatal(err)
	}
	l := s2.List(KindProjects)
	if len(l) != 2 || l[0].ID != "p1" || l[1].UpdatedAt != 110 || l[0].Size != len(`{"a":1}`) {
		t.Fatalf("reloaded %+v", l)
	}
	if s2.Count(KindFonts) != 1 {
		t.Fatal("fonts not reloaded")
	}
}

func TestCorruptFileIsMovedAside(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "projects"), 0o700); err != nil {
		t.Fatal(err)
	}
	bad := filepath.Join(dir, "projects", "x.json")
	os.WriteFile(bad, []byte("{not json"), 0o600)
	good, _ := json.Marshal(Record{Meta: Meta{ID: "ok", UpdatedAt: 5}, Data: json.RawMessage(`{}`)})
	os.WriteFile(filepath.Join(dir, "projects", "ok.json"), good, 0o600)
	s := NewStore(dir, quietLogger())
	if err := s.Load(); err != nil {
		t.Fatal(err)
	}
	if len(s.List(KindProjects)) != 1 {
		t.Fatal("the good project must load")
	}
	if _, err := os.Stat(bad); !os.IsNotExist(err) {
		t.Fatal("corrupt file should have been moved")
	}
	matches, _ := filepath.Glob(bad + ".corrupt-*")
	if len(matches) != 1 {
		t.Fatalf("expected a .corrupt backup, got %v", matches)
	}
}

func conflictFiles(t *testing.T, s *Store, id string) []string {
	t.Helper()
	m, _ := filepath.Glob(filepath.Join(s.Dir(), "conflicts", "projects", id, "*.json"))
	return m
}

func TestOverwriteWithoutBaseKeepsOldVersion(t *testing.T) {
	s := newTestStore(t)
	put(t, s, KindProjects, "a", 100, `{"v":"device A"}`)

	// Device B never saw version 100 (base nil): its edit wins by time, A's is archived.
	put(t, s, KindProjects, "a", 200, `{"v":"device B"}`)
	files := conflictFiles(t, s, "a")
	if len(files) != 1 || filepath.Base(files[0]) != "100.json" {
		t.Fatalf("expected the overwritten version to be archived, got %v", files)
	}
	raw, _ := os.ReadFile(files[0])
	if !strings.Contains(string(raw), "device A") {
		t.Fatalf("archived %s", raw)
	}

	// A normal edit (base == stored updatedAt) archives nothing.
	base := 200.0
	if _, _, err := s.Put(KindProjects, "a", Incoming{UpdatedAt: 300, Base: &base, Data: json.RawMessage(`{"v":3}`)}); err != nil {
		t.Fatal(err)
	}
	if n := len(conflictFiles(t, s, "a")); n != 1 {
		t.Fatalf("a based edit must not archive, got %d files", n)
	}
}

func TestConflictArchiveIsCapped(t *testing.T) {
	s := newTestStore(t)
	for i := 1; i <= maxConflictCopies+5; i++ {
		put(t, s, KindProjects, "a", float64(i*100), `{"v":1}`) // never based: each overwrite archives
	}
	if n := len(conflictFiles(t, s, "a")); n != maxConflictCopies {
		t.Fatalf("kept %d, want %d", n, maxConflictCopies)
	}
	// The oldest were dropped.
	if _, err := os.Stat(filepath.Join(s.Dir(), "conflicts", "projects", "a", "100.json")); !os.IsNotExist(err) {
		t.Fatal("oldest copy should be gone")
	}
}
