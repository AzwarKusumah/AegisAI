# AegisAI

**Protect your data before it reaches AI.**

AegisAI is a self-hosted AI Data Loss Prevention platform designed to inspect sensitive data locally and provide an audit trail of activity involving external AI services.

> Early development. v0.4 adds lightweight deployment options and separate Chromium/Firefox extension packages. The current extension observes selected files and performs local inspection; it does not guarantee that an upload is blocked.

## Platform

| Component | Technology | Responsibility |
|---|---|---|
| Endpoint agent | Rust | Native Messaging, local file streaming, device identity, event spool |
| Browser extension | TypeScript / WebExtensions | Explicit opt-in, observe file selection, stream bytes to local agent |
| Control plane | Go | Authenticated metadata ingestion and audit queries |
| Detection engine | Python | Local content extraction, secret and PII detection, optional Gitleaks |
| Dashboard | Next.js / React | Protected audit UI for file, user/device, provider, and inspection visibility |
| Storage | PostgreSQL | Metadata-only event storage |

## Install the server

The dashboard is a single Next.js application with two supported deployment modes:

- **Docker Compose:** PostgreSQL + Go control plane + Next.js standalone runtime. The Go image is a stripped static binary on Distroless; the dashboard runtime excludes the build toolchain.
- **systemd:** native Go binary and Next.js standalone server managed by two systemd units. Requires Linux, Go 1.23+, Node.js 20+, npm, and PostgreSQL.

Run the interactive setup from the repository root:

    chmod +x deployments/install.sh
    ./deployments/install.sh

Or choose a deployment non-interactively:

    ./deployments/install.sh --mode docker
    sudo ./deployments/install.sh --mode systemd

The setup wizard generates a private .env with random credentials on first run. Save the dashboard password printed by the installer. The dashboard listens on 127.0.0.1:3000; configure a trusted TLS reverse proxy for remote access.

Full deployment details: deployments/README.md.

## Build browser extensions

From apps/extension:

    npm install
    npm run typecheck
    npm run build
    npm run test:packages

Builds are generated separately:
- apps/extension/dist/chromium — Chrome, Edge, Brave, and other Chromium browsers (Manifest V3 service worker).
- apps/extension/dist/firefox — Firefox (Manifest V3 background scripts).

Load the corresponding directory as an unpacked/temporary extension from the browser's extension developer page. Installation and Native Messaging registration are separate endpoint setup steps; see apps/extension/README.md and agent/rust/README.md.

## Download prebuilt packages from GitHub Actions

GitHub Actions builds the endpoint agent and browser extensions. You do not need Rust or Node.js on the endpoint just to install the downloaded packages.

For every push to main or this feature branch, and for pull requests targeting main:

1. Open the repository's Actions tab.
2. Select the latest successful **Build endpoint and browser packages** run.
3. Download the artifacts:
   - release-extensions: Chromium and Firefox ZIP packages.
   - release-agent-windows-x86_64: Windows installer bundle.
   - release-agent-linux-x86_64 and release-agent-linux-aarch64: Linux bundles.
   - release-agent-macos-x86_64 and release-agent-macos-aarch64: Intel and Apple Silicon macOS bundles.
4. Verify the download with the matching .sha256 file before installation.

Build artifacts are retained by GitHub Actions for 30 days. When a version tag matching v* is pushed, the same workflow attaches all packages and checksums to a GitHub Release.

For example, after the change is merged and you are ready to publish v0.4.0:

    git tag v0.4.0
    git push origin v0.4.0

The extension ZIPs contain a loadable unpacked extension package. They are not Chrome Web Store CRX files or Mozilla-signed XPI files; browser-store publication/signing is a separate step.

## Local inspection flow

1. The user explicitly enables local inspection in the browser extension popup (off by default).
2. When a file is selected in a supported AI-provider page, the extension reads its bytes in memory.
3. The extension sends ordered 256 KiB chunks over Native Messaging to the Rust agent on the same endpoint.
4. Rust validates the provider, filename, transfer sequence, and 10 MiB limit.
5. Rust streams bytes to the local Python inspection process via stdin. No temporary copy is created. The scan process has a 30-second timeout.
6. Python returns only a compact summary: finding count, unique categories, highest severity, risk score, and completion status. Matched values and extracted text never enter the event.
7. Rust clears the transfer buffer, stores the metadata event locally, and forwards metadata only to the Go control plane.

The control plane never receives file bytes, prompts, extracted document text, clipboard content, or matched sensitive values.

## Event semantics

- attachment_selected: legacy metadata-only observation.
- inspection_completed: local inspection completed.
- unknown: inspection could not be completed; do not interpret it as clean.
- upload_prevented: reserved for a future trusted enforcement component that positively confirms prevention.

A selected attachment is not proof that a provider upload completed. The current milestone does not prevent the provider request from leaving the endpoint.

## Development

Install the local inspector from the repository root:

    python -m pip install -e ./engine

For PDF/DOCX/XLSX extraction support:

    python -m pip install -e "./engine[documents]"

On Windows, register the Native Messaging host using agent/rust/installers/install-windows.ps1. Use -Browser chrome or edge with -ExtensionId, or -Browser firefox.

Configure dashboard credentials on the server:
- AEGIS_DASHBOARD_USER and AEGIS_DASHBOARD_PASSWORD protect the dashboard and its API routes with HTTP Basic Authentication.
- AEGIS_API_URL and AEGIS_ADMIN_TOKEN connect the server-side dashboard route to the Go control plane.
- Never prefix credentials with NEXT_PUBLIC_.

Configure the Rust agent on each endpoint with:
- AEGIS_PYTHON: local Python executable.
- AEGIS_ENGINE_PATH: absolute path to the engine directory.
- AEGIS_CONTROL_PLANE_URL and AEGIS_AGENT_TOKEN for remote metadata ingestion.
- AEGIS_EXTENSION_ORIGINS with the installed Chromium extension origin. Firefox uses its fixed add-on ID and registered host manifest.

## Security limitations

- Extension scanning is opt-in and disabled by default.
- Current size limit is 10 MiB per file and one file is scanned at a time.
- Selected bytes are read locally by the extension and temporarily buffered in endpoint memory for scanning.
- Unsupported, encrypted, image-only, oversized, or failed inspections are marked failed/unknown, never clean.
- No browser network interception, upload blocking, clipboard monitoring, TLS interception, OS network filtering, policy administration, SSO, or desktop AI-app enforcement is implemented.
- OS username attribution is local account context, not enterprise-verified identity.
- Shared development bearer tokens are not production authentication.
- Dashboard Basic Authentication should be used behind HTTPS for network-accessible deployments.

See docs/security/audit-and-privacy.md before deployment.
