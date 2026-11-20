package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Jobs (agent requests): a small queue next to projects and fonts. The app
// creates a job ("turn this screenshot into a wireframe"), an agent bridge
// (`designer agent`, running on the user's own machine) claims it, reports
// progress and finishes it. Jobs are private like fonts: same auth, files 0600.
// Each job is data/jobs/<id>.json; its attachments live in data/jobs/<id>/.

const (
	JobQueued    = "queued"
	JobRunning   = "running"
	JobDone      = "done"
	JobFailed    = "failed"
	JobCancelled = "cancelled"
)

const (
	maxJobsKept       = 200              // retention: the newest N jobs (finished ones beyond that are deleted)
	maxProgressKept   = 200              // progress entries per job (the newest are kept)
	maxAttachments    = 8                // per job
	maxMessageLen     = 500              // one progress message, in characters
	maxSummaryLen     = 8000             // summary / error text
	maxInputBytes     = 64 << 10         // the input object of a job
	maxSmallBody      = 64 << 10         // every job endpoint but create
	attachmentTTL     = 24 * time.Hour   // attachments are deleted this long after a job finishes
	agentDeadAfter    = 2 * time.Minute  // a running job whose agent is silent this long fails
	agentOnlineWindow = 45 * time.Second // GET /api/agents lists agents seen within this
	agentForgetAfter  = 10 * time.Minute // heartbeat records older than this are dropped
	sweepEvery        = 15 * time.Second
)

var (
	attachmentNamePattern = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$`)
	mimePattern           = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9.+-]{0,60}/[A-Za-z0-9][A-Za-z0-9.+-]{0,60}$`)
)

var jobTypes = map[string]bool{"screenshot": true, "next-screen": true, "adapt": true, "request": true}

// Errors a handler maps to a status code (ErrInvalid is 400).
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
	ErrTooBig   = errors.New("too big")
)

// JobAttachment is the metadata of one stored attachment.
type JobAttachment struct {
	Name string `json:"name"`
	Mime string `json:"mime"`
	Size int    `json:"size"`
}

// JobProgress is one progress line.
type JobProgress struct {
	At      float64 `json:"at"`
	Message string  `json:"message"`
	Stage   string  `json:"stage,omitempty"`
}

// jobBase is everything but the progress log: what the listing returns.
type jobBase struct {
	ID                 string          `json:"id"`
	Type               string          `json:"type"`
	ProjectID          string          `json:"projectId"`
	ScreenID           string          `json:"screenId,omitempty"`
	FrameID            string          `json:"frameId,omitempty"`
	Input              json.RawMessage `json:"input"`
	Attachments        []JobAttachment `json:"attachments"`
	Status             string          `json:"status"`
	CreatedAt          float64         `json:"createdAt"`
	UpdatedAt          float64         `json:"updatedAt"`
	StartedAt          *float64        `json:"startedAt,omitempty"`
	FinishedAt         *float64        `json:"finishedAt,omitempty"`
	AgentID            string          `json:"agentId,omitempty"`
	CancelRequested    bool            `json:"cancelRequested"`
	Summary            string          `json:"summary,omitempty"`
	Error              string          `json:"error,omitempty"`
	AttachmentsDeleted bool            `json:"attachmentsDeleted,omitempty"`
}

// Job is a stored job: the base plus its progress log.
type Job struct {
	jobBase
	Progress []JobProgress `json:"progress"`
}

// JobMeta is the listing entry: no progress log, but its size and last line.
type JobMeta struct {
	jobBase
	ProgressCount int          `json:"progressCount"`
	LastProgress  *JobProgress `json:"lastProgress,omitempty"`
}

func (j *Job) meta() JobMeta {
	m := JobMeta{jobBase: j.jobBase, ProgressCount: len(j.Progress)}
	m.Attachments = append([]JobAttachment{}, j.Attachments...)
	if n := len(j.Progress); n > 0 {
		last := j.Progress[n-1]
		m.LastProgress = &last
	}
	return m
}

func (j *Job) clone() Job {
	c := *j
	c.Attachments = append([]JobAttachment{}, j.Attachments...)
	c.Progress = append([]JobProgress{}, j.Progress...)
	return c
}

// AttachmentIn is one attachment of a create request.
type AttachmentIn struct {
	Name       string `json:"name"`
	Mime       string `json:"mime"`
	DataBase64 string `json:"dataBase64"`
}

