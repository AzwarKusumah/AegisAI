# AegisAI Detection Engine

Local-first inspection with a detector registry, built-in secret and PII detection, optional Gitleaks CLI integration, and bounded in-memory extraction for text, PDF, DOCX, XLSX, and ZIP files.

Install from this directory:

    python -m pip install -e ".[dev]"

For PDF/DOCX/XLSX extraction, install the documents extra:

    python -m pip install -e ".[documents]"

The Rust endpoint agent invokes the package as a local subprocess and streams file bytes to its stdin. No temporary file is required for the selected upload. Configure the agent with AEGIS_ENGINE_PATH pointing at this directory and AEGIS_PYTHON pointing at the Python executable.

Gitleaks is optional and activates when its executable is on PATH. Findings contain rule IDs, categories, severity, confidence, document names, and offsets only; matched values are never returned. Unsupported, encrypted, image-only, oversized, or unreadable files are reported as incomplete rather than clean.

The extension must be explicitly enabled by the local user before it reads selected file bytes. The content is sent only to the local Native Messaging host; the control plane receives metadata only.
