package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/events"
	controlstore "github.com/AzwarKusumah/AegisAI/services/control-plane/internal/store"
)

type memoryRepository struct {
	inserted int
	items []events.SecurityEvent
	pairingCodes map[string]time.Time
	devices map[string]events.DeviceRecord
	tokens map[string]string
}
func newMemoryRepository() *memoryRepository {
	return &memoryRepository{pairingCodes: map[string]time.Time{}, devices: map[string]events.DeviceRecord{}, tokens: map[string]string{}}
}
func (m *memoryRepository) Insert(_ context.Context, event events.SecurityEvent) error {
	m.inserted++
	m.items = append(m.items, event)
	return nil
}
func (m *memoryRepository) List(_ context.Context, _ string, _ int) ([]events.SecurityEvent, error) { return m.items, nil }
func (m *memoryRepository) CreatePairingCode(_ context.Context, hash string, expiry time.Time) error {
	m.pairingCodes[hash] = expiry
	return nil
}
func (m *memoryRepository) EnrollDevice(_ context.Context, codeHash string, device events.DeviceRecord, tokenHash string) error {
	expiry, ok := m.pairingCodes[codeHash]
	if !ok || time.Now().After(expiry) { return controlstore.ErrInvalidPairingCode }
	delete(m.pairingCodes, codeHash)
	device.Status = "active"
	device.EnrolledAt = time.Now().UTC()
	m.devices[device.DeviceID] = device
	m.tokens[tokenHash] = device.DeviceID
	return nil
}
func (m *memoryRepository) DeviceForToken(_ context.Context, tokenHash string) (string, string, error) {
	deviceID, ok := m.tokens[tokenHash]
	if !ok { return "", "", nil }
	return deviceID, m.devices[deviceID].Status, nil
}
func (m *memoryRepository) ListDevices(_ context.Context) ([]events.DeviceRecord, error) {
	result := make([]events.DeviceRecord, 0, len(m.devices))
	for _, device := range m.devices { result = append(result, device) }
	return result, nil
}
func (m *memoryRepository) RevokeDevice(_ context.Context, deviceID string) error {
	device, ok := m.devices[deviceID]
	if !ok { return errors.New("device not found") }
	device.Status = "revoked"
	m.devices[deviceID] = device
	for token, id := range m.tokens { if id == deviceID { delete(m.tokens, token) } }
	return nil
}
func (m *memoryRepository) TouchDevice(_ context.Context, deviceID string) error {
	device, ok := m.devices[deviceID]
	if ok { now := time.Now().UTC(); device.LastSeenAt = &now; m.devices[deviceID] = device }
	return nil
}

func sampleEvent() events.SecurityEvent {
	return events.SecurityEvent{
		EventID: "event-1", OccurredAt: time.Now().UTC(),
		Actor: events.Actor{Username: "alice", IdentitySource: "local_os_account"},
		Device: events.Device{DeviceID: "device-1", Hostname: "workstation", OS: "windows"},
		Provider: "chatgpt", ProviderDomain: "chatgpt.com", EventType: "inspection_completed",
		File: events.File{Name: "report.pdf", Extension: "pdf", MIMEType: "application/pdf", SizeBytes: 120},
		Inspection: events.Inspection{Status: "completed", RiskScore: 100, Severity: "critical", Categories: []string{"cloud_credential"}},
		Outcome: "observed", Enforcement: events.Enforcement{Confirmed: false, Component: "none"},
	}
}

func TestDeviceEnrollmentIngestAndRevocation(t *testing.T) {
	repo := newMemoryRepository()
	handler := New(repo, "legacy-agent-secret", "admin-secret")

	pairResponse := httptest.NewRecorder()
	pairRequest := httptest.NewRequest(http.MethodPost, "/api/v1/pairing-codes", nil)
	pairRequest.Header.Set("Authorization", "Bearer admin-secret")
	handler.ServeHTTP(pairResponse, pairRequest)
	if pairResponse.Code != http.StatusCreated { t.Fatalf("pairing code create: %d %s", pairResponse.Code, pairResponse.Body.String()) }
	var pairing struct { Code string `json:"code"` }
	if err := json.Unmarshal(pairResponse.Body.Bytes(), &pairing); err != nil || len(pairing.Code) != 32 {
		t.Fatalf("bad pairing code response: %s", pairResponse.Body.String())
	}

	enrollmentBody := `{"pairing_code":"` + pairing.Code + `","device_id":"device-1","hostname":"workstation","os":"windows","username":"alice"}`
	enrollResponse := httptest.NewRecorder()
	handler.ServeHTTP(enrollResponse, httptest.NewRequest(http.MethodPost, "/api/v1/agents/enroll", strings.NewReader(enrollmentBody)))
	if enrollResponse.Code != http.StatusCreated { t.Fatalf("enrollment: %d %s", enrollResponse.Code, enrollResponse.Body.String()) }
	var enrolled struct {
		DeviceID string `json:"device_id"`
		AgentToken string `json:"agent_token"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(enrollResponse.Body.Bytes(), &enrolled); err != nil || enrolled.DeviceID != "device-1" || len(enrolled.AgentToken) != 64 || enrolled.Status != "enrolled" {
		t.Fatalf("bad enrollment response: %s", enrollResponse.Body.String())
	}

	eventBody, _ := json.Marshal(sampleEvent())
	ingestRequest := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(string(eventBody)))
	ingestRequest.Header.Set("Authorization", "Bearer "+enrolled.AgentToken)
	ingestResponse := httptest.NewRecorder()
	handler.ServeHTTP(ingestResponse, ingestRequest)
	if ingestResponse.Code != http.StatusAccepted || repo.inserted != 1 {
		t.Fatalf("per-device ingestion: %d %s", ingestResponse.Code, ingestResponse.Body.String())
	}

	mismatched := sampleEvent()
	mismatched.Device.DeviceID = "another-device"
	mismatchBody, _ := json.Marshal(mismatched)
	mismatchRequest := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(string(mismatchBody)))
	mismatchRequest.Header.Set("Authorization", "Bearer "+enrolled.AgentToken)
	mismatchResponse := httptest.NewRecorder()
	handler.ServeHTTP(mismatchResponse, mismatchRequest)
	if mismatchResponse.Code != http.StatusForbidden || repo.inserted != 1 {
		t.Fatalf("device mismatch should be forbidden: %d", mismatchResponse.Code)
	}

	revokeRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/devices/device-1", nil)
	revokeRequest.Header.Set("Authorization", "Bearer admin-secret")
	revokeResponse := httptest.NewRecorder()
	handler.ServeHTTP(revokeResponse, revokeRequest)
	if revokeResponse.Code != http.StatusNoContent { t.Fatalf("revoke: %d %s", revokeResponse.Code, revokeResponse.Body.String()) }

	revokedRequest := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(string(eventBody)))
	revokedRequest.Header.Set("Authorization", "Bearer "+enrolled.AgentToken)
	revokedResponse := httptest.NewRecorder()
	handler.ServeHTTP(revokedResponse, revokedRequest)
	if revokedResponse.Code != http.StatusUnauthorized || repo.inserted != 1 {
		t.Fatalf("revoked credential should be rejected: %d", revokedResponse.Code)
	}

	reuseRequest := httptest.NewRequest(http.MethodPost, "/api/v1/agents/enroll", strings.NewReader(enrollmentBody))
	reuseResponse := httptest.NewRecorder()
	handler.ServeHTTP(reuseResponse, reuseRequest)
	if reuseResponse.Code != http.StatusUnauthorized { t.Fatalf("pairing code must be one-use: %d", reuseResponse.Code) }
}
