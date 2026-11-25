package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AzwarKusumah/AegisAI/services/control-plane/internal/events"
)

type memoryRepository struct {
	inserted int
	items []events.SecurityEvent
}
func (m *memoryRepository) Insert(_ context.Context, event events.SecurityEvent) error {
	m.inserted++
	m.items = append(m.items, event)
	return nil
}
func (m *memoryRepository) List(_ context.Context, _ string, _ int) ([]events.SecurityEvent, error) {
	return m.items, nil
}

func sampleEvent() events.SecurityEvent {
	return events.SecurityEvent{
		EventID: "event-1", OccurredAt: time.Now().UTC(),
		Actor: events.Actor{Username: "alice", IdentitySource: "local_os_account"},
		Device: events.Device{DeviceID: "device-1", Hostname: "workstation", OS: "linux"},
		Provider: "chatgpt", ProviderDomain: "chatgpt.com", EventType: "attachment_selected",
		File: events.File{Name: "report.pdf", Extension: "pdf", MIMEType: "application/pdf", SizeBytes: 120},
		Inspection: events.Inspection{Status: "not_inspected", RiskScore: 0, Severity: "none", Categories: []string{}},
		Outcome: "observed", Enforcement: events.Enforcement{Confirmed: false, Component: "none"},
	}
}

func TestHealth(t *testing.T) {
	handler := New(&memoryRepository{}, "agent-secret", "admin-secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"status":"ok"`) {
		t.Fatalf("unexpected health response: %d %s", response.Code, response.Body.String())
	}
}

func TestIngestRequiresAgentToken(t *testing.T) {
	repo := &memoryRepository{}
	handler := New(repo, "agent-secret", "admin-secret")
	request := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader("{}"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || repo.inserted != 0 {
		t.Fatalf("expected unauthorized request, got %d", response.Code)
	}
}

func TestIngestAcceptsMetadataEvent(t *testing.T) {
	repo := &memoryRepository{}
	handler := New(repo, "agent-secret", "admin-secret")
	body := `{"event_id":"event-1","occurred_at":"2026-11-26T00:00:00Z","actor":{"username":"alice","identity_source":"local_os_account"},"device":{"device_id":"device-1","hostname":"workstation","os":"linux"},"provider":"chatgpt","provider_domain":"chatgpt.com","event_type":"attachment_selected","file":{"name":"report.pdf","extension":"pdf","mime_type":"application/pdf","size_bytes":120},"inspection":{"status":"not_inspected","risk_score":0,"severity":"none","categories":[]},"outcome":"observed","enforcement":{"confirmed":false,"component":"none"}}`
	request := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer agent-secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusAccepted || repo.inserted != 1 {
		t.Fatalf("expected accepted event, got %d: %s", response.Code, response.Body.String())
	}
}

func TestIngestRejectsTrailingJSON(t *testing.T) {
	repo := &memoryRepository{}
	handler := New(repo, "agent-secret", "admin-secret")
	request := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader("{} {}"))
	request.Header.Set("Authorization", "Bearer agent-secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || repo.inserted != 0 {
		t.Fatalf("expected invalid JSON body, got %d", response.Code)
	}
}
