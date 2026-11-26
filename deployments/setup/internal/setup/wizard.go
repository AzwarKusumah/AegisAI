package setup

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"

	"charm.land/huh/v2"
)

func Run(root string, noDeploy, accessible bool) error {
	envPath := filepath.Join(root, ".env")
	values, err := ReadEnv(envPath)
	if err != nil { return fmt.Errorf("read existing .env: %w", err) }
	cfg := FromEnv(values)

	deployment := cfg.Mode
	options := []huh.Option[string]{
		huh.NewOption("Docker Compose — easiest setup, includes PostgreSQL", "docker"),
	}
	if runtime.GOOS == "linux" {
		options = append(options, huh.NewOption("Native systemd — Linux services with existing PostgreSQL", "systemd"))
	} else {
		deployment = "docker"
	}
	if err := huh.NewForm(
		huh.NewGroup(
			huh.NewNote().
				Title("AegisAI Server Setup").
				Description("Configure dashboard, control plane and PostgreSQL. Passwords are masked while typing and saved in a private .env file."),
			huh.NewSelect[string]().
				Title("Deployment method").
				Description("Docker creates a PostgreSQL container. Native systemd is available on Linux and connects to an existing PostgreSQL database.").
				Options(options...).
				Value(&deployment),
		),
	).WithAccessible(accessible).Run(); err != nil {
		return err
	}
	cfg.Mode = deployment
	if cfg.Mode == "docker" {
		cfg.DBHost = "postgres"
		cfg.DBSSLMode = "disable"
	} else if cfg.DBHost == "postgres" {
		cfg.DBHost = "127.0.0.1"
	}

	dbFields := []huh.Field{
		huh.NewNote().Title("Database configuration").Description(databaseDescription(cfg.Mode)),
		huh.NewInput().Title("Database name").Value(&cfg.DBName).Validate(func(value string) error {
			if !identifierPattern.MatchString(value) { return errors.New("use letters, numbers and underscores; start with a letter or underscore") }
			return nil
		}),
		huh.NewInput().Title("Database username").Value(&cfg.DBUser).Validate(func(value string) error {
			if !identifierPattern.MatchString(value) { return errors.New("use letters, numbers and underscores; start with a letter or underscore") }
			return nil
		}),
		huh.NewInput().
			Title("Database password").
			EchoMode(huh.EchoModePassword).
			Description(databasePasswordDescription(cfg.Mode)).
			Value(&cfg.DBPassword).
			Validate(func(value string) error {
				if cfg.Mode == "systemd" && value == "" { return errors.New("enter the password for the existing database user") }
				return validateSecret(value, "database password", true)
			}),
	}
	if cfg.Mode == "systemd" {
		dbFields = append(dbFields,
			huh.NewInput().Title("PostgreSQL host").Value(&cfg.DBHost).Validate(func(value string) error {
				if !hostPattern.MatchString(value) { return errors.New("enter a hostname or IPv4 address without a port") }
				return nil
			}),
			huh.NewInput().Title("PostgreSQL port").Value(&cfg.DBPort).Validate(validateDatabasePort),
			huh.NewSelect[string]().Title("PostgreSQL SSL mode").Options(
				huh.NewOption("Require TLS", "require"),
				huh.NewOption("Disable TLS (localhost only)", "disable"),
			).Value(&cfg.DBSSLMode),
		)
	}
	if err := huh.NewForm(huh.NewGroup(dbFields...)).WithAccessible(accessible).Run(); err != nil { return err }

	securityFields := []huh.Field{
		huh.NewNote().
			Title("Dashboard and API credentials").
			Description("Leave secret fields empty to generate strong random credentials automatically. Generated secrets are saved only in .env."),
		huh.NewInput().Title("Dashboard username").Value(&cfg.DashboardUser).Validate(func(value string) error {
			if !usernamePattern.MatchString(value) { return errors.New("letters, numbers, dot, underscore, @ and hyphen only") }
			return nil
		}),
		huh.NewInput().
			Title("Dashboard password").
			EchoMode(huh.EchoModePassword).
			Description("Minimum 16 characters. Leave blank to generate one.").
			Value(&cfg.DashboardPassword).
			Validate(func(value string) error { return validateSecret(value, "dashboard password", true) }),
		huh.NewInput().
			Title("Agent ingestion token").
			EchoMode(huh.EchoModePassword).
			Description("Used by endpoint agents to send metadata. Blank generates a 64-character token.").
			Value(&cfg.AgentToken).
			Validate(validateToken),
		huh.NewInput().
			Title("Dashboard admin API token").
			EchoMode(huh.EchoModePassword).
			Description("Internal server-to-server token. Blank generates a separate 64-character token.").
			Value(&cfg.AdminToken).
			Validate(validateToken),
		huh.NewInput().Title("Dashboard port").Value(&cfg.DashboardPort).Validate(validateDashboardPort),
		huh.NewSelect[string]().
			Title("Dashboard network bind").
			Description("127.0.0.1 is recommended with a local HTTPS reverse proxy. 0.0.0.0 exposes the dashboard on all interfaces.").
			Options(
				huh.NewOption("Localhost only (recommended)", "127.0.0.1"),
				huh.NewOption("All interfaces (configure HTTPS and firewall)", "0.0.0.0"),
			).
			Value(&cfg.DashboardBind),
	}
	if err := huh.NewForm(huh.NewGroup(securityFields...)).WithAccessible(accessible).Run(); err != nil { return err }

	if err := cfg.FillMissingSecrets(); err != nil { return err }
	if err := cfg.Validate(); err != nil { return err }

	if cfg.Mode == "systemd" {
		ready := false
		if err := huh.NewForm(huh.NewGroup(
			huh.NewNote().
				Title("Before installing systemd services").
				Description("Create the PostgreSQL database and user first. That user must be able to connect and create tables and indexes. The installer verifies credentials before enabling services."),
			huh.NewConfirm().
				Title("The database and user are ready").
				Affirmative("Continue").
				Negative("Cancel").
				Value(&ready),
		)).WithAccessible(accessible).Run(); err != nil { return err }
		if !ready { return errors.New("setup cancelled by user") }
	}

	summary := fmt.Sprintf(
		"Deployment: %s\nDatabase: %s\nDashboard: http://%s:%s\nDashboard user: %s\nConfiguration: %s",
		cfg.Mode, databaseSummary(cfg), cfg.DashboardBind, cfg.DashboardPort, cfg.DashboardUser, envPath,
	)
	confirmed := false
	confirmTitle := "Save configuration and start deployment?"
	affirmative := "Save and deploy"
	if noDeploy {
		confirmTitle = "Save configuration only?"
		affirmative = "Save configuration"
	}
	if err := huh.NewForm(huh.NewGroup(
		huh.NewNote().Title("Review configuration").Description(summary),
		huh.NewConfirm().Title(confirmTitle).
			Affirmative(affirmative).Negative("Cancel").Value(&confirmed),
	)).WithAccessible(accessible).Run(); err != nil { return err }
	if !confirmed { return errors.New("setup cancelled by user") }

	if err := WriteEnv(envPath, cfg); err != nil { return err }
	fmt.Printf("\nConfiguration saved to %s (permissions 0600).\n", envPath)
	fmt.Printf("Dashboard login: %s / %s\n", cfg.DashboardUser, cfg.DashboardPassword)
	fmt.Printf("Agent ingestion token: %s\n", cfg.AgentToken)
	fmt.Println("Keep these credentials private. The internal admin API token is not displayed.")

	if noDeploy {
		fmt.Println("Configuration-only mode: deployment was not started.")
		return nil
	}
	switch cfg.Mode {
	case "docker":
		return deployDocker(root, envPath)
	case "systemd":
		return deploySystemd(root, envPath)
	default:
		return fmt.Errorf("unsupported deployment mode %q", cfg.Mode)
	}
}

