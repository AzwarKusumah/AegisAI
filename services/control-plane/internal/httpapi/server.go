package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/events"
)

type repository interface {
	Insert(context.Context, events.SecurityEvent) error
	List(context.Context, string, int) ([]events.SecurityEvent, error)
}
type Server struct { repository repository; agentToken string; adminToken string }

func New(repo repository, agentToken, adminToken string) http.Handler {
	s := &Server{repository: repo, agentToken: agentToken, adminToken: adminToken}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /api/v1/events", s.ingest)
	mux.HandleFunc("GET /api/v1/events", s.list)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
}
func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, "{"status":"ok"}")
}
func validBearer(r *http.Request, expected string) bool {
	if expected == "" { return false }
	provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	return len(provided) == len(expected) && subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func (s *Server) ingest(w http.ResponseWriter, r *http.Request) {
	if !validBearer(r, s.agentToken) { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var event events.SecurityEvent
	if err := decoder.Decode(&event); err != nil { http.Error(w, "invalid event payload", http.StatusBadRequest); return }
	if err := event.Validate(); err != nil { http.Error(w, "event validation failed", http.StatusUnprocessableEntity); return }
	if err := s.repository.Insert(r.Context(), event); err != nil { http.Error(w, "event storage failed", http.StatusInternalServerError); return }
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "event_id": event.EventID})
}
func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	if !validBearer(r, s.adminToken) { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	limit := 100
	if value := r.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 { http.Error(w, "invalid limit", http.StatusBadRequest); return }
		limit = parsed
		if limit > 500 { limit = 500 }
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	result, err := s.repository.List(ctx, r.URL.Query().Get("q"), limit)
	if err != nil && !errors.Is(err, context.Canceled) { http.Error(w, "event query failed", http.StatusInternalServerError); return }
	if result == nil { result = []events.SecurityEvent{} }
	writeJSON(w, http.StatusOK, map[string]any{"events": result})
}
