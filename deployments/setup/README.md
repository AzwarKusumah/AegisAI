# AegisAI Setup TUI

The setup utility is a standalone Go TUI. Run it from the root of a checked-out AegisAI repository. GitHub Actions builds ready-to-run binaries for Linux, Windows, and macOS; no local Go compiler is required.

## Run the prebuilt setup utility

Download the release-setup artifact from the latest successful Build endpoint and browser packages workflow run or from a versioned GitHub Release. Extract the binary and run it from the repository root:

    ./aegisai-setup-linux-x86_64
    ./aegisai-setup-linux-aarch64
    ./aegisai-setup-macos-x86_64
    ./aegisai-setup-macos-aarch64

On Windows PowerShell:

    .\aegisai-setup-windows-x86_64.exe

Use --root /path/to/AegisAI to select the repository explicitly. Use --no-deploy to write the configuration without starting services.

## What the TUI configures

The wizard is split into terminal form pages:

1. **Deployment:** Docker Compose or native systemd.
2. **Database:** PostgreSQL database name, username, and masked password. Docker mode creates a PostgreSQL 17 Alpine container. systemd mode connects to an existing database and asks for host, port, and SSL mode.
3. **Access and credentials:** dashboard username/password, endpoint agent ingestion token, internal admin API token, dashboard port, and network bind address.
4. **Review:** configuration summary and explicit confirmation before writing the file or starting services.

Blank secrets are generated using the operating system cryptographic random source. The generated database, dashboard, agent, and admin credentials are stored in the repository root .env with file mode 0600 on Unix. The TUI displays the dashboard login and endpoint agent token after saving; the internal admin token is never displayed.

The TUI writes the configuration, then starts the selected deployment. The setup CLI binary itself does not contain the server application: run it from a checked-out AegisAI repository so Docker/systemd can access the source and deployment files.

## Docker Compose deployment

Requirements:
- Docker Engine or Docker Desktop with the Compose plugin.
- Enough memory and disk for PostgreSQL, Go and Next.js image builds.

The TUI validates Compose configuration, then runs docker compose up -d --build. PostgreSQL data persists in the aegisai_postgres named volume.

## Native systemd deployment

Requirements:
- Linux with systemd.
- Go 1.23+, Node.js 20+, npm, and the PostgreSQL client (psql).
- An existing PostgreSQL database and login role. The selected role must be able to connect and create tables in the public schema.

The setup TUI connects to an existing PostgreSQL database. Create the database and login role before installation. The installer tests the supplied credentials and performs a rolled-back create/drop-table check before installing the service. It does not create or modify PostgreSQL roles, databases, or server authentication settings.

The installer builds the Go control plane and Next.js standalone dashboard and installs two unprivileged systemd services. If the TUI was started as a regular user, it invokes the installer through sudo.

## Existing configuration

When a .env file already exists, its settings are loaded as form defaults so a rerun does not silently rotate tokens or passwords. Changing a value and confirming the form replaces the file atomically. Back up the file securely before deliberate credential rotations.

## Security notes

- Passwords are masked during entry.
- Secrets are never printed in the review summary.
- The .env file is excluded from Git and Docker build context.
- The dashboard defaults to loopback. Choose 0.0.0.0 only when firewall rules and an HTTPS reverse proxy are configured.
- systemd stores service configuration under /etc/aegisai/aegisai.env with root ownership and mode 0640.
- Database credentials are required by the Go control plane; keep .env and /etc/aegisai/aegisai.env private.
