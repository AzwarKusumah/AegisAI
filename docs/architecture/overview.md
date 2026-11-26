# Architecture Overview

AegisAI uses a self-hosted control plane with separate endpoint and browser components. Document extraction and content matching run on each endpoint. The server receives event metadata, policy decisions, and an optional short redacted preview only when an administrator explicitly enables that feature.

## Components

1. Browser extension observes supported AI-provider file input, drop and paste events. Before passing the standard event to the page, it transfers selected files to the local Native Messaging Agent.
2. Rust endpoint Agent validates Native Messaging input, provider domain, basename, chunk order and size limit. It buffers one file in memory, invokes the local Python inspector through stdin, retrieves the enrolled device's current policy set, evaluates it and returns the decision to the extension.
3. Python detection engine extracts supported file formats and runs built-in secret and PII classifiers. Finding spans are used to redact an optional preview; matched values are never included as finding metadata.
4. Go Control Plane handles one-use device enrollment, device token revocation, policy CRUD and per-device policy distribution, event validation and audit queries.
5. Next.js Dashboard exposes activity, file records, endpoint devices and policy administration. It displays a redacted preview only when the policy explicitly permits it.

## Policy evaluation

A policy contains classifiers (content categories), scope/resource constraints (AI provider and file extension), rule conditions (minimum severity and risk), exceptions, priority and a remediation action (block, audit or allow).

Enabled policies are sorted by ascending priority. The first matching policy decides the action. A matching exception exempts that policy. The Control Plane returns fail_closed=true; enrolled agents block when a policy cannot be fetched or inspection is incomplete.

The initial database startup seeds two editable policies:
- Block high-severity cloud credentials, private keys, source-control tokens and credential assignments.
- Audit medium-or-higher personal data findings.

## Event lifecycle

Browser attachment event -> local file extraction and classification -> device policy fetch/evaluation -> extension event gate -> enforcement acknowledgement -> local spool -> authenticated Control Plane event ingestion -> PostgreSQL -> Dashboard.

An upload_prevented event means the extension confirms that it stopped the supported browser attachment event before it was passed to the page. It does not prove all alternative network or upload paths were blocked.

## Trust boundaries

- Browser pages and provider DOMs are untrusted and can change.
- The extension only runs on the allowlisted provider origins.
- Native Messaging host registration is restricted to the extension origin.
- The Agent holds one bounded file transfer at a time (10 MiB maximum) and zeroizes its transfer buffer after processing.
- Original file bytes and raw matches stay on the endpoint.
- Optional preview text is redacted locally and transmitted only when a matching policy enables it.
- Device tokens are individually scoped and revocable; the Control Plane stores only hashes.
- Dashboard API credentials remain server-side.

## Not included

No browser network interception, TLS interception, kernel filtering, desktop-app upload control, OCR, file/database fingerprinting, label integration, ML training, drip/cumulative policies, enterprise identity mapping or a managed extension deployment channel. This build is an early browser DLP control, not a full enterprise DLP gateway.
