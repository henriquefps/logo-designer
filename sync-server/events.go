package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Live updates: GET /api/events is a Server-Sent Events stream that tells
// connected clients, as it happens, that a project, font, job or agent
// changed. It carries only {kind, id, updatedAt} (plus status for jobs and agents): a client that cares fetches the item
// with the usual GET (and its usual auth). The stream is a hint, never the
// source of truth: a client that misses events (offline, reconnecting, too
// slow) catches up with its normal list-and-compare sync.

// heartbeatEvery keeps idle connections open through Cloudflare Tunnel
// (which closes a response that sends nothing for 100 s) and lets clients
// notice a dead connection.
const heartbeatEvery = 25 * time.Second

// maxSubscribers bounds open streams (each one holds a connection).
const maxSubscribers = 256

// subscriberBuffer is how many events may wait for a slow client before it is
// dropped; it reconnects and resyncs.
const subscriberBuffer = 64

// writeGrace is how long one write to a stream may block before the client is
// considered gone.
const writeGrace = 30 * time.Second

// Event is one change notification.
type Event struct {
	Kind      string  `json:"kind"` // projects, fonts, jobs or agents
	ID        string  `json:"id"`   // an agentId for agents
	UpdatedAt float64 `json:"updatedAt"`
	// Status is set for jobs (queued, running, done, failed, cancelled) and
	// agents (online, busy, offline).
	Status string `json:"status,omitempty"`
}

// Broker fans events out to the open streams.
type Broker struct {
	mu     sync.Mutex
	subs   map[chan Event]struct{}
	closed bool
	done   chan struct{}
}

func NewBroker() *Broker {
	return &Broker{subs: map[chan Event]struct{}{}, done: make(chan struct{})}
}

// Subscribe registers a stream. ok is false when the broker is full or closed.
func (b *Broker) Subscribe() (ch chan Event, ok bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed || len(b.subs) >= maxSubscribers {
		return nil, false
	}
	ch = make(chan Event, subscriberBuffer)
	b.subs[ch] = struct{}{}
	return ch, true
}

// Unsubscribe removes a stream; safe to call twice.
func (b *Broker) Unsubscribe(ch chan Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.subs[ch]; ok {
		delete(b.subs, ch)
		close(ch)
	}
}

// Publish sends an event to every stream without blocking. A stream whose
// buffer is full is closed: its client reconnects and does a full sync.
func (b *Broker) Publish(ev Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.subs {
		select {
		case ch <- ev:
		default:
			delete(b.subs, ch)
			close(ch)
		}
	}
}

// Count returns the number of open streams.
func (b *Broker) Count() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.subs)
}

// Close ends every stream (on shutdown) and refuses new ones.
func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	b.closed = true
	close(b.done)
	for ch := range b.subs {
		delete(b.subs, ch)
		close(ch)
	}
}

// handleEvents serves the SSE stream. Format:
//
//	retry: 3000
//	event: ready
//	data: {"serverTime":1763550000000}
//
//	event: change
//	data: {"kind":"projects","id":"dabc","updatedAt":1763550001234}
//
//	: heartbeat
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	ch, ok := s.events.Subscribe()
	if !ok {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Too many open event streams, or the server is shutting down."})
		return
	}
	defer s.events.Unsubscribe(ch)

	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("X-Accel-Buffering", "no") // nginx and friends: do not buffer the stream
	w.WriteHeader(http.StatusOK)

	write := func(chunk string) bool {
		// The server's WriteTimeout is for ordinary requests; a stream renews its own deadline per write.
		_ = rc.SetWriteDeadline(time.Now().Add(writeGrace))
		if _, err := fmt.Fprint(w, chunk); err != nil {
			return false
		}
		return rc.Flush() == nil
	}
	if !write(fmt.Sprintf("retry: 3000\nevent: ready\ndata: {\"serverTime\":%d}\n\n", s.now().UnixMilli())) {
		return
	}
	s.log.Info("event stream opened", "remote", r.RemoteAddr, "streams", s.events.Count())

	tick := time.NewTicker(s.heartbeat)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-s.events.done:
			return
		case <-tick.C:
			if !write(": heartbeat\n\n") {
				return
			}
		case ev, open := <-ch:
			if !open {
				return // dropped as too slow, or shutting down
			}
			data, _ := json.Marshal(ev)
			if !write("event: change\ndata: " + string(data) + "\n\n") {
				return
			}
		}
	}
}
