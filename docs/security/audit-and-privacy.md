# Audit, Privacy, and Attribution

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

Filenames can themselves contain sensitive information. Provide configurable collection, access control, and retention before production deployment.

## Event semantics

attachment_selected: file selected in a supported AI page.
send_action_observed: provider-specific send action observed; not implemented.
inspection_completed: local inspection metadata attached; not implemented in browser pipeline.
upload_prevented: trusted enforcement component positively confirmed the request did not leave the endpoint.
unknown: final state could not be determined.

Do not label attachment selection or send-action observation as a successful leak. Do not label a finding as prevented without enforcement confirmation.

## Attribution

The initial agent reports local_os_account. This is not enterprise-verified identity. The dashboard must show the identity source. Production should integrate device enrollment and an identity provider.

## Production security requirements

- per-agent credentials or mTLS with rotation and revocation;
- OIDC/SAML and role-based dashboard access;
- signed installer and agent binaries;
- Native Messaging origin allowlist;
- access-controlled local spool, bounded queue, and replay protection;
- database TLS, backups, retention, and audited administrator access;
- request limits, schema validation, rate limiting, and integrity monitoring;
- employee notice, purpose limitation, and approved retention.
