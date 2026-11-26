# AegisAI deployment

AegisAI ships one dashboard application with two deployment methods. Choose one method for the server; do not run both against the same port unless you intentionally configure separate ports.

## Quick setup

Download the prebuilt AegisAI Setup TUI from the latest successful Build endpoint and browser packages workflow or a versioned GitHub Release.

Run it from the repository root:

    ./aegisai-setup-linux-x86_64

Windows PowerShell:

    .\aegisai-setup-windows-x86_64.exe

The TUI is also built for Linux ARM64 and macOS Intel/Apple Silicon. It presents form pages for deployment type, database settings, dashboard account, agent/admin tokens, dashboard port, and network binding. Passwords are masked. Empty secret fields are filled with cryptographically random secrets, and the resulting .env is written with mode 0600 on Unix.

Use --no-deploy to save the configuration without deploying. The setup CLI binary itself does not contain the server application: run it from a checked-out AegisAI repository so Docker/systemd can access the source and deployment files.

## Option A: Docker Compose

Requirements: Docker Engine and the Docker Compose plugin.

The Compose stack contains:
- PostgreSQL 17 Alpine with a persistent named volume and health check.
- Go control plane compiled as a static binary and copied into a Distroless runtime.
- Next.js dashboard built once and copied as standalone output into a Node Alpine runtime.

Start, inspect, and stop:

    docker compose --env-file .env -f deployments/compose/docker-compose.yml up -d --build
    docker compose --env-file .env -f deployments/compose/docker-compose.yml ps
    docker compose --env-file .env -f deployments/compose/docker-compose.yml logs -f
    docker compose --env-file .env -f deployments/compose/docker-compose.yml down

Database data remains in the aegisai_postgres named volume. The down -v option deletes that volume and all stored events; avoid it unless data deletion is intended.

Published dashboard and database ports bind to loopback. The control-plane port is internal to the Compose network and is not published on the host. Configure a reverse proxy on the host to proxy to 127.0.0.1:3000.

## Option B: native systemd

Requirements: Linux with systemd, Go 1.23+, Node.js 20+, npm, and the PostgreSQL client (psql).

The setup TUI connects to an **existing** PostgreSQL database. Create the database and login role before installation; that role must have permission to connect and create tables and indexes. The installer tests the supplied database credentials before installing services. It does not create or modify database roles, databases, or PostgreSQL authentication settings.

The setup wizard writes the database DSN and service settings, then installs:
- aegisai-control-plane.service
- aegisai-dashboard.service

The application environment is copied to /etc/aegisai/aegisai.env (root-owned, mode 0640). Both services run as the unprivileged aegisai user.

Manage services:

    sudo systemctl status aegisai-control-plane aegisai-dashboard
    sudo systemctl restart aegisai-control-plane aegisai-dashboard
    sudo journalctl -u aegisai-control-plane -u aegisai-dashboard -f

Back up the database and /etc/aegisai/aegisai.env securely.

## Build-size choices

- Go uses CGO_ENABLED=0, -trimpath, and linker stripping (-s -w).
- The Go runtime image contains only the static executable (Distroless).
- Next.js uses output: standalone; runtime images omit TypeScript, npm, and development dependencies.
- Docker build contexts exclude Git history, local environment files, caches, test artifacts, and node_modules.
- No runtime Python, Rust toolchain, or compiler is installed in the dashboard/API containers.

Actual image sizes depend on target architecture and dependency updates. Compare with docker image ls aegisai/* after building; the PostgreSQL image is separate from application image sizes.

## Configuration and security

Edit .env before first startup if you need a custom dashboard username or password. The installer intentionally creates hexadecimal secrets to avoid URL/shell escaping issues. Do not reuse development credentials in production.

For network-accessible deployments:
- Terminate TLS at a trusted reverse proxy.
- Restrict dashboard access and PostgreSQL to trusted networks.
- Back up PostgreSQL and test restoration.
- Rotate credentials and use unique agent credentials before enterprise rollout.
- Keep the dashboard's AEGIS_ADMIN_TOKEN server-side; never use NEXT_PUBLIC_ for secrets.

This milestone packages deployments; it does not add upload interception or DLP enforcement. An inspection event must not be interpreted as proof that an upload was blocked.
