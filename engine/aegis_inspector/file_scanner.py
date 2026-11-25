"""Compatibility facade around the canonical InspectionEngine."""
from pathlib import Path

from .engine import InspectionEngine, InspectionResult, create_default_engine


class FileInspectionEngine:
    def __init__(self, include_gitleaks: bool = True) -> None:
        self.engine: InspectionEngine = create_default_engine(include_gitleaks=include_gitleaks)

    def inspect_text(self, text: str) -> InspectionResult:
        return self.engine.inspect_text(text)

    def inspect_file(self, path: str | Path) -> InspectionResult:
        return self.engine.inspect_file(path)
