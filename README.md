# AegisAI

**Protect your data before it reaches AI.**

AegisAI is a self-hosted AI Data Loss Prevention platform. It aims to make sensitive-data exposure to external AI services visible and preventable through endpoint, browser, and centralized controls.

> Early development foundation. Browser integration observes attachment selection only. It does not inspect browser-selected file contents or block uploads. Do not deploy as a production security control.

## Platform

| Component | Technology | Current responsibility |
|---|---|---|
| Endpoint agent | Rust | Native Messaging, device context, local metadata spool |
| Browser extension | TypeScript / WebExtensions | Observe attachment selection on supported AI pages |
| Control plane | Go | Authenticated event ingestion and audit queries |
| Web dashboard | Next.js / React / TypeScript | View events, file metadata, provider, device, and actor attribution |
| Detection engine | Python | Local text/file inspection, secrets, PII, optional Gitleaks |
| Storage | PostgreSQL | Durable security-event metadata |

## Event visibility

The current extension reports attachment_selected when a file is selected in a supported AI page. It records file basename, extension, MIME type, size, provider, device, and the endpoint-observed OS account.

This is not proof that the upload completed or that the file reached an AI provider. An event may only be labelled prevented when a trusted enforcement component positively confirms prevention.

## Privacy and identity

- Raw files, prompts, clipboard content, credentials, and matched PII values must never be sent to the control plane or stored in audit events.
- File paths and full browser URLs are not collected.
- The current actor is an OS account (local_os_account), not an enterprise-verified identity.
- OIDC/SAML and managed-device identity mapping are future requirements.
- Filenames can contain sensitive data; organizations need collection and retention controls before production use.

## Repository layout

- agent/rust — Rust Native Messaging endpoint agent.
- apps/extension — Chromium/Firefox browser extension.
- apps/dashboard — Next.js audit dashboard.
- services/control-plane — Go API backed by PostgreSQL.
- contracts/events — shared JSON Schema.
- engine — local Python inspection engine.
- deployments/compose — local PostgreSQL dependency.
- docs — architecture and security requirements.

## Development

Start PostgreSQL using:

    docker compose -f deployments/compose/docker-compose.yml up -d

Control plane requires DATABASE_URL, AEGIS_AGENT_TOKEN, and AEGIS_ADMIN_TOKEN. Dashboard requires server-side AEGIS_API_URL and AEGIS_ADMIN_TOKEN. Never expose these credentials through NEXT_PUBLIC variables or commit real secrets.

See the component READMEs and docs before running the individual services.

## Current limitations

- Browser currently observes attachment selection only; it does not intercept or block upload requests.
- Rust agent records metadata and forwards events; content inspection is not yet integrated into the agent.
- OS username is not verified enterprise identity.
- Control plane uses shared development bearer tokens; production requires per-agent identity, rotation, TLS/mTLS, and enterprise authentication.
- No clipboard enforcement, TLS inspection, OS network filtering, policy distribution, or desktop-AI enforcement yet.
