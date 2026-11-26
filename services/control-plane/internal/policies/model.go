package policies

import (
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

type PolicyException struct {
	Name        string   `json:"name"`
	Action      string   `json:"action"`
	Categories  []string `json:"categories"`
	Providers   []string `json:"providers"`
	Extensions  []string `json:"extensions"`
	Fingerprints []string `json:"fingerprints"`
}

type Policy struct {
	ID                   string   `json:"id"`
	Name                 string   `json:"name"`
	Description          string   `json:"description"`
	Enabled              bool     `json:"enabled"`
	Priority             int      `json:"priority"`
	Action               string   `json:"action"`
	MinSeverity          string   `json:"min_severity"`
	MinRiskScore         int      `json:"min_risk_score"`
	Categories           []string `json:"categories"`
	Providers            []string `json:"providers"`
	Extensions           []string `json:"extensions"`
	Fingerprints         []string `json:"fingerprints"`
	Exceptions            []PolicyException `json:"exceptions"`
	ShareRedactedPreview bool     `json:"share_redacted_preview"`
	UpdatedAt            time.Time `json:"updated_at,omitempty"`
}

func (p Policy) Validate() error {
	if strings.TrimSpace(p.ID) == "" || len(p.ID) > 80 {
		return errors.New("policy id is required and must be at most 80 characters")
	}
	if strings.TrimSpace(p.Name) == "" || len(p.Name) > 120 {
		return errors.New("policy name is required and must be at most 120 characters")
	}
	if len(p.Description) > 1000 {
		return errors.New("policy description must be at most 1000 characters")
	}
	if p.Priority < 0 || p.Priority > 10000 {
		return errors.New("policy priority must be between 0 and 10000")
	}
	if p.Action != "block" && p.Action != "audit" && p.Action != "allow" {
		return errors.New("policy action must be block, audit, or allow")
	}
	switch p.MinSeverity {
	case "", "none", "low", "medium", "high", "critical":
	default:
		return errors.New("invalid minimum severity")
	}
	if p.MinRiskScore < 0 || p.MinRiskScore > 100 {
		return errors.New("minimum risk score must be between 0 and 100")
	}
	if len(p.Categories) > 32 || len(p.Providers) > 16 || len(p.Extensions) > 32 || len(p.Fingerprints) > 64 || len(p.Exceptions) > 20 {
		return errors.New("policy contains too many match values")
	}
	values := append(append(append([]string{}, p.Categories...), p.Providers...), p.Extensions...)
	for _, exception := range p.Exceptions {
		if len(exception.Name) > 120 {
			return errors.New("exception name must be at most 120 characters")
		}
		if exception.Action != "" && exception.Action != "block" && exception.Action != "audit" && exception.Action != "allow" {
			return errors.New("exception action must be block, audit, or allow")
		}
		if len(exception.Fingerprints) > 64 {
			return errors.New("exception contains too many file fingerprints")
		}
		if len(exception.Categories)+len(exception.Providers)+len(exception.Extensions)+len(exception.Fingerprints) == 0 {
			return errors.New("exception must include at least one matching condition")
		}
		values = append(values, exception.Categories...)
		values = append(values, exception.Providers...)
		values = append(values, exception.Extensions...)
	}
	for _, value := range append(values, p.Fingerprints...) {
		value = strings.TrimSpace(value)
		if value == "" || len(value) > 80 {
			return errors.New("policy and exception match values must be non-empty and at most 80 characters")
		}
	}
	for _, fingerprint := range p.Fingerprints {
		decoded, err := hex.DecodeString(fingerprint)
		if err != nil || len(decoded) != 32 {
			return errors.New("file fingerprints must be 64-character SHA-256 hex values")
		}
	}
	for _, exception := range p.Exceptions {
		for _, fingerprint := range exception.Fingerprints {
			decoded, err := hex.DecodeString(fingerprint)
			if err != nil || len(decoded) != 32 {
				return errors.New("exception fingerprints must be 64-character SHA-256 hex values")
			}
		}
	}
	return nil
}
