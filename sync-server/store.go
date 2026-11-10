package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Kinds are the two collections the server keeps. Each one is a folder of
// <id>.json files, one file per item, so a big project never has to be
// rewritten together with its neighbours.
const (
	KindProjects = "projects"
	KindFonts    = "fonts"
)

// maxConflictCopies is how many overwritten project versions are kept per
// project in conflicts/.
const maxConflictCopies = 10

// maxFutureSkew rejects items stamped further in the future than this: one
// device with a wrong clock would otherwise win every later merge.
const maxFutureSkew = 24 * time.Hour

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

func validKind(kind string) bool { return kind == KindProjects || kind == KindFonts }

// Meta is what the listing returns for an item: everything but the payload.
// UpdatedAt is a float64 because it is a JavaScript number (ms since the
// epoch); encoding/json formats it the way JavaScript does.
type Meta struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	CreatedAt float64 `json:"createdAt"`
	UpdatedAt float64 `json:"updatedAt"`
	Deleted   bool    `json:"deleted"`
	// Size is the length in bytes of the payload (0 for a tombstone).
	Size int `json:"size"`
}

// Record is one stored item: its Meta plus the opaque payload. The server
// never looks inside Data: a project document or a font, as the app wrote it.
// Deleted items keep only the Meta (a tombstone).
type Record struct {
	Meta
	Data json.RawMessage `json:"data,omitempty"`
}

// Incoming is the body of PUT /api/<kind>/<id>.
type Incoming struct {
	Name      string          `json:"name"`
	CreatedAt float64         `json:"createdAt"`
	UpdatedAt float64         `json:"updatedAt"`
	Deleted   bool            `json:"deleted"`
	Base      *float64        `json:"base"` // the updatedAt the client last synced for this id
	Data      json.RawMessage `json:"data"`
}

// ErrInvalid marks input the client got wrong (HTTP 400).
var ErrInvalid = errors.New("invalid")

// Store keeps both collections under one data directory.
type Store struct {
	dir string
	log *slog.Logger
	now func() time.Time
	col map[string]*collection
}

type collection struct {
	mu    sync.Mutex
	dir   string
	items map[string]Meta
}

// NewStore creates a store rooted at dataDir. Call Load to read existing data.
func NewStore(dataDir string, logger *slog.Logger) *Store {
	s := &Store{dir: dataDir, log: logger, now: time.Now, col: map[string]*collection{}}
	for _, k := range []string{KindProjects, KindFonts} {
		s.col[k] = &collection{dir: filepath.Join(dataDir, k), items: map[string]Meta{}}
	}
	return s
}

// Dir returns the data directory.
func (s *Store) Dir() string { return s.dir }