// JobIn is the body of POST /api/jobs.
type JobIn struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	ProjectID   string          `json:"projectId"`
	ScreenID    string          `json:"screenId"`
	FrameID     string          `json:"frameId"`
	Input       json.RawMessage `json:"input"`
	Attachments []AttachmentIn  `json:"attachments"`
}

// Agent is the presence record of one bridge.
type Agent struct {
	AgentID  string  `json:"agentId"`
	Name     string  `json:"name"`
	Host     string  `json:"host"`
	Version  string  `json:"version"`
	Busy     bool    `json:"busy"`
	JobID    string  `json:"jobId,omitempty"`
	LastSeen float64 `json:"lastSeen"`

	announced bool // an "online" event went out and no "offline" yet
}

// AgentIn is the body of POST /api/agents/heartbeat.
type AgentIn struct {
	AgentID string `json:"agentId"`
	Name    string `json:"name"`
	Host    string `json:"host"`
	Version string `json:"version"`
	Busy    bool   `json:"busy"`
	JobID   string `json:"jobId"`
	// Status is "online" (the default) or "offline": the goodbye a bridge
	// sends when it stops cleanly, so the app does not wait for the window.
	Status string `json:"status"`
}

// Jobs keeps the queue and the agents' presence. One mutex guards both, which
// is what makes claim atomic: the status check and the change happen together.
type Jobs struct {
	dir     string // <data>/jobs
	log     *slog.Logger
	now     func() time.Time
	maxBody int64
	publish func(Event)

	mu      sync.Mutex
	jobs    map[string]*Job
	agents  map[string]*Agent
	contact map[string]time.Time // agentId → last heartbeat, claim or progress: the dead-agent rule
}

// NewJobs creates the queue rooted at <dataDir>/jobs. Call Load to read it.
func NewJobs(dataDir string, logger *slog.Logger, now func() time.Time, maxBody int64, publish func(Event)) *Jobs {
	return &Jobs{
		dir: filepath.Join(dataDir, "jobs"), log: logger, now: now, maxBody: maxBody, publish: publish,
		jobs: map[string]*Job{}, agents: map[string]*Agent{}, contact: map[string]time.Time{},
	}
}

func nowMs(t time.Time) float64 { return float64(t.UnixMilli()) }

// Load reads the stored jobs. Unreadable files are copied aside, like the
// store does. A job that was running keeps running: its agent gets the
// two-minute grace counted from now, so a server restart does not fail it.
func (q *Jobs) Load() error {
	q.mu.Lock()
	defer q.mu.Unlock()
	entries, err := os.ReadDir(q.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", q.dir, err)
	}
	now := q.now()
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		path := filepath.Join(q.dir, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		var j Job
		id := strings.TrimSuffix(name, ".json")
		if err := json.Unmarshal(raw, &j); err != nil || j.ID != id || !idPattern.MatchString(id) {
			backup := fmt.Sprintf("%s.corrupt-%d", path, now.Unix())
			if werr := os.Rename(path, backup); werr != nil {
				return fmt.Errorf("%s is unreadable and could not be moved aside: %w", path, werr)
			}
			q.log.Error("unreadable job moved aside", "file", path, "backup", backup, "err", err)
			continue
		}
		q.jobs[id] = &j
		if j.Status == JobRunning && j.AgentID != "" {
			q.contact[j.AgentID] = now
		}
	}
	q.log.Info("loaded", "kind", "jobs", "count", len(q.jobs), "dir", q.dir)
	return nil
}

func (q *Jobs) jobPath(id string) string { return filepath.Join(q.dir, id+".json") }
func (q *Jobs) attDir(id string) string  { return filepath.Join(q.dir, id) }

func (q *Jobs) save(j *Job) error { return writeJSONFile(q.jobPath(j.ID), j) }

func jobEvent(j *Job) Event {
	return Event{Kind: "jobs", ID: j.ID, Status: j.Status, UpdatedAt: j.UpdatedAt}
}

