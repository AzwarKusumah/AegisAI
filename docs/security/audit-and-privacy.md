# Audit, Privacy, and Attribution

## Local inspection behavior

The extension starts inspection automatically on supported AI-provider file input, drop and paste events. Before passing the standard attachment event to the provider page, it streams the selected file to the local Rust Agent through Native Messaging.

The current file-size limit is 10 MiB. The Agent buffers one selected file at a time, invokes the Python engine through stdin, and zeroizes the Rust transfer buffer after processing. The browser extension does not intentionally write a copy of the file to disk.

## Allowed event data

- generated event ID and UTC timestamp;
- provider name and hostname only;
- file basename, extension, MIME type and byte size;
- agent-generated device ID and hostname;
- local OS username and explicit identity-source label;
- inspection status, risk score, severity and detector category identifiers;
- policy ID/name/action;
- browser enforcement result and component;
- optional short redacted preview only if the matching policy explicitly allows it.

## Forbidden event data

- original file bytes or unredacted extracted document text;
- prompts, conversation contents or clipboard text;
- matched passwords, API keys, tokens, private keys or PII values;
- full local file paths;
- browser cookies, authorization headers or AI-provider session tokens.

The local engine extracts supported documents in memory. A redacted preview masks detected spans before it leaves the endpoint. Redaction covers known detector matches only; it cannot guarantee that the rest of a preview is free of confidential context. Preview sharing is disabled in the seeded policies and should be enabled only after a data-handling review.

## Supported formats

Text/code formats, text-based PDF, DOCX, XLSX and ZIP archives containing supported files can be inspected. Encrypted documents, image-only/scanned PDFs, oversized files and unsupported formats are uninspectable. Managed-device policies are fail-closed for these cases.

No OCR, arbitrary image recognition, file/database fingerprinting, enterprise labels or ML-based classification is included.

## Dashboard access

The Next.js dashboard uses an HTTP-only, SameSite=Strict signed session cookie. The session is signed with the server-side AEGIS_ADMIN_TOKEN. Deploy behind HTTPS whenever reachable over a network. The Go Control Plane admin token remains server-side and is never sent to browser JavaScript. This is an initial access gate, not a substitute for enterprise SSO, per-user RBAC, MFA or audited administrator sessions.

## Event semantics

- inspection_completed: local inspection completed successfully.
- unknown: inspection could not be completed; it must never be interpreted as clean.
- upload_prevented: the extension confirmed that it stopped the supported attachment event before it was passed to the page. This is not proof that every possible provider upload or network path was blocked.
- observed: the inspection result was recorded without a browser block.

Do not label attachment selection as a leak. Do not interpret a browser event block as network-wide enforcement.

## Attribution

The initial Agent reports local_os_account. This is device-session context, not enterprise-verified identity. A production deployment should integrate device trust and an identity provider.

## Production security requirements

- HTTPS for all remote enrollment, policy retrieval and event delivery;
- browser-store signing/publication or managed extension force-install;
- signed installer and Agent binaries;
- per-device credential rotation/revocation, rate limiting and replay protection;
- OIDC/SAML and role-based dashboard access;
- retention, deletion and audited administrator access;
- database TLS, backups and least privilege;
- employee notice, purpose limitation and approved retention.
