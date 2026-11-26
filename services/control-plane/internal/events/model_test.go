package events

import (
	"testing"
	"time"
)

func validEvent() SecurityEvent {
	return SecurityEvent{
		EventID: "evt-test-1", OccurredAt: time.Now().UTC(),
		Actor: Actor{Username: "alice", IdentitySource: "local_os_account"},
		Device: Device{DeviceID: "device-1", Hostname: "workstation", OS: "linux"},
		Provider: "chatgpt", ProviderDomain: "chatgpt.com", EventType: "attachment_selected",
		File: File{Name: "design.pdf", Extension: "pdf", MIMEType: "application/pdf", SizeBytes: 123},
		Inspection: Inspection{Status: "not_inspected", RiskScore: 0, Severity: "none", Categories: []string{}},
		Outcome: "observed", Enforcement: Enforcement{Confirmed: false, Component: "none"},
	}
}

func TestValidObservation(t *testing.T) {
	if err := validEvent().Validate(); err != nil { t.Fatalf("expected valid event: %v", err) }
}

func TestCompletedInspection(t *testing.T) {
	event := validEvent()
	event.EventType = "inspection_completed"
	event.Inspection = Inspection{Status: "completed", RiskScore: 98, Severity: "critical", Categories: []string{"cloud_credential"}}
	if err := event.Validate(); err != nil { t.Fatalf("expected valid inspection: %v", err) }
}

func TestInspectionEventMustBeCompleted(t *testing.T) {
	event := validEvent()
	event.EventType = "inspection_completed"
	if err := event.Validate(); err == nil { t.Fatal("expected incomplete inspection event to fail") }
}

func TestPreventedRequiresConfirmation(t *testing.T) {
	event := validEvent()
	event.Outcome = "prevented"
	if err := event.Validate(); err == nil { t.Fatal("expected prevented event without confirmation to fail") }
}

func TestRejectsPathInFilename(t *testing.T) {
	event := validEvent()
	event.File.Name = "../customer-export.pdf"
	if err := event.Validate(); err == nil { t.Fatal("expected path-like filename to fail") }
}