func isTerminal(status string) bool {
	return status == JobDone || status == JobFailed || status == JobCancelled
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// validateInput checks the fields each job type needs; the server stays
// permissive about everything else in input (the bridge owns its meaning).
func validateInput(typ string, input json.RawMessage, attachments []AttachmentIn) error {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(input, &obj); err != nil || obj == nil {
		return fmt.Errorf("%w: input must be a JSON object", ErrInvalid)
	}
	str := func(key string) bool {
		var s string
		return json.Unmarshal(obj[key], &s) == nil && strings.TrimSpace(s) != ""
	}
	need := func(keys ...string) error {
		for _, k := range keys {
			if !str(k) {
				return fmt.Errorf("%w: input.%s is required for a %s job", ErrInvalid, k, typ)
			}
		}
		return nil
	}
	switch typ {
	case "screenshot":
		if err := need("platform"); err != nil {
			return err
		}
		if len(attachments) != 1 || !strings.HasPrefix(strings.ToLower(attachments[0].Mime), "image/") {
			return fmt.Errorf("%w: a screenshot job needs exactly one image attachment", ErrInvalid)
		}
	case "next-screen":
		if err := need("fromScreenId", "fromNodeId", "label", "platform"); err != nil {
			return err
		}
		var at struct{ X, Y *float64 }
		if json.Unmarshal(obj["at"], &at) != nil || at.X == nil || at.Y == nil {
			return fmt.Errorf("%w: input.at must be {x, y} for a next-screen job", ErrInvalid)
		}
	case "adapt":
		return need("screenId", "fromPlatform", "toPlatform")
	case "request":
		return need("text")
	}
	return nil
}

// Create stores a new queued job and its attachments.
func (q *Jobs) Create(in JobIn) (Job, error) {
	if !idPattern.MatchString(in.ID) {
		return Job{}, fmt.Errorf("%w: id must be 1-80 letters, digits, - or _", ErrInvalid)
	}
	if !jobTypes[in.Type] {
		return Job{}, fmt.Errorf("%w: type must be screenshot, next-screen, adapt or request", ErrInvalid)
	}
	if !idPattern.MatchString(in.ProjectID) {
		return Job{}, fmt.Errorf("%w: projectId is required", ErrInvalid)
	}
	for _, v := range []string{in.ScreenID, in.FrameID} {
		if len(v) > 200 {
			return Job{}, fmt.Errorf("%w: screenId / frameId are too long", ErrInvalid)
		}
	}
	input := bytes.TrimSpace(in.Input)
	if len(input) > maxInputBytes {
		return Job{}, fmt.Errorf("%w: input is larger than %d KB", ErrInvalid, maxInputBytes>>10)
	}
	if len(in.Attachments) > maxAttachments {
		return Job{}, fmt.Errorf("%w: at most %d attachments", ErrInvalid, maxAttachments)
	}
	if err := validateInput(in.Type, input, in.Attachments); err != nil {
		return Job{}, err
	}

	var files [][]byte
	var metas []JobAttachment
	seen := map[string]bool{}
	var total int64
	for _, a := range in.Attachments {
		if !attachmentNamePattern.MatchString(a.Name) || seen[strings.ToLower(a.Name)] {
			return Job{}, fmt.Errorf("%w: attachment names must be unique, up to 100 letters, digits, . - _ (%q)", ErrInvalid, a.Name)
		}
		seen[strings.ToLower(a.Name)] = true
		if !mimePattern.MatchString(a.Mime) {
			return Job{}, fmt.Errorf("%w: attachment %q needs a mime type like image/png", ErrInvalid, a.Name)
		}
		data, err := base64.StdEncoding.DecodeString(a.DataBase64)
		if err != nil || len(data) == 0 {
			return Job{}, fmt.Errorf("%w: attachment %q: dataBase64 must be non-empty base64", ErrInvalid, a.Name)
		}
		total += int64(len(data))
		if total > q.maxBody {
			return Job{}, fmt.Errorf("%w: attachments are larger than the server accepts (%d MB)", ErrTooBig, q.maxBody>>20)
		}
		files = append(files, data)
		metas = append(metas, JobAttachment{Name: a.Name, Mime: strings.ToLower(a.Mime), Size: len(data)})
	}

	q.mu.Lock()
	if _, exists := q.jobs[in.ID]; exists {
		q.mu.Unlock()
		return Job{}, fmt.Errorf("%w: a job with this id already exists", ErrConflict)
	}
	now := nowMs(q.now())
	j := &Job{
		jobBase: jobBase{
			ID: in.ID, Type: in.Type, ProjectID: in.ProjectID, ScreenID: in.ScreenID, FrameID: in.FrameID,
			Input: json.RawMessage(input), Attachments: metas, Status: JobQueued, CreatedAt: now, UpdatedAt: now,
		},
		Progress: []JobProgress{},
	}
	if j.Attachments == nil {
		j.Attachments = []JobAttachment{}
	}
	var werr error
	for i, a := range metas {
		if werr = writeFileAtomic(filepath.Join(q.attDir(in.ID), a.Name), files[i]); werr != nil {
			break
		}
	}
	if werr == nil {
		werr = q.save(j)
	}
	if werr != nil {
		os.RemoveAll(q.attDir(in.ID))
		os.Remove(q.jobPath(in.ID))
		q.mu.Unlock()
		return Job{}, werr
	}
	q.jobs[in.ID] = j
	events := append(q.sweepLocked(), jobEvent(j))
	out := j.clone()
	q.mu.Unlock()
	q.emit(events)
	return out, nil
}

func (q *Jobs) emit(events []Event) {
	for _, ev := range events {
		q.publish(ev)
	}
}

// List returns job metadata, newest first. active keeps queued and running
// jobs; projectID (when not empty) keeps one project's.
func (q *Jobs) List(active bool, projectID string) []JobMeta {
	q.mu.Lock()
	events := q.sweepLocked()
	all := make([]*Job, 0, len(q.jobs))
	for _, j := range q.jobs {
		if active && isTerminal(j.Status) {
			continue
		}
		if projectID != "" && j.ProjectID != projectID {
			continue
		}
		all = append(all, j)
	}
	sort.Slice(all, func(a, b int) bool {
		if all[a].CreatedAt != all[b].CreatedAt {
			return all[a].CreatedAt > all[b].CreatedAt
		}
		return all[a].ID > all[b].ID
	})
	out := make([]JobMeta, len(all))
	for i, j := range all {
		out[i] = j.meta()
	}
	q.mu.Unlock()
	q.emit(events)
	return out
}

// Get returns one job in full.
func (q *Jobs) Get(id string) (Job, error) {
	q.mu.Lock()
	events := q.sweepLocked()
	j, ok := q.jobs[id]
	var out Job
	if ok {
		out = j.clone()
	}
	q.mu.Unlock()
	q.emit(events)
	if !ok {
		return Job{}, ErrNotFound
	}
	return out, nil
}

// Attachment returns the bytes and mime type of one attachment.
func (q *Jobs) Attachment(id, name string) ([]byte, string, error) {
	q.mu.Lock()
	events := q.sweepLocked()
	j, ok := q.jobs[id]
	var meta *JobAttachment
	deleted := false
	if ok {
		deleted = j.AttachmentsDeleted
		for i := range j.Attachments {
			if j.Attachments[i].Name == name {
				meta = &j.Attachments[i]
			}
		}
	}
	q.mu.Unlock()
	q.emit(events)
	if !ok || meta == nil || deleted || !attachmentNamePattern.MatchString(name) {
		return nil, "", ErrNotFound
	}
	data, err := os.ReadFile(filepath.Join(q.attDir(id), name))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", err
	}
	return data, meta.Mime, nil
}

