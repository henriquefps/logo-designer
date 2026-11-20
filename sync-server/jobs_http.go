package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

// The agent job queue over HTTP. Every route sits behind the usual API key
// (and, with no key configured, the local-network rule), exactly like fonts.

func (s *Server) jobRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/jobs", s.requireAPIKey(s.handleJobCreate))
	mux.HandleFunc("GET /api/jobs", s.requireAPIKey(s.handleJobList))
	mux.HandleFunc("GET /api/jobs/{id}", s.requireAPIKey(s.handleJobGet))
	mux.HandleFunc("GET /api/jobs/{id}/attachments/{name}", s.requireAPIKey(s.handleJobAttachment))
	mux.HandleFunc("POST /api/jobs/{id}/claim", s.requireAPIKey(s.handleJobClaim))
	mux.HandleFunc("POST /api/jobs/{id}/progress", s.requireAPIKey(s.handleJobProgress))
	mux.HandleFunc("POST /api/jobs/{id}/finish", s.requireAPIKey(s.handleJobFinish))
	mux.HandleFunc("POST /api/jobs/{id}/cancel", s.requireAPIKey(s.handleJobCancel))
	mux.HandleFunc("POST /api/agents/heartbeat", s.requireAPIKey(s.handleHeartbeat))
	mux.HandleFunc("GET /api/agents", s.requireAPIKey(s.handleAgents))
}

// decodeBody reads a JSON body of at most limit bytes into v and answers the
// error itself (413 or 400); it returns false when it did.
func (s *Server) decodeBody(w http.ResponseWriter, r *http.Request, limit int64, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			msg := "The request is larger than the server accepts."
			if limit >= 1<<20 {
				msg = "The request is larger than the server accepts (" + strconv.FormatInt(limit>>20, 10) + " MB). Raise it with --max-body-mb / MAX_BODY_MB."
			}
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": msg})
			return false
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "The request body is not the expected JSON."})
		return false
	}
	return true
}

// jobError maps a queue error to its status code.
func (s *Server) jobError(w http.ResponseWriter, what string, err error) {
	switch {
	case errors.Is(err, ErrInvalid):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": strings.TrimPrefix(err.Error(), "invalid: ")})
	case errors.Is(err, ErrNotFound):
		notFound(w)
	case errors.Is(err, ErrConflict):
		writeJSON(w, http.StatusConflict, map[string]string{"error": strings.TrimPrefix(err.Error(), "conflict: ")})
	case errors.Is(err, ErrTooBig):
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": strings.TrimPrefix(err.Error(), "too big: ")})
	default:
		s.log.Error("job request failed", "what", what, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed on the server."})
	}
}

func (s *Server) handleJobCreate(w http.ResponseWriter, r *http.Request) {
	var in JobIn
	// Base64 inflates attachments by a third; the decoded total is checked against MAX_BODY_MB in Create.
	if !s.decodeBody(w, r, s.maxBody+s.maxBody/3+maxInputBytes, &in) {
		return
	}
	j, err := s.jobs.Create(in)
	if err != nil {
		s.jobError(w, "create", err)
		return
	}
	s.log.Info("job created", "id", j.ID, "type", j.Type, "project", j.ProjectID, "attachments", len(j.Attachments))
	writeJSON(w, http.StatusCreated, j)
}

func (s *Server) handleJobList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	active := q.Get("active") == "1" || q.Get("active") == "true"
	writeJSON(w, http.StatusOK, map[string]any{"items": s.jobs.List(active, q.Get("projectId")), "serverTime": s.now().UnixMilli()})
}

func (s *Server) handleJobGet(w http.ResponseWriter, r *http.Request) {
	j, err := s.jobs.Get(r.PathValue("id"))
	if err != nil {
		s.jobError(w, "get", err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

func (s *Server) handleJobAttachment(w http.ResponseWriter, r *http.Request) {
	data, mime, err := s.jobs.Attachment(r.PathValue("id"), r.PathValue("name"))
	if err != nil {
		s.jobError(w, "attachment", err)
		return
	}
	h := w.Header()
	h.Set("Content-Type", mime)
	h.Set("Content-Length", strconv.Itoa(len(data)))
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Disposition", "attachment")
	h.Set("Cache-Control", "private, no-store")
	w.Write(data)
}

type agentBody struct {
	AgentID string `json:"agentId"`
}

func (s *Server) handleJobClaim(w http.ResponseWriter, r *http.Request) {
	var in agentBody
	if !s.decodeBody(w, r, maxSmallBody, &in) {
		return
	}
	j, err := s.jobs.Claim(r.PathValue("id"), in.AgentID)
	if err != nil {
		s.jobError(w, "claim", err)
		return
	}
	s.log.Info("job claimed", "id", j.ID, "agent", in.AgentID)
	writeJSON(w, http.StatusOK, j)
}

func (s *Server) handleJobProgress(w http.ResponseWriter, r *http.Request) {
	var in struct {
		AgentID string `json:"agentId"`
		Message string `json:"message"`
		Stage   string `json:"stage"`
	}
	if !s.decodeBody(w, r, maxSmallBody, &in) {
		return
	}
	j, err := s.jobs.Progress(r.PathValue("id"), in.AgentID, in.Message, in.Stage)
	if err != nil {
		s.jobError(w, "progress", err)
		return
	}
	// The bridge learns about a cancel from this answer, without polling.
	writeJSON(w, http.StatusOK, map[string]any{"status": j.Status, "cancelRequested": j.CancelRequested, "progressCount": len(j.Progress)})
}

func (s *Server) handleJobFinish(w http.ResponseWriter, r *http.Request) {
	var in struct {
		AgentID string `json:"agentId"`
		Status  string `json:"status"`
		Summary string `json:"summary"`
		Error   string `json:"error"`
	}
	if !s.decodeBody(w, r, maxSmallBody, &in) {
		return
	}
	j, err := s.jobs.Finish(r.PathValue("id"), in.AgentID, in.Status, in.Summary, in.Error)
	if err != nil {
		s.jobError(w, "finish", err)
		return
	}
	s.log.Info("job finished", "id", j.ID, "status", j.Status, "agent", in.AgentID)
	writeJSON(w, http.StatusOK, j)
}

func (s *Server) handleJobCancel(w http.ResponseWriter, r *http.Request) {
	j, err := s.jobs.Cancel(r.PathValue("id"))
	if err != nil {
		s.jobError(w, "cancel", err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

func (s *Server) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	var in AgentIn
	if !s.decodeBody(w, r, maxSmallBody, &in) {
		return
	}
	if err := s.jobs.Heartbeat(in); err != nil {
		s.jobError(w, "heartbeat", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "serverTime": s.now().UnixMilli()})
}

func (s *Server) handleAgents(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": s.jobs.Agents(), "serverTime": s.now().UnixMilli()})
}
