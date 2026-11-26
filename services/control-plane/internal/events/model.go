package events

import (
	"errors"
	"path"
	"strings"
	"time"
)

type Actor struct {
	UserID *string `json:"user_id"`
	Username string `json:"username"`
	IdentitySource string `json:"identity_source"`
}
type Device struct {
	DeviceID string `json:"device_id"`
	Hostname string `json:"hostname"`
	OS string `json:"os"`
}
type DeviceRecord struct {
	DeviceID string `json:"device_id"`
	Hostname string `json:"hostname"`
	OS string `json:"os"`
	Username string `json:"username"`
	Status string `json:"status"`
	EnrolledAt time.Time `json:"enrolled_at"`
	LastSeenAt *time.Time `json:"last_seen_at"`
}
type File struct {
	Name string `json:"name"`
	Extension string `json:"extension"`
	MIMEType string `json:"mime_type"`
	SizeBytes int64 `json:"size_bytes"`
}
type Inspection struct {
	Status string `json:"status"`
	RiskScore int `json:"risk_score"`
	Severity string `json:"severity"`
	Categories []string `json:"categories"`
}
type Enforcement struct {
	Confirmed bool `json:"confirmed"`
	Component string `json:"component"`
}
type SecurityEvent struct {
	EventID string `json:"event_id"`
	OccurredAt time.Time `json:"occurred_at"`
	Actor Actor `json:"actor"`
	Device Device `json:"device"`
	Provider string `json:"provider"`
	ProviderDomain string `json:"provider_domain"`
	EventType string `json:"event_type"`
	File File `json:"file"`
	Inspection Inspection `json:"inspection"`
	Outcome string `json:"outcome"`
	Enforcement Enforcement `json:"enforcement"`
}

func (e SecurityEvent) Validate() error {
	if strings.TrimSpace(e.EventID) == "" || e.OccurredAt.IsZero() { return errors.New("event identity and timestamp are required") }
	if strings.TrimSpace(e.Actor.Username) == "" || len(e.Actor.Username) > 128 { return errors.New("actor username is required") }
	if e.Actor.IdentitySource != "local_os_account" && e.Actor.IdentitySource != "enterprise_sso" && e.Actor.IdentitySource != "unresolved" { return errors.New("invalid identity source") }
	if e.Device.DeviceID == "" || e.Device.Hostname == "" { return errors.New("device identity is required") }
	if e.Provider == "" || e.ProviderDomain == "" { return errors.New("provider is required") }
	if e.EventType != "attachment_selected" && e.EventType != "send_action_observed" && e.EventType != "inspection_completed" && e.EventType != "upload_prevented" && e.EventType != "unknown" { return errors.New("invalid event type") }
	if e.File.Name == "" || len(e.File.Name) > 255 || path.Base(e.File.Name) != e.File.Name || strings.Contains(e.File.Name, string(rune(92))) { return errors.New("file name must be a basename") }
	if e.File.SizeBytes < 0 || e.File.SizeBytes > 1<<30 { return errors.New("invalid file size") }
	if e.Inspection.Status != "not_inspected" && e.Inspection.Status != "completed" && e.Inspection.Status != "partial" && e.Inspection.Status != "failed" { return errors.New("invalid inspection status") }
	if e.Inspection.RiskScore < 0 || e.Inspection.RiskScore > 100 { return errors.New("invalid risk score") }
	if e.Inspection.Severity != "none" && e.Inspection.Severity != "low" && e.Inspection.Severity != "medium" && e.Inspection.Severity != "high" && e.Inspection.Severity != "critical" { return errors.New("invalid inspection severity") }
	if len(e.Inspection.Categories) > 50 { return errors.New("too many finding categories") }
	for _, category := range e.Inspection.Categories { if strings.TrimSpace(category) == "" || len(category) > 64 { return errors.New("invalid finding category") } }
	if e.EventType == "inspection_completed" && e.Inspection.Status != "completed" { return errors.New("inspection_completed event requires a completed inspection") }
	if e.Outcome != "observed" && e.Outcome != "prevented" && e.Outcome != "unknown" { return errors.New("invalid outcome") }
	if e.Enforcement.Component != "none" && e.Enforcement.Component != "browser" && e.Enforcement.Component != "agent" && e.Enforcement.Component != "network_gateway" { return errors.New("invalid enforcement component") }
	if e.Outcome == "prevented" && (!e.Enforcement.Confirmed || e.Enforcement.Component == "none") { return errors.New("prevented outcome requires confirmed enforcement") }
	if e.EventType == "upload_prevented" && e.Outcome != "prevented" { return errors.New("upload_prevented requires prevented outcome") }
	return nil
}