// mutate runs fn on a job under the lock, persists it when fn reports a
// change and publishes the events.
func (q *Jobs) mutate(id string, fn func(j *Job, now float64) (changed bool, err error)) (Job, error) {
	q.mu.Lock()
	events := q.sweepLocked()
	j, ok := q.jobs[id]
	if !ok {
		q.mu.Unlock()
		q.emit(events)
		return Job{}, ErrNotFound
	}
	now := nowMs(q.now())
	snapshot := j.clone()
	changed, err := fn(j, now)
	if err == nil && changed {
		j.UpdatedAt = now
		if serr := q.save(j); serr != nil {
			*j = snapshot
			err = serr
		} else {
			events = append(events, jobEvent(j))
		}
	}
	out := j.clone()
	q.mu.Unlock()
	q.emit(events)
	if err != nil {
		return Job{}, err
	}
	return out, nil
}

func validAgentID(id string) error {
	if !idPattern.MatchString(id) {
		return fmt.Errorf("%w: agentId must be 1-80 letters, digits, - or _", ErrInvalid)
	}
	return nil
}

// Claim atomically moves a queued job to running for agentID. Of any number
// of simultaneous claims exactly one succeeds; the others get ErrConflict.
func (q *Jobs) Claim(id, agentID string) (Job, error) {
	if err := validAgentID(agentID); err != nil {
		return Job{}, err
	}
	return q.mutate(id, func(j *Job, now float64) (bool, error) {
		if j.Status != JobQueued {
			return false, fmt.Errorf("%w: the job is %s, not queued", ErrConflict, j.Status)
		}
		j.Status = JobRunning
		j.AgentID = agentID
		j.StartedAt = &now
		q.contact[agentID] = q.now()
		return true, nil
	})
}