func databaseDescription(mode string) string {
	if mode == "docker" {
		return "AegisAI creates PostgreSQL 17 Alpine with a persistent volume. Leave password blank to generate a random value."
	}
	return "Use an existing PostgreSQL database. Create the database and user first; that user needs permission to create tables and indexes."
}

func databasePasswordDescription(mode string) string {
	if mode == "docker" { return "Leave blank to generate a strong random password for the bundled PostgreSQL container." }
	return "Password for the existing PostgreSQL user. It is required and stored in the root-protected service environment."
}

func databaseSummary(cfg Config) string {
	if cfg.Mode == "docker" { return "PostgreSQL container / " + cfg.DBName }
	return cfg.DBHost + ":" + cfg.DBPort + " / " + cfg.DBName
}

func validateDatabasePort(value string) error {
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 { return errors.New("enter a port between 1 and 65535") }
	return nil
}

func validateDashboardPort(value string) error {
	port, err := strconv.Atoi(value)
	if err != nil || port < 1024 || port > 65535 { return errors.New("enter a port between 1024 and 65535") }
	return nil
}

func validateToken(value string) error {
	if value == "" || tokenPattern.MatchString(value) { return nil }
	return errors.New("enter exactly 64 hexadecimal characters or leave blank to generate one")
}

func deployDocker(root, envPath string) error {
	if _, err := exec.LookPath("docker"); err != nil {
		return errors.New("Docker is not installed or not in PATH; install Docker with the Compose plugin and rerun")
	}
	composeFile := filepath.Join(root, "deployments", "compose", "docker-compose.yml")
	command := exec.Command("docker", "compose", "--env-file", envPath, "-f", composeFile, "config", "--quiet")
	command.Dir, command.Stdout, command.Stderr = root, os.Stdout, os.Stderr
	if err := command.Run(); err != nil { return fmt.Errorf("Docker Compose configuration validation failed: %w", err) }
	fmt.Println("\nBuilding and starting AegisAI containers...")
	command = exec.Command("docker", "compose", "--env-file", envPath, "-f", composeFile, "up", "-d", "--build")
	command.Dir, command.Stdout, command.Stderr, command.Stdin = root, os.Stdout, os.Stderr, os.Stdin
	if err := command.Run(); err != nil { return fmt.Errorf("Docker Compose deployment failed: %w", err) }
	fmt.Println("\nAegisAI containers have been started.")
	fmt.Println("Check status with: docker compose --env-file .env -f deployments/compose/docker-compose.yml ps")
	return nil
}

func deploySystemd(root, envPath string) error {
	if runtime.GOOS != "linux" { return errors.New("systemd deployment is only supported on Linux") }
	current, err := user.Current()
	if err != nil { return fmt.Errorf("determine current user: %w", err) }
	script := filepath.Join(root, "deployments", "install.sh")
	if _, err := os.Stat(script); err != nil { return fmt.Errorf("systemd installer not found: %w", err) }

	var command *exec.Cmd
	if current.Uid == "0" {
		command = exec.Command("bash", script, "--mode", "systemd", "--env-file", envPath)
	} else {
		sudo, err := exec.LookPath("sudo")
		if err != nil { return errors.New("systemd installation requires root; rerun the setup utility with sudo") }
		command = exec.Command(sudo, "bash", script, "--mode", "systemd", "--env-file", envPath)
	}
	command.Dir, command.Stdout, command.Stderr, command.Stdin = root, os.Stdout, os.Stderr, os.Stdin
	if err := command.Run(); err != nil { return fmt.Errorf("systemd deployment failed: %w", err) }
	return nil
}
