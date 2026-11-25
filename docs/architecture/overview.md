# Architecture Overview

AegisAI uses a modular-monolith control plane with separately deployable endpoint and browser components. Content inspection should happen locally. The control plane receives metadata, not raw content.

## Components

1. Browser extension observes supported AI-provider pages. This milestone reports attachment-selection metadata only.
2. Rust endpoint agent validates Native Messaging input, adds device and local OS-account context, writes a local metadata spool, and optionally forwards events.
3. Python detection engine is the local content-inspection component. It is not yet wired into the Rust agent.
4. Go control plane authenticates event ingestion, validates event fields, persists metadata in PostgreSQL, and exposes audit queries.
5. Next.js dashboard calls the control plane through a server-side route. Admin credentials remain server-side.

## Event lifecycle

File selection -> browser provider adapter -> Native Messaging -> Rust agent -> local metadata spool -> authenticated control-plane ingestion -> PostgreSQL -> dashboard.

The current event stage is attachment_selected. This is evidence that a file was selected in a supported AI page, not proof of a completed network upload.

## Identity

The initial agent reports the operating-system username with identity_source local_os_account. This is useful device-session context, not proof of the identity authenticated to the AI application. A future OIDC/SAML or managed-device identity integration must map endpoint activity to a verified organization principal.

## Trust boundaries

- Browser pages are untrusted.
- Native Messaging is restricted to an exact extension origin allowlist.
- The agent accepts bounded metadata only, not file bytes or arbitrary paths.
- Agent ingestion and admin queries use separate credentials.
- Dashboard tokens are stored server-side.
- PostgreSQL must be protected with network segmentation, least-privilege credentials, backups, and retention controls.

No upload interception, content scanning in the agent, clipboard monitoring, TLS interception, kernel filtering, desktop-app traffic control, SSO, policy distribution, or production identity management is implemented.
