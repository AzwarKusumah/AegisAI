# Go Control Plane

Authenticated metadata event ingestion and audit querying backed by PostgreSQL.

Run:
    go mod tidy
    DATABASE_URL='postgres://aegisai:password@localhost:5432/aegisai?sslmode=disable' AEGIS_AGENT_TOKEN='replace-agent-token' AEGIS_ADMIN_TOKEN='replace-admin-token' go run ./cmd/server

Default bind: 127.0.0.1:8787.

API:
- GET /healthz
- POST /api/v1/events — agent bearer token
- GET /api/v1/events?q=alice&limit=100 — admin bearer token

Payloads are capped at 64 KiB and unknown JSON fields are rejected. A prevented outcome requires explicit enforcement confirmation.

Shared bearer tokens are development-only. Production requires per-agent credentials or mTLS, rotation/revocation, OIDC/SSO for dashboard administrators, TLS, rate limiting, and retention controls.
