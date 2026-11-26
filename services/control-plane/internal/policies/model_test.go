package policies

import "testing"

func validPolicy() Policy {
	return Policy{
		ID: "test-policy", Name: "Test policy", Enabled: true, Priority: 10,
		Action: "block", MinSeverity: "high", MinRiskScore: 70,
		Categories: []string{"cloud_credential"},
	}
}

func TestPolicyAcceptsSHA256Fingerprint(t *testing.T) {
	policy := validPolicy()
	policy.Fingerprints = []string{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
	if err := policy.Validate(); err != nil {
		t.Fatalf("valid SHA-256 fingerprint rejected: %v", err)
	}
}

func TestPolicyRejectsInvalidSHA256Fingerprint(t *testing.T) {
	policy := validPolicy()
	policy.Fingerprints = []string{"not-a-sha256"}
	if err := policy.Validate(); err == nil {
		t.Fatal("invalid fingerprint should be rejected")
	}
}

func TestPolicyRejectsInvalidExceptionAction(t *testing.T) {
	policy := validPolicy()
	policy.Exceptions = []PolicyException{{
		Name: "Invalid exception", Action: "ignore",
		Providers: []string{"chatgpt"},
	}}
	if err := policy.Validate(); err == nil {
		t.Fatal("invalid exception action should be rejected")
	}
}
