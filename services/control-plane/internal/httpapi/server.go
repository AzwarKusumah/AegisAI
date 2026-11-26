package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/events"
	controlstore "github.com/AzwarKusumah/AegisAI/services/control-plane/internal/store"
)

type repository interface {
	Insert(context.Context, events.SecurityEvent) error
	List(context.Context, string, int) ([]events.SecurityEvent, error)
}
type deviceRepository interface {
	CreatePairingCode(context.Context, string, time.Time) error
	EnrollDevice(context.Context, string, events.DeviceRecord, string) error
	DeviceForToken(context.Context, string) (string, string, error)
	ListDevices(context.Context) ([]events.DeviceRecord, error)
	RevokeDevice(context.Context, string) error
	TouchDevice(context.Context, string) error
}
type Server struct { repository repository; agentToken string; adminToken string }

func New(repo repository, agentToken, adminToken string) http.Handler {
	server := &Server{repository: repo, agentToken: agentToken, adminToken: adminToken}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("POST /api/v1/events", server.ingest)
	mux.HandleFunc("GET /api/v1/events", server.list)
	mux.HandleFunc("POST /api/v1/pairing-codes", server.createPairingCode)
	mux.HandleFunc("POST /api/v1/agents/enroll", server.enrollAgent)
	mux.HandleFunc("GET /api/v1/devices", server.listDevices)
	mux.HandleFunc("DELETE /api/v1/devices/{deviceID}", server.revokeDevice)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		mux.ServeHTTP(w, r)
	})
}
func (s *Server) deviceStore() (deviceRepository, bool) { value, ok := s.repository.(deviceRepository); return value, ok }
func (s *Server) health(w http.ResponseWriter, _ *http.Request) { writeJSON(w, http.StatusOK, map[string]string{"status": "ok"}) }
func validBearer(r *http.Request, expected string) bool {
	if expected == "" { return false }
	header := r.Header.Get("Authorization"); const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) { return false }
	provided := strings.TrimPrefix(header, prefix)
	return len(provided) == len(expected) && subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(value)
}
func readJSON(w http.ResponseWriter, r *http.Request, target any, maxBytes int64) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	decoder := json.NewDecoder(r.Body); decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil { return err }
	var extra any; if err := decoder.Decode(&extra); err != io.EOF { return err }; return nil
}
func hashSecret(value string) string { sum := sha256.Sum256([]byte(value)); return hex.EncodeToString(sum[:]) }
func randomHex(size int) (string, error) {
	raw := make([]byte, size); if _, err := rand.Read(raw); err != nil { return "", err }; return hex.EncodeToString(raw), nil
}
func (s *Server) createPairingCode(w http.ResponseWriter, r *http.Request) {
	if !validBearer(r, s.adminToken) { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	store, ok := s.deviceStore(); if !ok { http.Error(w, "device enrollment is unavailable", http.StatusNotImplemented); return }
	code, err := randomHex(16); if err != nil { http.Error(w, "could not create pairing code", http.StatusInternalServerError); return }
	expires := time.Now().UTC().Add(10 * time.Minute)
	if err := store.CreatePairingCode(r.Context(), hashSecret(code), expires); err != nil { http.Error(w, "could not store pairing code", http.StatusInternalServerError); return }
	writeJSON(w, http.StatusCreated, map[string]any{"code": code, "expires_at": expires})
}
type enrollRequest struct {
	PairingCode string `json:"pairing_code"`
	DeviceID string `json:"device_id"`
	Hostname string `json:"hostname"`
	OS string `json:"os"`
	Username string `json:"username"`
}
func (s *Server) enrollAgent(w http.ResponseWriter, r *http.Request) {
	store, ok := s.deviceStore(); if !ok { http.Error(w, "device enrollment is unavailable", http.StatusNotImplemented); return }
	var input enrollRequest
	if err := readJSON(w, r, &input, 8*1024); err != nil { http.Error(w, "invalid enrollment request", http.StatusBadRequest); return }
	input.PairingCode = strings.TrimSpace(input.PairingCode)
	if len(input.PairingCode) != 32 || strings.TrimSpace(input.DeviceID) == "" || len(input.DeviceID) > 64 ||
		strings.TrimSpace(input.Hostname) == "" || len(input.Hostname) > 255 ||
		strings.TrimSpace(input.Username) == "" || len(input.Username) > 128 ||
		(input.OS != "windows" && input.OS != "linux" && input.OS != "macos") {
		http.Error(w, "invalid device information or pairing code", http.StatusBadRequest); return
	}
	token, err := randomHex(32); if err != nil { http.Error(w, "could not create device credential", http.StatusInternalServerError); return }
	device := events.DeviceRecord{DeviceID: input.DeviceID, Hostname: input.Hostname, OS: input.OS, Username: input.Username, Status: "active"}
	if err := store.EnrollDevice(r.Context(), hashSecret(input.PairingCode), device, hashSecret(token)); err != nil {
		if errors.Is(err, controlstore.ErrInvalidPairingCode) {
			http.Error(w, "pairing code invalid, expired, or already used", http.StatusUnauthorized)
		} else {
			http.Error(w, "device enrollment failed", http.StatusInternalServerError)
		}
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"device_id": input.DeviceID, "agent_token": token, "status": "enrolled"})
}
func (s *Server) listDevices(w http.ResponseWriter, r *http.Request) {
	if !validBearer(r, s.adminToken) { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	store, ok := s.deviceStore(); if !ok { http.Error(w, "device inventory is unavailable", http.StatusNotImplemented); return }
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second); defer cancel()
	devices, err := store.ListDevices(ctx); if err != nil { http.Error(w, "device query failed", http.StatusInternalServerError); return }
	writeJSON(w, http.StatusOK, map[string]any{"devices": devices})
}
func (s *Server) revokeDevice(w http.ResponseWriter, r *http.Request) {
	if !validBearer(r, s.adminToken) { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	store, ok := s.deviceStore(); if !ok { http.Error(w, "device inventory is unavailable", http.StatusNotImplemented); return }
	if err := store.RevokeDevice(r.Context(), r.PathValue("deviceID")); err != nil { http.Error(w, "device not found", http.StatusNotFound); return }
	w.WriteHeader(http.StatusNoContent)
}
func (s *Server) ingest(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	decoder := json.NewDecoder(r.Body); decoder.DisallowUnknownFields()
	var event events.SecurityEvent
	if err := decoder.Decode(&event); err != nil { http.Error(w, "invalid event payload", http.StatusBadRequest); return }
	var extra any; if err := decoder.Decode(&extra); err != io.EOF { http.Error(w, "request must contain exactly one JSON value", http.StatusBadRequest); return }
	if err := event.Validate(); err != nil { http.Error(w, "event validation failed", http.StatusUnprocessableEntity); return }

	header := r.Header.Get("Authorization"); token := strings.TrimPrefix(header, "Bearer ")
	store, ok := s.deviceStore()
	if ok && strings.HasPrefix(header, "Bearer ") && token != "" {
		deviceID, status, err := store.DeviceForToken(r.Context(), hashSecret(token))
		if err != nil { http.Error(w, "device authentication failed", http.StatusInternalServerError); return }
		if deviceID != "" {
			if status != "active" || event.Device.DeviceID != deviceID { http.Error(w, "device credential is revoked or does not match the event", http.StatusForbidden); return }
			if err := s.repository.Insert(r.Context(), event); err != nil { http.Error(w, "event storage failed", http.StatusInternalServerError); return }
			if err := store.TouchDevice(r.Context(), deviceID); err != nil { http.Error(w, "device heartbeat update failed", http.StatusInternalServerError); return }
			writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "event_id": event.EventID, "device_id": deviceID}); return
		}
	}
	// Backward compatibility for agents configured with the original shared token.
	if !validBearer(r, s.agentToken) { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	if err := s.repository.Insert(r.Context(), event); err != nil { http.Error(w, "event storage failed", http.StatusInternalServerError); return }
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "event_id": event.EventID})
}
func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	if !validBearer(r, s.adminToken) { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	limit := 100
	if value := r.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value); if err != nil || parsed < 1 { http.Error(w, "invalid limit", http.StatusBadRequest); return }
		limit = parsed; if limit > 500 { limit = 500 }
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second); defer cancel()
	result, err := s.repository.List(ctx, r.URL.Query().Get("q"), limit)
	if err != nil { http.Error(w, "event query failed", http.StatusInternalServerError); return }
	if result == nil { result = []events.SecurityEvent{} }; writeJSON(w, http.StatusOK, map[string]any{"events": result})
}