// owned checks that the job runs and belongs to agentID.
func owned(j *Job, agentID string) error {
	if j.Status != JobRunning {
		return fmt.Errorf("%w: the job is %s, not running", ErrConflict, j.Status)
	}
	if j.AgentID != agentID {
		return fmt.Errorf("%w: the job is running on another agent", ErrConflict)
	}
	return nil
}

// Progress appends one line to a running job's log (the newest 200 are
// kept) and reports whether a cancel was requested.
func (q *Jobs) Progress(id, agentID, message, stage string) (Job, error) {
	if err := validAgentID(agentID); err != nil {
		return Job{}, err
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return Job{}, fmt.Errorf("%w: message is required", ErrInvalid)
	}
	return q.mutate(id, func(j *Job, now float64) (bool, error) {
		if err := owned(j, agentID); err != nil {
			return false, err
		}
		j.Progress = append(j.Progress, JobProgress{At: now, Message: truncate(message, maxMessageLen), Stage: truncate(strings.TrimSpace(stage), 60)})
		if over := len(j.Progress) - maxProgressKept; over > 0 {
			j.Progress = append([]JobProgress{}, j.Progress[over:]...)
		}
		q.contact[agentID] = q.now()
		return true, nil
	})
}

// Finish ends a running job as done, failed or cancelled.
func (q *Jobs) Finish(id, agentID, status, summary, errText string) (Job, error) {
	if err := validAgentID(agentID); err != nil {
		return Job{}, err
	}
	if status != JobDone && status != JobFailed && status != JobCancelled {
		return Job{}, fmt.Errorf("%w: status must be done, failed or cancelled", ErrInvalid)
	}
	return q.mutate(id, func(j *Job, now float64) (bool, error) {
		if err := owned(j, agentID); err != nil {
			return false, err
		}
		j.Status = status
		j.FinishedAt = &now
		j.Summary = truncate(summary, maxSummaryLen)
		j.Error = truncate(errText, maxSummaryLen)
		return true, nil
	})
}

// Cancel is the app's request: a queued job is cancelled at once, a running
// one gets cancelRequested (the bridge finishes it as cancelled).
func (q *Jobs) Cancel(id string) (Job, error) {
	return q.mutate(id, func(j *Job, now float64) (bool, error) {
		switch j.Status {
		case JobQueued:
			j.Status = JobCancelled
			j.CancelRequested = true
			j.FinishedAt = &now
			return true, nil
		case JobRunning:
			if j.CancelRequested {
				return false, nil
			}
			j.CancelRequested = true
			return true, nil
		}
		return false, fmt.Errorf("%w: the job already %s", ErrConflict, j.Status)
	})
}

// Heartbeat records an agent's presence and reports whether it changed
// something worth announcing (a new or returning agent, a busy or job change).
func (q *Jobs) Heartbeat(in AgentIn) error {
	if err := validAgentID(in.AgentID); err != nil {
		return err
	}
	if in.JobID != "" && !idPattern.MatchString(in.JobID) {
		return fmt.Errorf("%w: jobId is invalid", ErrInvalid)
	}
	if in.Status != "" && in.Status != "online" && in.Status != "offline" {
		return fmt.Errorf("%w: status must be online or offline", ErrInvalid)
	}
	q.mu.Lock()
	events := q.sweepLocked()
	now := q.now()
	if in.Status == "offline" {
		// Goodbye: not listed from now on, announced at once. An agent the
		// server does not know (or already announced offline) changes nothing.
		if a, known := q.agents[in.AgentID]; known && a.announced {
			a.announced = false
			a.Busy, a.JobID = false, ""
			a.LastSeen = nowMs(now.Add(-agentOnlineWindow))
			ev := agentEvent(a, "offline")
			ev.UpdatedAt = nowMs(now)
			events = append(events, ev)
		}
		q.mu.Unlock()
		q.emit(events)
		return nil
	}
	a, known := q.agents[in.AgentID]
	if !known {
		a = &Agent{AgentID: in.AgentID}
		q.agents[in.AgentID] = a
	}
	name, host, version := truncate(strings.TrimSpace(in.Name), 80), truncate(strings.TrimSpace(in.Host), 120), truncate(strings.TrimSpace(in.Version), 40)
	changed := !a.announced || a.Name != name || a.Host != host || a.Version != version || a.Busy != in.Busy || a.JobID != in.JobID
	a.Name, a.Host, a.Version, a.Busy, a.JobID = name, host, version, in.Busy, in.JobID
	a.LastSeen = nowMs(now)
	a.announced = true
	q.contact[in.AgentID] = now
	if changed {
		events = append(events, agentEvent(a, "online"))
	}
	q.mu.Unlock()
	q.emit(events)
	return nil
}