// Load reads the index of every collection. Files that cannot be parsed are
// copied aside (<file>.corrupt-<unix>) and skipped, so the next write can
// never destroy the only copy.
func (s *Store) Load() error {
	for _, kind := range []string{KindProjects, KindFonts} {
		c := s.col[kind]
		c.mu.Lock()
		err := s.loadCollection(kind, c)
		c.mu.Unlock()
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) loadCollection(kind string, c *collection) error {
	entries, err := os.ReadDir(c.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", c.dir, err)
	}
	c.items = map[string]Meta{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		path := filepath.Join(c.dir, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		var rec Record
		id := strings.TrimSuffix(name, ".json")
		if err := json.Unmarshal(raw, &rec); err != nil || rec.ID != id || !idPattern.MatchString(id) {
			backup := fmt.Sprintf("%s.corrupt-%d", path, s.now().Unix())
			if werr := os.Rename(path, backup); werr != nil {
				return fmt.Errorf("%s is unreadable and could not be moved aside: %w", path, werr)
			}
			s.log.Error("unreadable item moved aside", "file", path, "backup", backup, "err", err)
			continue
		}
		rec.Meta.Size = len(rec.Data)
		c.items[id] = rec.Meta
	}
	s.log.Info("loaded", "kind", kind, "count", len(c.items), "dir", c.dir)
	return nil
}

// Count returns the number of live items (tombstones excluded) in a kind.
func (s *Store) Count(kind string) int {
	c := s.col[kind]
	c.mu.Lock()
	defer c.mu.Unlock()
	n := 0
	for _, m := range c.items {
		if !m.Deleted {
			n++
		}
	}
	return n
}

// List returns the metadata of every item, tombstones included, oldest first.
func (s *Store) List(kind string) []Meta {
	c := s.col[kind]
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]Meta, 0, len(c.items))
	for _, m := range c.items {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt != out[j].UpdatedAt {
			return out[i].UpdatedAt < out[j].UpdatedAt
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Get returns the raw stored file of an item.
func (s *Store) Get(kind, id string) ([]byte, bool, error) {
	if !validKind(kind) || !idPattern.MatchString(id) {
		return nil, false, nil
	}
	c := s.col[kind]
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.items[id]; !ok {
		return nil, false, nil
	}
	raw, err := os.ReadFile(filepath.Join(c.dir, id+".json"))
	if err != nil {
		return nil, false, err
	}
	return raw, true, nil
}

// Put applies one revision last-write-wins: it is taken when the id is new or
// its updatedAt is strictly greater than the stored one. A project that is
// overwritten without the client having seen the stored version (base differs
// from the stored updatedAt) is first copied to conflicts/projects/<id>/, so
// nothing is ever lost silently. It returns whether the revision was applied
// and the Meta that is current afterwards.
func (s *Store) Put(kind, id string, in Incoming) (bool, Meta, error) {
	if !validKind(kind) || !idPattern.MatchString(id) {
		return false, Meta{}, fmt.Errorf("%w: bad id", ErrInvalid)
	}
	if math.IsNaN(in.UpdatedAt) || math.IsInf(in.UpdatedAt, 0) || in.UpdatedAt <= 0 {
		return false, Meta{}, fmt.Errorf("%w: updatedAt must be a positive number of milliseconds", ErrInvalid)
	}
	if in.UpdatedAt > float64(s.now().Add(maxFutureSkew).UnixMilli()) {
		return false, Meta{}, fmt.Errorf("%w: updatedAt is more than a day in the future, check this device's clock", ErrInvalid)
	}
	data := bytes.TrimSpace(in.Data)
	if in.Deleted {
		data = nil
	} else if len(data) == 0 || string(data) == "null" {
		return false, Meta{}, fmt.Errorf("%w: data is required unless deleted is true", ErrInvalid)
	}

	c := s.col[kind]
	c.mu.Lock()
	defer c.mu.Unlock()

	cur, exists := c.items[id]
	if exists && !(in.UpdatedAt > cur.UpdatedAt) {
		return false, cur, nil
	}
	if exists && !cur.Deleted && kind == KindProjects && (in.Base == nil || *in.Base != cur.UpdatedAt) {
		if err := s.archive(c, id, cur); err != nil {
			s.log.Warn("could not keep the overwritten version", "id", id, "err", err)
		}
	}

	rec := Record{
		Meta: Meta{ID: id, Name: in.Name, CreatedAt: in.CreatedAt, UpdatedAt: in.UpdatedAt, Deleted: in.Deleted, Size: len(data)},
		Data: json.RawMessage(data),
	}
	if err := writeJSONFile(filepath.Join(c.dir, id+".json"), rec); err != nil {
		return false, Meta{}, err
	}
	c.items[id] = rec.Meta
	return true, rec.Meta, nil
}

// archive copies the stored file of an item into the conflicts folder and
// keeps only the newest maxConflictCopies per project.
func (s *Store) archive(c *collection, id string, cur Meta) error {
	raw, err := os.ReadFile(filepath.Join(c.dir, id+".json"))
	if err != nil {
		return err
	}
	dir := filepath.Join(s.dir, "conflicts", KindProjects, id)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if err := writeFileAtomic(filepath.Join(dir, strconv.FormatInt(int64(cur.UpdatedAt), 10)+".json"), raw); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var names []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			names = append(names, e.Name())
		}
	}
	// File names are updatedAt in ms, so the oldest sort first once padded.
	sort.Slice(names, func(i, j int) bool {
		a, _ := strconv.ParseInt(strings.TrimSuffix(names[i], ".json"), 10, 64)
		b, _ := strconv.ParseInt(strings.TrimSuffix(names[j], ".json"), 10, 64)
		return a < b
	})
	for len(names) > maxConflictCopies {
		_ = os.Remove(filepath.Join(dir, names[0]))
		names = names[1:]
	}
	return nil
}

func writeJSONFile(path string, v any) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return err
	}
	return writeFileAtomic(path, bytes.TrimRight(buf.Bytes(), "\n"))
}

// writeFileAtomic writes a temp file in the same directory, syncs it and
// renames it over path, so a crash mid-write never leaves a half-written file.
// Files are private to the server's user: projects and fonts are the user's.
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return err
	}
	if d, err := os.Open(dir); err == nil {
		d.Sync() // best effort: make the rename durable; not supported everywhere
		d.Close()
	}
	return nil
}

// checkWritable fails early, with a useful hint, when the data directory
// cannot be written.
func checkWritable(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".write-test-*")
	if err != nil {
		return err
	}
	name := f.Name()
	f.Close()
	return os.Remove(name)
}
