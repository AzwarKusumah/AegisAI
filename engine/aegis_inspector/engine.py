"""Local-first, metadata-only inspection engine."""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from pathlib import Path
import re
import shutil

@dataclass(frozen=True, slots=True)
class Finding:
    rule_id: str
    category: str
    severity: str
    start: int
    end: int
    confidence: float
    detector: str
    document_name: str | None = None

@dataclass(frozen=True, slots=True)
class InspectionResult:
    findings: tuple[Finding, ...]
    risk_score: int
    complete: bool = True
    errors: tuple[str, ...] = ()
    source_name: str | None = None

    def to_dict(self):
        return {
            "source_name": self.source_name,
            "findings": [asdict(item) for item in self.findings],
            "risk_score": self.risk_score,
            "complete": self.complete,
            "errors": list(self.errors),
        }

class DetectorRegistry:
    def __init__(self):
        self._items = {}

    def register(self, detector):
        name = getattr(detector, "name", "")
        if not name or name in self._items or not callable(getattr(detector, "detect", None)):
            raise ValueError("invalid or duplicate detector")
        self._items[name] = detector

    def all(self):
        return tuple(self._items[key] for key in sorted(self._items))

class SecretDetector:
    name = "builtin-secrets"
    RULES = [
        ("aws-access-key", "cloud_credential", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "critical", .99),
        ("private-key-header", "private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "critical", 1.0),
        ("github-token", "source_control_credential", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), "critical", .99),
        ("credential-assignment", "credential", re.compile(r"(?im)\b[A-Za-z0-9_]*(?:password|passwd|pwd|api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*[^\s;]{8,}"), "high", .90),
    ]

    def detect(self, text):
        return [
            Finding(rule, category, severity, match.start(), match.end(), confidence, self.name)
            for rule, category, pattern, severity, confidence in self.RULES
            for match in pattern.finditer(text)
        ]

class PIIDetector:
    name = "builtin-pii"
    RULES = [
        ("email-address", "email", re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"), "medium", .98),
        ("indonesian-phone", "phone", re.compile(r"(?<!\w)(?:\+62|62|0)8[1-9][0-9]{7,11}(?!\w)"), "medium", .90),
        ("indonesian-nik-candidate", "national_identifier", re.compile(r"(?<!\d)\d{16}(?!\d)"), "high", .70),
    ]

    def detect(self, text):
        return [
            Finding(rule, category, severity, match.start(), match.end(), confidence, self.name)
            for rule, category, pattern, severity, confidence in self.RULES
            for match in pattern.finditer(text)
        ]

def score_findings(findings):
    weights = {"low": 20, "medium": 40, "high": 70, "critical": 100}
    scores = [round(weights[item.severity] * max(0.0, min(1.0, item.confidence))) for item in findings]
    return min(100, max(scores, default=0) + min(15, max(0, len(findings) - 1) * 5))

class InspectionEngine:
    def __init__(self, registry=None):
        self.registry = registry or DetectorRegistry()
        if registry is None:
            self.registry.register(SecretDetector())
            self.registry.register(PIIDetector())

    def inspect_text(self, text: str, source_name: str | None = None) -> InspectionResult:
        if not isinstance(text, str):
            raise TypeError("text must be str")
        findings, errors = [], []
        for detector in self.registry.all():
            try:
                findings.extend(replace(item, document_name=source_name) for item in detector.detect(text))
            except Exception:
                errors.append(detector.name + ":detector_failed")
        findings.sort(key=lambda item: (item.start, item.end, item.rule_id, item.detector))
        return InspectionResult(tuple(findings), score_findings(findings), not errors, tuple(errors), source_name)

    def inspect_bytes(self, data: bytes, filename: str) -> InspectionResult:
        from .extractors import ExtractionError, MAX_FILE_BYTES, extract_file
        if not isinstance(data, bytes):
            raise TypeError("data must be bytes")
        try:
            if len(data) > MAX_FILE_BYTES:
                raise ExtractionError("file exceeds maximum size")
            documents = extract_file(data, filename)
        except (ExtractionError, ValueError, TypeError):
            return InspectionResult((), 0, False, ("extraction_failed",), filename)

        findings, errors = [], []
        for document_name, text in documents:
            result = self.inspect_text(text, document_name)
            findings.extend(result.findings)
            errors.extend(result.errors)
        findings.sort(key=lambda item: (item.start, item.end, item.rule_id, item.detector))
        return InspectionResult(tuple(findings), score_findings(findings), not errors, tuple(errors), filename)

    def inspect_file(self, path: str | Path) -> InspectionResult:
        file_path = Path(path)
        try:
            from .extractors import MAX_FILE_BYTES
            if file_path.stat().st_size > MAX_FILE_BYTES:
                return InspectionResult((), 0, False, ("file_too_large",), file_path.name)
            return self.inspect_bytes(file_path.read_bytes(), file_path.name)
        except OSError:
            return InspectionResult((), 0, False, ("file_unavailable",), file_path.name)

def create_default_engine(include_gitleaks: bool = True) -> InspectionEngine:
    registry = DetectorRegistry()
    registry.register(SecretDetector())
    registry.register(PIIDetector())
    if include_gitleaks and shutil.which("gitleaks"):
        from .gitleaks import GitleaksDetector
        registry.register(GitleaksDetector())
    return InspectionEngine(registry)
