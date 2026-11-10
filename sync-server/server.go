package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

// defaultMaxBodyMB bounds one PUT. A project with embedded reference images
// is far bigger than a text note; 64 MB covers even a multi-image board.
const defaultMaxBodyMB = 64

// Config holds the runtime settings resolved from flags and environment.
type Config struct {
	Port           string
	DataDir        string
	APIKey         string
	AllowedOrigins []string // empty means any origin
	MaxBodyMB      int      // largest accepted PUT body; projects with big images and fonts need room
}

// Server is the HTTP layer around a Store.
type Server struct {
	store   *Store
	maxBody int64
	apiKey  string
	origins map[string]bool // nil means any origin
	log     *slog.Logger
	now     func() time.Time
}

// NewServer builds the HTTP server state.
func NewServer(cfg Config, store *Store, logger *slog.Logger) *Server {
	mb := cfg.MaxBodyMB
	if mb <= 0 {
		mb = defaultMaxBodyMB
	}
	s := &Server{store: store, maxBody: int64(mb) << 20, apiKey: cfg.APIKey, log: logger, now: time.Now}
	if len(cfg.AllowedOrigins) > 0 {
		s.origins = map[string]bool{}
		for _, o := range cfg.AllowedOrigins {
			s.origins[o] = true
		}
	}
	return s
}

// Handler returns the full HTTP handler: CORS first (so even error responses
// are readable by the browser), then access control, then the routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/{kind}", s.requireAPIKey(s.handleList))
	mux.HandleFunc("GET /api/{kind}/{id}", s.requireAPIKey(s.handleGet))
	mux.HandleFunc("PUT /api/{kind}/{id}", s.requireAPIKey(s.handlePut))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found."})
	})
	return s.cors(s.restrictWithoutKey(mux))
}

// --- CORS ------------------------------------------------------------------
// Defaults match the cors() middleware the Node server used: any origin,
// common methods, and preflights echo the requested headers (which is how
// the Authorization header gets allowed).

const corsMethods = "GET,HEAD,PUT,PATCH,POST,DELETE"

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := false
		h := w.Header()
		if s.origins == nil {
			h.Set("Access-Control-Allow-Origin", "*")
			allowed = true
		} else {
			h.Add("Vary", "Origin")
			if origin != "" && s.origins[origin] {
				h.Set("Access-Control-Allow-Origin", origin)
				allowed = true
			}
		}

		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			if allowed {
				h.Set("Access-Control-Allow-Methods", corsMethods)
				if req := r.Header.Get("Access-Control-Request-Headers"); req != "" {
					h.Add("Vary", "Access-Control-Request-Headers")
					h.Set("Access-Control-Allow-Headers", req)
				}
				// Chrome asks this when a public HTTPS page calls a LAN address.
				if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
					h.Set("Access-Control-Allow-Private-Network", "true")
				}
				h.Set("Access-Control-Max-Age", "600")
			}
			h.Set("Content-Length", "0")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// --- Access control -----------------------------------------------------

// proxyHeaders are set by Cloudflare Tunnel and by reverse proxies. Their
// presence means the request did not come straight from the local network,
// even if the TCP peer (the tunnel connector) is on it.
var proxyHeaders = []string{"Cf-Connecting-Ip", "X-Forwarded-For", "X-Real-Ip", "Forwarded"}

var cgnat = netip.MustParsePrefix("100.64.0.0/10") // Tailscale and other CGNAT ranges

// isLocalAddr reports whether a remote address is loopback, private (RFC 1918
// or IPv6 ULA, which includes Tailscale's IPv6 range), link-local or CGNAT.
func isLocalAddr(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	if i := strings.IndexByte(host, '%'); i >= 0 { // fe80::1%en0
		host = host[:i]
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	ip = ip.Unmap()
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || cgnat.Contains(ip)
}

func viaProxy(r *http.Request) bool {
	for _, h := range proxyHeaders {
		if r.Header.Get(h) != "" {
			return true
		}
	}
	return false
}

// restrictWithoutKey is the secure default: with no API key configured, only
// requests that come directly from the local network are served. Anything
// arriving through a tunnel or proxy is refused, so exposing a keyless server
// to the internet by mistake does not expose your projects.
func (s *Server) restrictWithoutKey(next http.Handler) http.Handler {
	if s.apiKey != "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLocalAddr(r.RemoteAddr) || viaProxy(r) {
			s.log.Warn("refused request: no API key configured and request is not from the local network",
				"remote", r.RemoteAddr, "path", r.URL.Path, "proxied", viaProxy(r))
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "This sync server has no API key configured, so it only accepts requests from the local network. " +
					"Set SYNC_API_KEY on the server (and the same key in the app) to use it through a tunnel, proxy or the internet.",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAPIKey(next http.HandlerFunc) http.HandlerFunc {
	if s.apiKey == "" {
		return next
	}
	expected := sha256.Sum256([]byte(s.apiKey))
	return func(w http.ResponseWriter, r *http.Request) {
		provided, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok {
			provided = ""
		}
		// Hashing first makes the comparison constant-time regardless of the
		// provided key's length.
		got := sha256.Sum256([]byte(provided))
		if provided == "" || subtle.ConstantTimeCompare(got[:], expected[:]) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Missing or invalid API key."})
			return
		}
		next(w, r)
	}
}

// --- Routes ----------------------------------------------------------------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"projectCount": s.store.Count(KindProjects),
		"fontCount":    s.store.Count(KindFonts),
		"serverTime":   s.now().UnixMilli(),
	})
}

// handleList returns the metadata of every item of a kind, tombstones
// included. A client compares it with its own list and then pushes the items
// it has newer and pulls the ones the server has newer, one by one.
func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	kind := r.PathValue("kind")
	if !validKind(kind) {
		notFound(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": s.store.List(kind), "serverTime": s.now().UnixMilli()})
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	kind, id := r.PathValue("kind"), r.PathValue("id")
	raw, ok, err := s.store.Get(kind, id)
	if err != nil {
		s.log.Error("failed to read item", "kind", kind, "id", id, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read from the server's data folder."})
		return
	}
	if !ok {
		notFound(w)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(raw)
}

func (s *Server) handlePut(w http.ResponseWriter, r *http.Request) {
	kind, id := r.PathValue("kind"), r.PathValue("id")
	if !validKind(kind) {
		notFound(w)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, s.maxBody)
	var in Incoming
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{
				"error": "This item is larger than the server accepts (" + strconv.FormatInt(s.maxBody>>20, 10) + " MB). Raise it with --max-body-mb / MAX_BODY_MB.",
			})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Expected { name, createdAt, updatedAt, deleted, base, data } in the request body."})
		return
	}
	applied, meta, err := s.store.Put(kind, id, in)
	if errors.Is(err, ErrInvalid) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": strings.TrimPrefix(err.Error(), "invalid: ")})
		return
	}
	if err != nil {
		s.log.Error("failed to save item", "kind", kind, "id", id, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save on the server."})
		return
	}
	s.log.Info("put", "kind", kind, "id", id, "applied", applied, "deleted", meta.Deleted, "bytes", meta.Size)
	writeJSON(w, http.StatusOK, map[string]any{"applied": applied, "item": meta})
}

func notFound(w http.ResponseWriter) {
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found."})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		http.Error(w, `{"error":"encoding failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	w.Write(bytes.TrimRight(buf.Bytes(), "\n"))
}
