# AegisAI Detection Engine

Local-first inspection with a detector registry, built-in secret and PII detection, optional Gitleaks CLI integration, and bounded in-memory extraction for text, PDF, DOCX, XLSX, and ZIP files.

Install from this directory:

    python -m pip install -e ".[dev,documents]"
    python -m pytest -q

Gitleaks is optional and is activated when its executable is available on PATH. Findings contain rule IDs, categories, severity, confidence, and offsets only; matched values are never returned.

Archive extraction is bounded, rejects traversal/symlinks/nested ZIPs, and never writes members to disk. Encrypted or image-only documents are not treated as clean. OCR is not part of this version.

The engine is not yet wired into the Rust agent or browser upload flow.
