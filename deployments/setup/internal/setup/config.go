package setup

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type Config struct {
	Mode              string
	DBName            string
	DBUser            string
	DBPassword        string
	DBHost            string
	DBPort            string
	DBSSLMode         string
	AgentToken        string
	AdminToken        string
	DashboardUser     string
	DashboardPassword string
	DashboardPort     string
	DashboardBind     string
}

var (
	identifierPattern = regexp.MustCompile("^[A-Za-z_][A-Za-z0-9_]{0,62}$")
	secretPattern     = regexp.MustCompile("^[A-Za-z0-9._~-]{16,128}$")
	tokenPattern      = regexp.MustCompile("^[a-fA-F0-9]{64}$")
	usernamePattern   = regexp.MustCompile("^[A-Za-z0-9_.@-]{1,64}$")
	hostPattern       = regexp.MustCompile("^[A-Za-z0-9.-]{1,253}$")
)

func Defaults() Config {
	return Config{
		Mode: "docker", DBName: "aegisai", DBUser: "aegisai",
		DBHost: "127.0.0.1", DBPort: "5432", DBSSLMode: "disable",
		DashboardUser: "admin", DashboardPort: "3000", DashboardBind: "127.0.0.1",
	}
}

func RandomSecret(bytes int) (string, error) {
	if bytes < 16 || bytes > 128 {
		return "", fmt.Errorf("secret length must be between 16 and 128 bytes")
	}
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("generate random secret: %w", err)
	}
	return hex.EncodeToString(value), nil
}

func (c Config) Validate() error {
	if c.Mode != "docker" && c.Mode != "systemd" {
		return fmt.Errorf("deployment must be docker or systemd")
	}
	if !identifierPattern.MatchString(c.DBName) || !identifierPattern.MatchString(c.DBUser) {
		return fmt.Errorf("database name and username must be PostgreSQL identifiers (letters, digits, underscore; max 63 characters)")
	}
	if c.Mode == "systemd" {
		if !hostPattern.MatchString(c.DBHost) {
			return fmt.Errorf("database host must be a hostname or IPv4 address")
		}
		if c.DBSSLMode != "disable" && c.DBSSLMode != "require" {
			return fmt.Errorf("database SSL mode must be disable or require")
		}
	} else if c.DBSSLMode != "disable" {
		return fmt.Errorf("Docker's private PostgreSQL network currently uses sslmode=disable")
	}
	port, err := strconv.Atoi(c.DBPort)
	if err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("database port must be between 1 and 65535")
	}
	dashboardPort, err := strconv.Atoi(c.DashboardPort)
	if err != nil || dashboardPort < 1024 || dashboardPort > 65535 {
		return fmt.Errorf("dashboard port must be between 1024 and 65535")
	}
	if c.Mode == "systemd" && c.DBPassword == "" {
		return fmt.Errorf("enter the password for the existing PostgreSQL user")
	}
	if err := validateSecret(c.DBPassword, "database password", true); err != nil {
		return err
	}
	if err := validateSecret(c.DashboardPassword, "dashboard password", false); err != nil {
		return err
	}
	if c.AgentToken != "" && !tokenPattern.MatchString(c.AgentToken) {
		return fmt.Errorf("agent token must be exactly 64 hexadecimal characters or left blank to generate one")
	}
	if c.AdminToken != "" && !tokenPattern.MatchString(c.AdminToken) {
		return fmt.Errorf("admin token must be exactly 64 hexadecimal characters or left blank to generate one")
	}
	if !usernamePattern.MatchString(c.DashboardUser) {
		return fmt.Errorf("dashboard username may contain letters, numbers, dot, underscore, @, and hyphen (max 64 characters)")
	}
	if c.DashboardBind != "127.0.0.1" && c.DashboardBind != "0.0.0.0" {
		return fmt.Errorf("dashboard bind address must be 127.0.0.1 or 0.0.0.0")
	}
	return nil
}

func validateSecret(value, label string, optional bool) error {
	if value == "" && optional {
		return nil
	}
	if !secretPattern.MatchString(value) {
		return fmt.Errorf("%s must be 16–128 characters using letters, numbers, dot, underscore, hyphen, or tilde", label)
	}
	return nil
}

func (c Config) DatabaseURL() (string, error) {
	host, sslMode := c.DBHost, c.DBSSLMode
	if c.Mode == "docker" {
		host, sslMode = "postgres", "disable"
	}
	port, err := strconv.Atoi(c.DBPort)
	if err != nil || port < 1 || port > 65535 {
		return "", fmt.Errorf("invalid database port")
	}
	u := &url.URL{
		Scheme: "postgres",
		User: url.UserPassword(c.DBUser, c.DBPassword),
		Host: net.JoinHostPort(host, strconv.Itoa(port)),
		Path: "/" + c.DBName,
	}
	query := u.Query()
	query.Set("sslmode", sslMode)
	u.RawQuery = query.Encode()
	return u.String(), nil
}

func (c *Config) FillMissingSecrets() error {
	var err error
	if c.DBPassword == "" {
		c.DBPassword, err = RandomSecret(32)
		if err != nil { return err }
	}
	if c.AgentToken == "" {
		c.AgentToken, err = RandomSecret(32)
		if err != nil { return err }
	}
	if c.AdminToken == "" {
		c.AdminToken, err = RandomSecret(32)
		if err != nil { return err }
	}
	if c.DashboardPassword == "" {
		c.DashboardPassword, err = RandomSecret(24)
		if err != nil { return err }
	}
	return nil
}

