# Rust Endpoint Agent

Version 0.3 adds local file-inspection streaming through Native Messaging.

## Build

    cargo test
    cargo build --release

## Runtime configuration

- AEGIS_EXTENSION_ORIGINS: exact browser extension origin allowlist (comma-separated).
- AEGIS_CONTROL_PLANE_URL: optional Go control-plane base URL.
- AEGIS_AGENT_TOKEN: agent event-ingestion token.
- AEGIS_PYTHON: Python executable; defaults to python on Windows and python3 elsewhere.
- AEGIS_ENGINE_PATH: path to the repository engine directory. Defaults to an engine directory beside the agent executable.
- AEGIS_ALLOW_UNVERIFIED_ORIGIN=1: development-only origin bypass. Never use in managed deployments.

Install the local inspector once:

    python -m pip install -e ./engine

For PDF/DOCX/XLSX support:

    python -m pip install -e ".[documents]" --no-deps

The agent streams selected-file bytes into the Python process stdin. It does not create a temporary copy of the selected file. File-size limit is 10 MiB; Native Messaging transfers use ordered 256 KiB chunks. Raw content is never placed in the event, local event spool, or control-plane request.

The agent reports inspection categories and risk metadata. It never reports matched text, passwords, keys, or PII values. Unsupported or failed inspections are marked failed/unknown, not clean.

The agent does not block network uploads in this milestone. Selection-triggered scanning is detection, not enforcement. A future policy/enforcement component must be implemented and independently confirm blocking before any event can be marked prevented.
