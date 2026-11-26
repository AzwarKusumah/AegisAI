# Rust Endpoint Agent

Version 0.3 adds local file-inspection streaming through Native Messaging.

## Build

    cargo test
    cargo build --release

## Prebuilt endpoint packages

The GitHub Actions workflow builds downloadable endpoint bundles for:
- Windows x86_64
- Linux x86_64 and ARM64
- macOS Intel x86_64 and Apple Silicon ARM64

Each bundle includes the native Rust executable, the local Python engine source, and the platform's Native Messaging installer. Rust is not required on endpoint machines. Python 3.11+ is required; the installer creates an isolated virtual environment and installs the document dependencies.

Download the matching build artifact from Actions, or download the assets attached to a versioned GitHub Release. Verify the archive using its adjacent SHA-256 file.

Windows:

    .\install-windows.ps1 -Browser chrome -ExtensionId YOUR_EXTENSION_ID
    .\install-windows.ps1 -Browser firefox

Linux/macOS:

    ./install-unix.sh --browser chrome --extension-id YOUR_EXTENSION_ID
    ./install-unix.sh --browser firefox

The installer registers the Native Messaging host and writes per-user configuration. For Chromium, install the extension first and copy its ID from the browser extension-management page.

## Runtime configuration

- AEGIS_EXTENSION_ORIGINS: exact Chromium extension origin allowlist (comma-separated). Firefox launch is checked against the registered manifest path and fixed add-on ID.
- AEGIS_CONTROL_PLANE_URL: optional Go control-plane base URL.
- AEGIS_AGENT_TOKEN: agent event-ingestion token.
- AEGIS_PYTHON: Python executable; defaults to python on Windows and python3 elsewhere.
- AEGIS_ENGINE_PATH: path to the repository engine directory. Defaults to an engine directory beside the agent executable.
- AEGIS_ALLOW_UNVERIFIED_ORIGIN=1: development-only origin bypass. Never use in managed deployments.

For Windows Native Messaging registration, see installers/README.md.

From the repository root, install the local inspector once:

    python -m pip install -e ./engine

For PDF/DOCX/XLSX support:

    python -m pip install -e "./engine[documents]"

The agent streams selected-file bytes into the Python process stdin. It does not create a temporary copy of the selected file. File-size limit is 10 MiB; Native Messaging transfers use ordered 256 KiB chunks. Raw content is never placed in the event, local event spool, or control-plane request.

The agent reports inspection categories and risk metadata. It never reports matched text, passwords, keys, or PII values. Unsupported or failed inspections are marked failed/unknown, not clean.

The agent does not block network uploads in this milestone. Selection-triggered scanning is detection, not enforcement. A future policy/enforcement component must be implemented and independently confirm blocking before any event can be marked prevented.
