# AegisAI deployment

AegisAI runs a dashboard, Control Plane, and PostgreSQL. Endpoint agents run on user devices and are enrolled independently; browser extensions run in the user's browser. Do not install the agent or extension in the server stack.

## Quick setup

Download the prebuilt AegisAI Setup TUI from a successful Build endpoint and browser packages workflow run or a versioned GitHub Release. Run it from the root of a checked-out AegisAI repository:

    ./aegisai-setup-linux-x86_64

The TUI collects database settings, dashboard credentials, service tokens, dashboard port, and network binding. Passwords are masked. Empty secret fields are generated cryptographically. The resulting .env is written with mode 0600 on Unix.

Use --no-deploy to save the configuration without deploying. The setup CLI itself does not contain server files; it must run from a checked-out AegisAI repository.

## Docker Compose

Requirements: Docker Engine and the Docker Compose plugin.

The Compose stack contains PostgreSQL 17 Alpine, the Go Control Plane, and the Next.js dashboard. It does not contain endpoint agents or browser extensions.

Start and inspect:

    docker compose --env-file .env -f deployments/compose/docker-compose.yml up -d --build
    docker compose --env-file .env -f deployments/compose/docker-compose.yml ps
    docker compose --env-file .env -f deployments/compose/docker-compose.yml logs -f

Database data remains in the aegisai_postgres named volume. The down -v option deletes this volume; avoid it unless data deletion is intended.

### Temporary direct-IP enrollment over HTTP (testing only)

For a short-lived test without a domain or SSH tunnel, the Control Plane can be bound to the VPS public interfaces. In the server's .env, set:

    AEGIS_CONTROL_PLANE_BIND=0.0.0.0
    AEGIS_CONTROL_PLANE_PORT=8787

Recreate only the Control Plane container:

    docker compose --env-file .env -f deployments/compose/docker-compose.yml up -d --no-deps --force-recreate control-plane

Allow inbound TCP 8787 in the VPS firewall and provider security group. Keep dashboard port 3000 and PostgreSQL port 5432 private. On the Windows installer, enter http://YOUR_VPS_PUBLIC_IP:8787 and explicitly tick the insecure HTTP testing checkbox.

**Security warning:** HTTP exposes the one-time pairing code and the returned device token to anyone able to observe the network path. Use this only for a controlled temporary test. After testing, revoke the enrolled device token, set AEGIS_CONTROL_PLANE_BIND back to 127.0.0.1, recreate the Control Plane, and switch to HTTPS before normal use.

The dashboard binds to 127.0.0.1:3000 by default. The Control Plane binds to 127.0.0.1:8787 on the host by default, exclusively for a host HTTPS reverse proxy. PostgreSQL is not published. Do not bind the Control Plane to 0.0.0.0 or expose it directly to the internet.

Example Caddy routing (replace the domains with your own):

    dashboard.example.com {
        reverse_proxy 127.0.0.1:3000
    }

    api.example.com {
        reverse_proxy 127.0.0.1:8787
    }

The endpoint installer must receive the public API origin (for example, https://api.example.com), not the dashboard's internal Docker hostname. The HTTPS API origin must forward /api/v1/* to the Control Plane. For initial testing without a public domain, forward host port 8787 with SSH and use http://localhost:8787 from the endpoint installer; the local-only HTTP exception is accepted only for localhost. Keep public dashboard and API traffic behind TLS and firewall rules.

## Device enrollment

1. Sign in to the dashboard with AEGIS_DASHBOARD_USER and AEGIS_DASHBOARD_PASSWORD.
2. Open Devices and create a one-time pairing code. It is valid for ten minutes and can be redeemed once.
3. On the endpoint, run the GUI installer and enter the HTTPS API origin, extension ID, and pairing code.
4. The endpoint agent exchanges the pairing code for a device-specific bearer token. Only the SHA-256 hash of that token is stored by the Control Plane; the raw token is kept in the endpoint user's private configuration.
5. The dashboard shows enrolled devices and supports credential revocation.

The dashboard's AEGIS_ADMIN_TOKEN remains server-side. Never copy it to an endpoint. A pairing code is a short-lived enrollment secret; do not send it in chat or logs.

## Native systemd

Requirements: Linux with systemd, Go 1.23+, Node.js 20+, npm, and the PostgreSQL client (psql).

The setup TUI connects to an existing PostgreSQL database. Create the database and login role before installation; that role must have permission to connect and create tables and indexes. The installer tests the supplied database credentials before installing services. It does not create or modify database roles, databases, or PostgreSQL authentication settings.

## Build and security notes

- Go uses CGO_ENABLED=0, -trimpath, and linker stripping.
- The Go runtime image contains only the static executable (Distroless).
- Next.js uses output: standalone and omits development dependencies from the runtime image.
- Dashboard login uses an HTTP-only, SameSite=Strict signed session cookie. The session signing key is the server-side AEGIS_ADMIN_TOKEN.
- Agent pairing codes are one-use, short-lived, and stored hashed. Device tokens are individually revocable and stored hashed in the database.
- Raw selected files and matched secret/PII values are never sent to the Control Plane. File inventory is derived from event metadata only.
- The browser alert is informational. The current extension does not reliably cancel provider uploads or provide network-level DLP enforcement.
