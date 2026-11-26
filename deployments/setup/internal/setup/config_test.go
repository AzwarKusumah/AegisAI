package setup

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDatabaseURLUsesURLSafeEscaping(t *testing.T) {
	cfg := Defaults()
	cfg.DBPassword = "pass.with_under-score~"
	value, err := cfg.DatabaseURL()
	if err != nil { t.Fatal(err) }
	parsed, err := url.Parse(value)
	if err != nil { t.Fatal(err) }
	password, ok := parsed.User.Password()
	if !ok || password != cfg.DBPassword { t.Fatalf("password did not round-trip: %q", password) }
	if parsed.Hostname() != "postgres" { t.Fatalf("Docker DSN should use postgres service, got %q", parsed.Hostname()) }
}

func TestWriteEnvCreatesPrivateConfig(t *testing.T) {
	cfg := Defaults()
	cfg.DBPassword = "database-password-123"
	cfg.AgentToken = strings.Repeat("a", 64)
	cfg.AdminToken = strings.Repeat("b", 64)
	cfg.DashboardPassword = "dashboard-password-123"
	path := filepath.Join(t.TempDir(), ".env")
	if err := WriteEnv(path, cfg); err != nil { t.Fatal(err) }
	data, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	if !strings.Contains(string(data), "AEGIS_DEPLOYMENT_MODE=docker") { t.Fatal("deployment mode was not written") }
	info, err := os.Stat(path)
	if err != nil { t.Fatal(err) }
	if info.Mode().Perm() != 0600 { t.Fatalf("expected mode 0600, got %o", info.Mode().Perm()) }
	values, err := ReadEnv(path)
	if err != nil { t.Fatal(err) }
	roundTrip := FromEnv(values)
	if roundTrip.DBPassword != cfg.DBPassword || roundTrip.AgentToken != cfg.AgentToken { t.Fatal("secrets did not round-trip") }
}

func TestSystemdRequiresExistingDatabasePassword(t *testing.T) {
	cfg := Defaults()
	cfg.Mode = "systemd"
	cfg.DBPassword = ""
	if err := cfg.Validate(); err == nil { t.Fatal("expected a database password for an existing systemd database") }
}

func TestRejectsInvalidIdentifiersAndDashboardPorts(t *testing.T) {
	cfg := Defaults()
	cfg.DBName = "bad/name"
	if err := cfg.Validate(); err == nil { t.Fatal("expected invalid database name to be rejected") }
	cfg = Defaults()
	cfg.DashboardPort = "80"
	if err := cfg.Validate(); err == nil { t.Fatal("expected privileged dashboard port to be rejected") }
}

func TestFromEnvParsesDatabaseURL(t *testing.T) {
	cfg := FromEnv(map[string]string{
		"AEGIS_DEPLOYMENT_MODE": "systemd",
		"POSTGRES_DB": "aegisai",
		"POSTGRES_USER": "aegisai",
		"POSTGRES_PASSWORD": "secret-from-env-123",
		"DATABASE_URL": "postgres://aegisai:secret-from-env-123@db.internal:5433/aegisai?sslmode=require",
	})
	if cfg.DBHost != "db.internal" || cfg.DBPort != "5433" || cfg.DBSSLMode != "require" {
		t.Fatalf("database connection not loaded: %+v", cfg)
	}
}
