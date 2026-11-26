# AegisAI Browser Extension

Version 0.5.0 builds separate Chromium and Firefox packages from the same TypeScript source. Both use Manifest V3 with browser-specific background declarations.

## Build both browser packages

    npm install
    npm run typecheck
    npm run build
    npm run test:packages

Load the generated dist/chromium or dist/firefox directory as an unpacked/temporary extension. The extension starts protection automatically; there is no opt-in switch in the popup.

## Supported services and enforcement

The extension currently covers ChatGPT, Claude, Gemini, Microsoft Copilot, Perplexity and Grok on their allowlisted HTTPS origins.

On supported pages, the content script intercepts standard file-input change events plus file drop and file paste events. The file is inspected by the local Agent before the original page event is replayed. A block decision suppresses the event and clears a selected file input. An inspection or policy-service failure stops the file from being passed through the supported event path.

The extension does not inspect text-only prompts or clipboard text. It cannot guarantee prevention of every upload path: providers may change their DOM, use a different upload flow, or transmit data through paths not represented by these events. Validate each provider in a controlled test environment.

## Data handling

- File bytes are sent only to the local Rust Native Messaging host.
- The Control Plane receives categories, severity, risk score, file metadata and policy outcomes; it does not receive raw files or detected secret values.
- A policy may opt to share a short redacted preview. This is disabled by default and should be enabled only after a data-handling review.
- The popup is informational and reads the native Agent status. It reports ready only when the local Agent is configured and the Control Plane health endpoint responds successfully. It has no opt-in switch; inspection starts automatically on supported pages.

## Limits

- Maximum file size is 10 MiB. Oversized files are held back instead of being passed to the supported page event handler.
- Supported extraction: plain text/code, text-based PDF, DOCX, XLSX and ZIP archives containing supported files.
- Encrypted documents, image-only/scanned PDFs, images and unsupported formats cannot be inspected by this release; managed devices fail closed.
- There is no OCR, fingerprinting, ML classification, browser network interception, TLS inspection, OS/kernel network control or desktop-app enforcement.
- Extension-store publication/signing is separate. A consumer browser requires a one-time unpacked load until the extension is published; enterprise administrators can use their browser's managed force-install policy.
