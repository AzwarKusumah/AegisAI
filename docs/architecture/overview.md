# Architecture Overview

AegisAI uses a modular-monolith control plane with separately deployable endpoint and browser components. Content inspection runs locally. The control plane receives metadata and finding categories, never file bytes or extracted content.

## Components

1. Browser extension observes supported AI-provider file inputs. Inspection is explicitly opt-in and disabled by default. When enabled, the extension reads selected File objects in memory and streams bounded chunks to the local agent.
2. Rust endpoint agent validates browser Native Messaging input, provider domain, basename, chunk order, and size limit. It buffers one file in memory, zeroizes the buffer after use, invokes the local Python inspector through stdin, enriches the result with device and OS-account context, writes a metadata-only local spool, and optionally forwards the event.
3. Python detection engine performs local extraction and secret/PII detection. It returns finding rule IDs, categories, severity, confidence, and offsets only; no matched value or extracted text is returned.
4. Go control plane authenticates metadata event ingestion, validates fields, persists events in PostgreSQL, and exposes audit queries.
5. Next.js dashboard displays the file metadata, actor/device, provider, inspection status, risk score, and categories. Admin credentials remain server-side.

## Event lifecycle

User enables local scanning -> file selected in supported AI page -> extension sends 256 KiB chunks through Native Messaging -> Rust agent validates transfer -> Python scans stdin bytes locally -> Rust produces metadata-only event -> local spool -> authenticated control-plane ingestion -> PostgreSQL -> dashboard.

The current event is inspection_completed when local inspection succeeds, or unknown when inspection cannot complete. Neither means the file was successfully uploaded. The agent does not cancel or block the provider's network request.

## Identity

The agent reports the current operating-system username with identity_source local_os_account. This is device-session context, not proof of the identity authenticated to the AI application. A future OIDC/SAML or managed-device integration must map endpoint activity to a verified organization principal.

## Trust boundaries

- Browser pages are untrusted; sender origin is checked by extension background and native host registration.
- Only explicitly enabled extension sessions read selected file bytes.
- Native Messaging is restricted by exact Chromium extension origin or Firefox allowed_extensions manifest.
- Rust accepts one bounded file transfer at a time, up to 10 MiB, with ordered chunks.
- Python receives the bytes through stdin; no temporary file copy is created.
- Control-plane events contain only bounded metadata and detector categories.
- Agent ingestion and admin queries use separate credentials.
- Dashboard tokens are stored server-side.
- PostgreSQL requires network segmentation, least privilege, backups, and retention controls.

## Not included

No browser request interception, upload blocking, clipboard monitoring, TLS interception, kernel filtering, desktop-app traffic control, SSO, policy distribution, or production identity management.
