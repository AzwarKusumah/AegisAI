# Audit, Privacy, and Attribution

## Local inspection behavior

The browser extension is disabled for content inspection by default. The user must enable “Inspect selected AI attachments” in the extension popup. When enabled, selected file bytes are read locally and passed to the Rust endpoint agent through Native Messaging for local inspection.

The current file-size limit is 10 MiB. The agent buffers one selected file at a time, invokes the Python engine through stdin, and zeroizes the Rust transfer buffer after processing. The browser extension does not intentionally write a copy of the file to disk.

## Allowed event data

- generated event ID and UTC timestamp;
- provider name and hostname only;
- file basename, extension, MIME type, and byte size;
- agent-generated device ID and hostname;
- local OS username and explicit identity-source label;
- inspection status, risk score, severity, and detector category identifiers;
- event stage and positive enforcement confirmation, where applicable.

## Forbidden event data

- raw file bytes or extracted document text;
- prompts, conversation contents, or clipboard text;
- matched passwords, API keys, tokens, private keys, or PII values;
- full local file paths;
- browser cookies, authorization headers, or AI-provider session tokens.

File contents are transferred only to the local Native Messaging host after the user enables inspection. The control plane receives metadata only. The Rust buffer is zeroized after local inspection and before event persistence/forwarding. The local Python process has a 30-second execution timeout. Optional Gitleaks reports are requested on stdout with 100% redaction; the engine stores only compact finding summaries. Filenames can themselves be sensitive; organizations should provide configurable collection, access control, and retention before production deployment.

## Dashboard access

The Next.js dashboard and its API routes require HTTP Basic Authentication using server-side AEGIS_DASHBOARD_USER and AEGIS_DASHBOARD_PASSWORD values. Deploy behind HTTPS whenever reachable over a network. The Go control-plane admin token remains server-side and is never sent to browser JavaScript. Basic Authentication is an initial access gate, not a substitute for enterprise SSO, per-user RBAC, MFA, or audited administrator sessions.

## Event semantics

- attachment_selected: legacy metadata-only file-selection observation.
- inspection_completed: local inspection completed successfully.
- unknown: inspection could not be completed; it must never be interpreted as clean.
- upload_prevented: reserved for a trusted enforcement component that positively confirms the request did not leave the endpoint.

Do not label attachment selection as a successful leak. Do not label a finding as prevented without enforcement confirmation. This version scans on file selection and does not block the AI provider's upload request.

## Attribution

The initial agent reports local_os_account. This is not enterprise-verified identity. The dashboard must show the attribution source. Production should integrate device enrollment and an identity provider.

## Production security requirements

- per-agent credentials or mTLS with rotation and revocation;
- OIDC/SAML and role-based dashboard access;
- signed installer and agent binaries;
- Native Messaging origin / allowed-extension allowlist;
- access-controlled local spool, bounded queue, and replay protection;
- database TLS, backups, retention, and audited administrator access;
- request limits, schema validation, rate limiting, and integrity monitoring;
- employee notice, purpose limitation, opt-in/consent model, and approved retention.
