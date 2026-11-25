# AegisAI

**Protect your data before it reaches AI.**

AegisAI is a self-hosted, privacy-first AI Data Loss Prevention (AI-DLP) platform. It is designed to inspect and prevent sensitive information from being shared with external AI services, while providing administrators with an audit trail of attempted and prevented disclosures.

> Status: early development / foundation. This repository is not production-ready and does not yet provide complete endpoint or browser enforcement.

## Platform

- **Endpoint agent:** Rust (Windows and Linux)
- **Browser extension:** TypeScript, WebExtensions API (Chromium and Firefox)
- **Web dashboard:** React + TypeScript
- **Control-plane API:** Go
- **Detection engine:** Python, local-first
- **Storage:** PostgreSQL
- **Policy:** Open Policy Agent (OPA), planned
- **Deployment:** Docker Compose for development; self-hosted deployment target

## Security and privacy principles

1. Inspect content locally wherever possible.
2. Never store raw files, prompts, passwords, API keys, or extracted sensitive values in audit events.
3. Record only necessary metadata: authenticated user, managed device, AI provider, file metadata, detector categories, policy result, timestamp, and correlation ID.
4. Separate detection from enforcement. A detection result is not proof that an upload was blocked.
5. Report an event as prevented only when an enforcement component confirms prevention. Otherwise use attempted, detected, or unknown.
6. Do not silently fail open when an enforced inspection path is unavailable.
7. Minimize employee monitoring and provide role-based access, retention controls, and auditable administrator access.

## Monorepo layout

```text
apps/
  dashboard/             Web management and audit UI (planned)
  extension/             Browser extension (planned)
services/
  control-plane/         Go API and identity/event services (planned)
agent/
  rust/                  Cross-platform Rust endpoint agent (planned)
engine/
  python/                Local content inspection engine (planned)
contracts/
  events/                Shared event schemas
  api/                   API specifications
deployments/
  compose/               Self-hosted development stack
docs/
  architecture/          Architecture and data-flow decisions
  security/              Threat model and privacy requirements
```

## Development status

| Component | Status |
|---|---|
| Repository architecture and contracts | Initial foundation |
| Rust endpoint agent | Planned |
| Browser extension | Planned |
| Control-plane API | Planned |
| Web dashboard | Planned |
| Detection engine integration | Planned |
| Event-based audit trail | Schema foundation |
| Enforcement | Not implemented |

See [docs/architecture/overview.md](docs/architecture/overview.md), [docs/security/audit-and-privacy.md](docs/security/audit-and-privacy.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
