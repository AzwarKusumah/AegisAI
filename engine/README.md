# AegisAI Detection Engine

Local-first text inspection with a modular detector registry, built-in secret detection, PII detection, and deterministic risk scoring.

Install and test:

    python -m pip install -e ".[dev]"
    python -m pytest -q

Findings contain rule IDs, categories, severity, confidence, and offsets only. The detector must never return matched secret values. File extraction and optional Gitleaks integration are subsequent increments in this component.
