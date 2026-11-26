# AegisAI

**Protect sensitive data before it is shared with AI services.**

AegisAI is a self-hosted data-protection platform for supported AI-provider web apps. It inspects selected attachments locally, evaluates centrally managed policies, stops standard browser attachment events when a block rule matches, and records metadata-only audit events.

> Early development. The current browser enforcement is a client-side control for supported attachment-selection, drop, and paste paths. It is not a network gateway, TLS interceptor, or OS-wide DLP agent; browser/site behavior can change and alternative upload paths may bypass a DOM-level control.

## Platform

| Component | Technology | Responsibility |
|---|---|---|
| Endpoint agent | Rust | Native Messaging, local document inspection, device identity, policy evaluation, event spool |
| Browser extension | TypeScript / WebExtensions | Auto-on attachment inspection and best-effort browser event enforcement on supported AI sites |
| Control plane | Go | Device enrollment, policy CRUD/distribution, event ingestion, audit queries |
| Detection engine | Python | Local text, PDF, DOCX, XLSX and ZIP extraction; built-in secret and PII classifiers |
| Dashboard | Next.js / React | Activity, device inventory, file metadata, redacted previews and DLP policy administration |
| Storage | PostgreSQL | Policy definitions, device credentials and metadata-only security events |

## Install the server

Use the prebuilt AegisAI Setup TUI from the repository's GitHub Actions artifacts or a GitHub Release. Extract the binary and run it from the repository root:

    ./aegisai-setup-linux-x86_64
    ./aegisai-setup-linux-aarch64
    ./aegisai-setup-macos-aarch64
    .\aegisai-setup-windows-x86_64.exe

The TUI collects deployment type, PostgreSQL database/user/password, dashboard username/password, agent ingestion token, internal admin API token, dashboard port, and network bind address. Secrets are masked while typing. Blank secrets are generated securely. The TUI writes a private .env file and starts the selected deployment.

- Docker Compose creates PostgreSQL 17 Alpine, Go control plane, and Next.js dashboard containers.
- Native systemd installs the Go API and Next.js standalone dashboard as Linux services, using an existing PostgreSQL database.

Full setup details: deployments/setup/README.md.

## Windows endpoint installation

Download the **AegisAI-Installer-Windows-x86_64.exe** artifact from the latest successful Build endpoint and browser packages workflow run.

The self-contained installer includes:
- Rust endpoint Agent.
- Python 3.12 embeddable runtime and the PDF/DOCX/XLSX inspection dependencies.
- Local detection engine.
- Chromium extension package.

No PowerShell window, Rust toolchain, or separate Python installation is needed on the endpoint. The installer registers the Native Messaging host for the selected browser and enrolls the device with a one-time code.

The browser extension must still be loaded unpacked once from the folder extracted by the installer unless the extension is published to a browser store or deployed through an enterprise force-install policy. This is a browser platform requirement; the installer opens the extension settings page and shows the exact folder to load.

## Build browser extensions

From apps/extension:

    npm install
    npm run typecheck
    npm run build
    npm run test:packages

Generated packages:
- apps/extension/dist/chromium — Chrome, Edge and Chromium browsers.
- apps/extension/dist/firefox — Firefox.

The extension starts protection automatically; there is no opt-in popup toggle. Only the allowlisted provider domains are covered.

## Download prebuilt packages from GitHub Actions

GitHub Actions builds the endpoint agent, browser extensions, setup utility, and the self-contained Windows installer.

1. Open the repository's Actions tab.
2. Select the latest successful **Build endpoint and browser packages** run.
3. Download the artifacts:
   - release-installer-windows: one-file Windows installer (.exe).
   - release-extensions: Chromium and Firefox ZIP packages for manual browser installation.
   - release-agent-linux-* and release-agent-macos-*: native bundles for Linux and macOS.
   - release-setup-* artifacts: prebuilt AegisAI setup TUI for Windows, Linux, and macOS.
4. Verify downloads using the matching .sha256 files.