func ReadEnv(path string) (map[string]string, error) {
	values := make(map[string]string)
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) { return values, nil }
		return nil, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") { continue }
		key, value, ok := strings.Cut(line, "=")
		if ok { values[strings.TrimSpace(key)] = strings.TrimSpace(value) }
	}
	return values, scanner.Err()
}

func FromEnv(values map[string]string) Config {
	cfg := Defaults()
	if v := values["AEGIS_DEPLOYMENT_MODE"]; v != "" { cfg.Mode = v }
	if v := values["POSTGRES_DB"]; v != "" { cfg.DBName = v }
	if v := values["POSTGRES_USER"]; v != "" { cfg.DBUser = v }
	cfg.DBPassword = values["POSTGRES_PASSWORD"]
	cfg.AgentToken = values["AEGIS_AGENT_TOKEN"]
	cfg.AdminToken = values["AEGIS_ADMIN_TOKEN"]
	cfg.DashboardUser = first(values["AEGIS_DASHBOARD_USER"], cfg.DashboardUser)
	cfg.DashboardPassword = values["AEGIS_DASHBOARD_PASSWORD"]
	cfg.DashboardPort = first(values["AEGIS_DASHBOARD_PORT"], cfg.DashboardPort)
	cfg.DashboardBind = first(values["AEGIS_DASHBOARD_BIND"], cfg.DashboardBind)
	cfg.DBHost = first(values["POSTGRES_HOST"], cfg.DBHost)
	cfg.DBPort = first(values["POSTGRES_PORT"], cfg.DBPort)
	cfg.DBSSLMode = first(values["POSTGRES_SSLMODE"], cfg.DBSSLMode)

	if raw := values["DATABASE_URL"]; raw != "" {
		if parsed, err := url.Parse(raw); err == nil {
			if parsed.User != nil {
				cfg.DBUser = parsed.User.Username()
				cfg.DBPassword, _ = parsed.User.Password()
			}
			if parsed.Hostname() != "" && parsed.Hostname() != "postgres" { cfg.DBHost = parsed.Hostname() }
			if parsed.Port() != "" { cfg.DBPort = parsed.Port() }
			if strings.Trim(parsed.Path, "/") != "" { cfg.DBName = strings.Trim(parsed.Path, "/") }
			if v := parsed.Query().Get("sslmode"); v != "" { cfg.DBSSLMode = v }
		}
	}
	for _, key := range []string{"DBPassword", "AgentToken", "AdminToken", "DashboardPassword"} {
		var value *string
		switch key {
		case "DBPassword":
			value = &cfg.DBPassword
		case "AgentToken":
			value = &cfg.AgentToken
		case "AdminToken":
			value = &cfg.AdminToken
		case "DashboardPassword":
			value = &cfg.DashboardPassword
		}
		if value != nil && (strings.HasPrefix(*value, "generate-") || strings.HasPrefix(*value, "replace-") || strings.HasPrefix(*value, "change-this-")) {
			*value = ""
		}
	}
	return cfg
}

func WriteEnv(path string, c Config) error {
	if err := c.Validate(); err != nil { return err }
	databaseURL, err := c.DatabaseURL()
	if err != nil { return err }

	hostName := c.DashboardBind
	if c.Mode == "docker" { hostName = "0.0.0.0" }
	lines := []string{
		"AEGIS_DEPLOYMENT_MODE=" + c.Mode,
		"POSTGRES_DB=" + c.DBName,
		"POSTGRES_USER=" + c.DBUser,
		"POSTGRES_PASSWORD=" + c.DBPassword,
		"POSTGRES_HOST=" + c.DBHost,
		"POSTGRES_PORT=" + c.DBPort,
		"POSTGRES_SSLMODE=" + c.DBSSLMode,
		"DATABASE_URL=" + databaseURL,
		"AEGIS_AGENT_TOKEN=" + c.AgentToken,
		"AEGIS_ADMIN_TOKEN=" + c.AdminToken,
		"AEGIS_LISTEN_ADDR=127.0.0.1:8787",
		"AEGIS_API_URL=http://127.0.0.1:8787",
		"AEGIS_DASHBOARD_USER=" + c.DashboardUser,
		"AEGIS_DASHBOARD_PASSWORD=" + c.DashboardPassword,
		"AEGIS_DASHBOARD_PORT=" + c.DashboardPort,
		"AEGIS_DASHBOARD_BIND=" + c.DashboardBind,
		"HOSTNAME=" + hostName,
		"PORT=" + c.DashboardPort,
		"NODE_ENV=production",
		"NEXT_TELEMETRY_DISABLED=1",
	}
	content := strings.Join(lines, "\n") + "\n"
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0700); err != nil {
		return fmt.Errorf("create configuration directory: %w", err)
	}
	temp, err := os.CreateTemp(directory, ".aegisai-env-*")
	if err != nil { return fmt.Errorf("create temporary configuration: %w", err) }
	tempName := temp.Name()
	defer os.Remove(tempName)
	if err := temp.Chmod(0600); err != nil { temp.Close(); return err }
	if _, err := temp.WriteString(content); err != nil { temp.Close(); return err }
	if err := temp.Sync(); err != nil { temp.Close(); return err }
	if err := temp.Close(); err != nil { return err }
	if err := os.Rename(tempName, path); err != nil {
		return fmt.Errorf("install environment file: %w", err)
	}
	if err := os.Chmod(path, 0600); err != nil {
		return fmt.Errorf("set private environment permissions: %w", err)
	}
	return nil
}

func first(value, fallback string) string {
	if value != "" { return value }
	return fallback
}