func agentEvent(a *Agent, status string) Event {
	if status == "online" && a.Busy {
		status = "busy"
	}
	return Event{Kind: "agents", ID: a.AgentID, Status: status, UpdatedAt: a.LastSeen}
}

// Agents lists the agents seen in the last 45 seconds, most recent first.
func (q *Jobs) Agents() []Agent {
	q.mu.Lock()
	events := q.sweepLocked()
	cutoff := nowMs(q.now().Add(-agentOnlineWindow))
	out := []Agent{}
	for _, a := range q.agents {
		if a.LastSeen > cutoff {
			out = append(out, *a)
		}
	}
	q.mu.Unlock()
	q.emit(events)
	sort.Slice(out, func(i, j int) bool {
		if out[i].LastSeen != out[j].LastSeen {
			return out[i].LastSeen > out[j].LastSeen
		}
		return out[i].AgentID < out[j].AgentID
	})
	return out
}

// Sweep applies the time-based rules now (the server also runs it every
// 15 s, and every request runs it first, so a clock injected in tests is
// enough to test them).
func (q *Jobs) Sweep() {
	q.mu.Lock()
	events := q.sweepLocked()
	q.mu.Unlock()
	q.emit(events)
}

// sweepLocked runs the time rules and returns the events to publish after
// the lock is released: running jobs of silent agents fail, attachments of
// jobs finished 24 h ago are deleted, jobs beyond the newest 200 are
// deleted, agents that stopped heartbeating are announced offline.
func (q *Jobs) sweepLocked() []Event {
	var events []Event
	now := q.now()
	nowF := nowMs(now)

	for _, a := range q.agents {
		if a.announced && a.LastSeen <= nowMs(now.Add(-agentOnlineWindow)) {
			a.announced = false
			events = append(events, agentEvent(a, "offline"))
		}
		if a.LastSeen <= nowMs(now.Add(-agentForgetAfter)) {
			delete(q.agents, a.AgentID)
		}
	}

	for _, j := range q.jobs {
		switch {
		case j.Status == JobRunning:
			last := q.contact[j.AgentID]
			if j.StartedAt != nil && time.UnixMilli(int64(*j.StartedAt)).After(last) {
				last = time.UnixMilli(int64(*j.StartedAt))
			}
			if now.Sub(last) > agentDeadAfter {
				j.Status = JobFailed
				j.Error = "agent went away"
				j.FinishedAt = &nowF
				j.UpdatedAt = nowF
				if err := q.save(j); err != nil {
					q.log.Error("failed to save job", "id", j.ID, "err", err)
				}
				events = append(events, jobEvent(j))
			}
		case isTerminal(j.Status) && !j.AttachmentsDeleted && j.FinishedAt != nil &&
			now.Sub(time.UnixMilli(int64(*j.FinishedAt))) >= attachmentTTL:
			if err := os.RemoveAll(q.attDir(j.ID)); err != nil {
				q.log.Error("failed to delete job attachments", "id", j.ID, "err", err)
				continue
			}
			j.AttachmentsDeleted = true
			if err := q.save(j); err != nil {
				q.log.Error("failed to save job", "id", j.ID, "err", err)
			}
		}
	}

	if len(q.jobs) > maxJobsKept {
		all := make([]*Job, 0, len(q.jobs))
		for _, j := range q.jobs {
			all = append(all, j)
		}
		sort.Slice(all, func(a, b int) bool {
			if all[a].CreatedAt != all[b].CreatedAt {
				return all[a].CreatedAt > all[b].CreatedAt
			}
			return all[a].ID > all[b].ID
		})
		for _, j := range all[maxJobsKept:] {
			if !isTerminal(j.Status) {
				continue // never drop work that is still waiting or running
			}
			os.RemoveAll(q.attDir(j.ID))
			if err := os.Remove(q.jobPath(j.ID)); err != nil && !errors.Is(err, fs.ErrNotExist) {
				q.log.Error("failed to delete old job", "id", j.ID, "err", err)
				continue
			}
			delete(q.jobs, j.ID)
		}
	}
	return events
}
