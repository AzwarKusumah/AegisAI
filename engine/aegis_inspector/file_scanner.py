"""File-level orchestration for the local inspection engine."""
from pathlib import Path

from .engine import DetectorRegistry, InspectionEngine, InspectionResult, SecretDetector, PIIDetector
from .extractors import ExtractionError, MAX_FILE_BYTES, extract_file
from .gitleaks import GitleaksDetector

class FileInspectionEngine:
    def __init__(self, include_gitleaks: bool = True):
        registry = DetectorRegistry()
        registry.register(SecretDetector())
        registry.register(PIIDetector())
        self.gitleaks = GitleaksDetector() if include_gitleaks else None
        if self.gitleaks and self.gitleaks.available:
            registry.register(self.gitleaks)
        self.engine = InspectionEngine(registry)

    def inspect_text(self, text: str) -> InspectionResult:
        return self.engine.inspect_text(text)

    def inspect_file(self, path: str | Path) -> InspectionResult:
        file_path = Path(path)
        try:
            if file_path.stat().st_size > MAX_FILE_BYTES:
                raise ExtractionError("file exceeds maximum size")
            documents = extract_file(file_path.read_bytes(), file_path.name)
        except (OSError, ExtractionError, ValueError, TypeError) as exc:
            from .engine import InspectionResult
            from .engine import Finding
            from dataclasses import dataclass
            return InspectionResult((), 0, source_name=file_path.name) if False else InspectionResult((), 0, False)  # replaced below
        findings = []
        errors = []
        for name, text in documents:
            result = self.engine.inspect_text(text)
            findings.extend(result.findings)
        findings.sort(key=lambda item: (item.start, item.end, item.rule_id))
        weights = {"low": 20, "medium": 40, "high": 70, "critical": 100}
        scores = [round(weights[item.severity] * item.confidence) for item in findings]
        risk = min(100, max(scores, default=0) + min(15, max(0, len(findings)-1)*5))
        return InspectionResult(tuple(findings), risk)
