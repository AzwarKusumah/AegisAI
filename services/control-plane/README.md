# Go Control Plane

Authenticated metadata event ingestion, device enrollment, policy management and audit querying backed by PostgreSQL.

API:
- GET /healthz
- POST /api/v1/agents/enroll — one-use pairing code to device-specific token
- POST /api/v1/pairing-codes — admin bearer token; accepts expires_in_hours from 1 to 24
- GET /api/v1/devices — admin bearer token
- DELETE /api/v1/devices/{deviceID} — admin bearer token
- GET /api/v1/policies — admin bearer token
- POST /api/v1/policies — admin bearer token
- PUT /api/v1/policies/{policyID} — admin bearer token
- DELETE /api/v1/policies/{policyID} — admin bearer token
- GET /api/v1/agent/policies — enrolled device bearer token
- POST /api/v1/events — device-specific bearer token; legacy shared-token support remains for migration
- GET /api/v1/events?q=alice&limit=100 — admin bearer token

Policy rules support block, audit and allow; classifier categories, provider and extension scope; priority ordering; and match-based exceptions. Device policy distribution is fail-closed. The initial database schema seeds editable baseline policies when no policy rows exist.

Payloads are size-bounded and unknown JSON fields are rejected. Device tokens and pairing codes are stored as SHA-256 hashes. Event records may contain an optional short redacted preview only when the matching policy explicitly enables it.

This is an early DLP implementation, not a full Forcepoint replacement. It currently has no cumulative/drip thresholds, database/file fingerprinting, enterprise labels, OCR, ML classifier training, central incident workflow, browser network gateway, TLS inspection, or OS-level traffic control.

Shared bearer tokens are development-only. Production requires per-device credentials, TLS, token rotation/revocation, OIDC/SSO for administrators, rate limiting, retention controls, audit logging and backups.
