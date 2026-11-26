# AegisAI deployment

AegisAI ships one dashboard application with two deployment methods. Choose one method for the server; do not run both against the same port unless you intentionally configure separate ports.

## Quick setup

From the repository root:

    chmod +x deployments/install.sh
    ./deployments/install.sh

The setup wizard offers Docker Compose or native systemd. It creates a local .env file with random agent, admin, database, and dashboard credentials. Keep .env private; it is ignored by Docker build contexts and must not be committed.

Non-interactive modes:

    ./deployments/install.sh --mode docker
    sudo ./deployments/install.sh --mode systemd

The dashboard listens on 127.0.0.1:3000 by default. Put a TLS reverse proxy such as Caddy or Nginx in front of it for access from other machines. HTTP Basic Authentication is not a substitute for HTTPS.

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

Requirements: Linux with systemd, Go 1.23+, Node.js 20+, npm, PostgreSQL, and a local PostgreSQL superuser named postgres.

Install PostgreSQL and configure it to accept local TCP connections on 127.0.0.1:5432 with password authentication. Then run:

    sudo ./deployments/install.sh --mode systemd

The installer creates/updates the aegisai PostgreSQL role and database, builds a stripped static Go binary, builds the Next.js standalone dashboard, and installs:
- aegisai-control-plane.service
- aegisai-dashboard.service

The application environment is stored at /etc/aegisai/aegisai.env (root-owned, mode 0640). The dashboard runs as the unprivileged aegisai user and listens on loopback.

Manage services:

    sudo systemctl status aegisai-control-plane aegisai-dashboard
    sudo systemctl restart aegisai-control-plane aegisai-dashboard
    sudo journalctl -u aegisai-control-plane -u aegisai-dashboard -f

The installer does not install or reconfigure PostgreSQL itself. Back up the database and /etc/aegisai/aegisai.env securely.

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
