# AegisAI DLP policy engine

## Policy model

AegisAI uses a policy structure inspired by the concepts documented in Forcepoint DLP:

- **Classifiers** describe the data or file to protect. Current built-ins identify cloud credentials, private keys, source-control tokens, credential assignments, email addresses, Indonesian mobile numbers, NIK candidates, and payment-card candidates. File properties include provider, extension, size, MIME type, and exact SHA-256 file fingerprints.
- **Rules** combine classifiers with minimum severity, risk score, provider, extension, and priority. The lowest priority number is evaluated first; the first matching rule returns its action.
- **Exceptions** belong to a parent policy. They are evaluated only after the parent rule matches. All configured exception dimensions must match. An exception can allow, audit, or block.
- **Resources and remediation** are represented in this release by the protected AI provider, file type, endpoint/browser scope, and action (block, audit, or allow).

This is intentionally a smaller endpoint/browser implementation, not a feature-complete clone of Forcepoint DLP.

## Enforcement flow

1. A supported AI-provider page raises a file input, drop, or file-paste event.
2. The extension temporarily holds the event and sends file bytes through Native Messaging to the local Agent.
3. The Agent inspects supported document formats locally, calculates SHA-256, and retrieves the enrolled device's active policy set.
4. The policy evaluator returns block, audit, or allow. The extension either discards the pending attachment or replays the file event to the provider page.
5. The Agent records the policy decision and enforcement outcome. Original bytes and unredacted findings are not uploaded to the Control Plane.
6. A policy can optionally share a short, redacted text preview. Detected spans are masked before the preview leaves the endpoint.

The Agent fails closed for remote-policy retrieval errors and incomplete document inspection when the remote policy bundle has `fail_closed: true`.

## Supported inspection formats and limits

The local engine currently extracts plain text and common text/code formats, PDF text, DOCX paragraphs/tables, XLSX cell text, and bounded ZIP contents containing supported formats. The browser transfer inspection limit is 10 MiB. Encrypted/oversized files and PDFs containing images are not fully inspected; OCR is not implemented. Such failures are treated as incomplete inspection and blocked under the default fail-closed device policy.

## Enforcement scope and non-goals

Browser enforcement currently targets file selection, drag-and-drop, and pasted files on the supported ChatGPT, Claude, Gemini, Copilot, Perplexity, and Grok domains. It is not a network gateway and does not prevent uploads from arbitrary desktop applications, unsupported websites, alternate browser profiles without the extension, or direct API clients. Browser pages may change their upload implementation; provider-specific regression tests are required. This mechanism should not be represented as universal endpoint DLP or guaranteed network-wide prevention.

Not implemented in this release: cumulative/drip rules, database fingerprinting, near-duplicate document fingerprinting, ML-trained classifiers, OCR, clipboard text inspection, enterprise label integrations, and network gateway enforcement.

## References

- Forcepoint, [What's in a policy?](https://help.forcepoint.com/dlp/10/dlphelp/FF9308AE-980A-48CD-AC96-3894D08B2859.html)
- Forcepoint Data Security Cloud, [Policies](https://help.forcepoint.com/datasecurity/en-us/onlinehelp/guid-5de13f55-c40c-4f7d-b958-9d74d2baf515.html)
- Forcepoint, [Classifiers](https://help.forcepoint.com/datasecurity/en-us/onlinehelp/guid-581057f4-4674-4288-8fa9-bcaf770d5c4b.html)
- Forcepoint, [File fingerprint](https://help.forcepoint.com/datasecurity/en-us/onlinehelp/guid-2c627570-de23-4a5b-a4ef-12f64b68ce24.html)
