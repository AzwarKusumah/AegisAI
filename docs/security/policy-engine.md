# AegisAI Policy Engine

## Design

AegisAI adopts the common enterprise DLP separation of policy rules, exceptions, content classifiers, resources/scope and remediation actions.

- **Classifiers:** currently built-in categories for cloud credentials, private keys, source-control credentials, credential assignments, email, phone and Indonesian national-identifier candidates.
- **Rule conditions:** minimum severity, minimum risk score and optional classifier category matching.
- **Resources/scope:** optional AI-provider and file-extension constraints.
- **Exceptions:** per-policy category, provider or extension matches that exempt an otherwise matching policy.
- **Actions:** block, audit or allow.
- **Priority:** lower numbers are evaluated first; the first matching enabled policy determines the result.
- **Preview disclosure:** an optional, explicit per-policy switch controls whether a short redacted preview is included in the metadata event.

## Default policies

On an empty policy table the Control Plane seeds:
1. baseline-block-credentials — block high-severity credential findings.
2. baseline-audit-personal-data — audit medium-or-higher personal-data findings.

Both can be edited or removed through Dashboard → Policies.

## Failure handling

The device policy endpoint returns fail_closed=true. An enrolled Agent blocks an attachment if policy retrieval fails, or if inspection cannot complete. When the Control Plane is not configured on an unmanaged local-only Agent, the local fallback does not apply a remote policy.

## Current scope and limitations

This release evaluates one policy rule per policy object and does not implement cumulative/drip thresholds, fingerprint databases, exact file fingerprints, enterprise file labels, OCR, ML training or administrator incident workflows. The built-in classifier set is intentionally small. Custom dictionaries, regex editor and classifier lifecycle are future work.

Browser blocking is a best-effort gate around supported file input, drop and paste events on the allowlisted AI sites. This is not a network gateway or system-wide DLP enforcement point.

## Enterprise DLP reference

Forcepoint describes policies using rules, exceptions, content classifiers and resources, with classifier families such as patterns/phrases, file properties and fingerprints. AegisAI borrows this separation of concerns as an architectural model; it does not claim feature parity with Forcepoint DLP.
