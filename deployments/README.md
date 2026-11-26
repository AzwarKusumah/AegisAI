# AegisAI deployment

AegisAI runs a Dashboard, Control Plane and PostgreSQL. Endpoint agents run on user devices and browser extensions run in supported browsers. Do not install the endpoint Agent inside the server stack.

## Quick setup

Download the prebuilt AegisAI Setup TUI from the latest successful Build endpoint and browser packages workflow run or a versioned GitHub Release. Run it from the root of a checked-out AegisAI repository.

Use --no-deploy to save configuration without starting services. The setup CLI itself does not contain server files; it must run from a checked-out AegisAI repository.

## Docker Compose

Requirements: Docker Engine and Docker Compose plugin.

    docker compose --env-file .env -f deployments/compose/docker-compose.yml up -d --build
    docker compose --env-file .env -f deployments/compose/docker-compose.yml ps
    docker compose --env-file .env -f deployments/compose/docker-compose.yml logs -f

Database data remains in the aegisai_postgres named volume. The down -v option deletes this volume; avoid it unless data deletion is intended.

Keep the Dashboard and Control Plane bound to loopback behind a TLS reverse proxy for normal operation. PostgreSQL is never published. Temporary direct-IP HTTP testing is possible by setting AEGIS_CONTROL_PLANE_BIND=0.0.0.0 and opening TCP 8787 in both the VPS firewall and provider security group, but it exposes enrollment tokens without encryption and must not be used for routine operation.

## TLS reverse proxy

For normal remote deployments, keep the Dashboard and Control Plane host bindings on loopback and terminate TLS at Caddy. Route only the public Agent endpoints to the Control Plane; keep administrator-only endpoints private:

```caddy
aegis.example.com {
    @agent_api path /api/v1/agents/enroll /api/v1/events /api/v1/agent/policies
    handle @agent_api {
        reverse_proxy 127.0.0.1:8787
    }

    handle /api/v1/* {
        respond "Not Found" 404
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

The `/api/v1/agent/policies` route is required so enrolled endpoints can retrieve signed-in-device policy data. It is authenticated with each device's revocable token. The Control Plane's administrator policy CRUD endpoints remain inaccessible through the public proxy.

## Device enrollment

1. Sign in to the Dashboard with AEGIS_DASHBOARD_USER and AEGIS_DASHBOARD_PASSWORD.
2. Open Devices and create a one-time pairing code. Choose a lifetime from 1 to 24 hours. The code is redeemable once and stored as a hash.
3. For Windows, run AegisAI-Installer-Windows-x86_64.exe. Load the bundled Chromium extension once, copy its extension ID, and enter the HTTPS Control Plane API URL and pairing code.
4. The Agent exchanges the pairing code for a device-specific bearer token. Only its SHA-256 hash is stored by the Control Plane; the raw token remains in the endpoint user's private configuration.
5. The Dashboard lists enrolled devices and supports credential revocation.

The Dashboard's AEGIS_ADMIN_TOKEN remains server-side. Never copy it to an endpoint. A pairing code is an enrollment secret; do not send it in chat or logs.

## Policies

The Dashboard includes policy management for classifier categories, severity/risk conditions, AI-provider and file-extension scope, priority, exceptions and block/audit/allow actions. The first database startup seeds two editable examples. Changes are retrieved by enrolled Agents before each file inspection.

## Security notes

- Use HTTPS for remote enrollment and event delivery.
- Keep PostgreSQL and internal service ports private.
- Raw file bytes and unredacted findings remain on the endpoint.
- Redacted previews are optional and disabled by default.
- Browser enforcement is best-effort on supported file-input, drop and paste events; it does not cover all browser/network or desktop-app upload paths.
- The Windows installer is not code-signed yet. Browser-store signing/publishing and enterprise extension force-install remain separate tasks.
