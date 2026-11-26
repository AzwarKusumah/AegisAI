package policies

import (
	"errors"
	"strings"
	"time"
)

type PolicyException struct {
	Name       string   `json:"name"`
	Categories []string `json:"categories"`
	Providers  []string `json:"providers"`
	Extensions []string `json:"extensions"`
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
	if len(p.Categories) > 32 || len(p.Providers) > 16 || len(p.Extensions) > 32 || len(p.Exceptions) > 20 {
		return errors.New("policy contains too many match values")
	}
	values := append(append(append([]string{}, p.Categories...), p.Providers...), p.Extensions...)
	for _, exception := range p.Exceptions {
		if len(exception.Name) > 120 {
			return errors.New("exception name must be at most 120 characters")
		}
		values = append(values, exception.Categories...)
		values = append(values, exception.Providers...)
		values = append(values, exception.Extensions...)
	}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || len(value) > 80 {
			return errors.New("policy and exception match values must be non-empty and at most 80 characters")
		}
	}
	return nil
}