Build artifacts are retained by GitHub Actions for 30 days. Version tags matching v* attach all packages and checksums to a GitHub Release.

## Local inspection and enforcement flow

1. The browser extension observes file attachment selection, drop, and paste events on supported AI-provider domains.
2. Before the page receives the standard attachment event, the extension streams bounded 256 KiB chunks to the local Rust Native Messaging host.
3. Rust validates the provider, filename, transfer sequence, and 10 MiB per-file limit.
4. Rust streams bytes to the local Python inspector through stdin. No temporary copy is created. The scan process has a 30-second timeout.
5. The inspector extracts supported document text and evaluates built-in secret and PII classifiers. Detected spans are replaced in an optional short preview before it can be sent to the server.
6. The Agent retrieves the enrolled device's policy set from the Control Plane and evaluates rules by ascending priority. The first matching rule chooses block, audit, or allow. A matching exception skips its parent policy.
7. A block decision keeps the selected file from being passed through the supported browser event path. An inspection or policy-service failure is fail-closed for managed devices. The Agent records a browser-enforcement result and forwards event metadata; the original file bytes and raw matches are not sent.
8. Dashboard users can review events and, only when explicitly enabled in a policy, a limited redacted preview.

The Control Plane never receives the original file bytes. Redacted previews are optional and may still contain other confidential context; enable them only when permitted by the organization's data-handling rules.

## Policy model

A policy contains:
- Rule conditions: minimum severity, risk score, content categories, provider and file-extension scope.
- Exceptions: approved categories, providers or file extensions that exempt a matching rule.
- Action: block, audit, or allow.
- Priority: lower numbers are evaluated first.
- Optional redacted-preview sharing.

A new installation seeds two editable policies: block high-risk credentials and audit personal-data findings. The policy engine is intentionally smaller than a full enterprise DLP suite; there is no drip/cumulative matching, exact database/file fingerprinting, enterprise labeling integration, OCR, ML classifier training, or endpoint network gateway.

The structure follows common enterprise DLP concepts used by Forcepoint—policies, rules, exceptions, content classifiers, resources and remediation actions—without claiming feature parity.

## Event semantics and enforcement boundary

- inspection_completed: a supported local inspection finished.
- unknown: inspection could not complete; it is not interpreted as clean.
- upload_prevented: the extension confirmed that it stopped the supported browser attachment event before it was passed to the page. It does not prove that all network paths or alternative upload mechanisms were blocked.
- observed: an inspection was recorded without a confirmed browser block.

A browser/site update can change event handling. Validate the exact AI-provider versions used in your environment before relying on this as a security boundary.

## Supported inspection and limits

- Current providers: ChatGPT, Claude, Gemini, Microsoft Copilot, Perplexity and Grok.
- File size: 10 MiB maximum per file; larger files are held back because they cannot be inspected by this build.
- Formats: text/code formats, text-based PDF, DOCX, XLSX and ZIP containing supported files.
- Encrypted documents, scanned/image-only PDF, unsupported file formats and extraction failures are not marked clean; they trigger fail-closed behavior on managed endpoints.
- OCR, arbitrary images, clipboard text, browser request interception, TLS inspection, OS network filtering, desktop AI applications and non-browser upload channels are not covered.

## Security notes

- Use HTTPS for remote enrollment and event delivery. Plain HTTP to a public IP is available only as an explicit short-lived testing option and exposes pairing codes and device tokens.
- Keep PostgreSQL and Dashboard internal ports private; expose the Dashboard and Control Plane through a TLS reverse proxy.
- Device tokens are individual and revocable; only their hashes are stored by the Control Plane.
- Redacted-preview sharing is disabled by default in policies.
- The Windows installer is self-contained but not Authenticode-signed yet; Windows SmartScreen may show an unknown-publisher warning.
- Browser extension auto-install requires browser-store publication or managed enterprise force-install configuration.

See docs/security/audit-and-privacy.md and docs/security/policy-engine.md before deployment.
