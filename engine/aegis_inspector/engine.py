from dataclasses import asdict, dataclass
import re

@dataclass(frozen=True)
class Finding:
    rule_id: str
    category: str
    severity: str
    start: int
    end: int
    confidence: float
    detector: str

@dataclass(frozen=True)
class InspectionResult:
    findings: tuple[Finding, ...]
    risk_score: int
    complete: bool = True

    def to_dict(self):
        return {
            "findings": [asdict(item) for item in self.findings],
            "risk_score": self.risk_score,
            "complete": self.complete,
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
        ("credential-assignment", "credential", re.compile(r"(?im)\b[A-Za-z0-9_]*(?:password|passwd|pwd|api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*[^\s;]{8,}"), "high", .90),
    ]
    def detect(self, text):
        return [Finding(rule, category, severity, match.start(), match.end(), confidence, self.name)
                for rule, category, pattern, severity, confidence in self.RULES
                for match in pattern.finditer(text)]

class PIIDetector:
    name = "builtin-pii"
    RULES = [
        ("email-address", "email", re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"), "medium", .98),
        ("indonesian-phone", "phone", re.compile(r"(?<!\w)(?:\+62|62|0)8[1-9][0-9]{7,11}(?!\w)"), "medium", .90),
    ]
    def detect(self, text):
        return [Finding(rule, category, severity, match.start(), match.end(), confidence, self.name)
                for rule, category, pattern, severity, confidence in self.RULES
                for match in pattern.finditer(text)]

class InspectionEngine:
    def __init__(self, registry=None):
        self.registry = registry or DetectorRegistry()
        if registry is None:
            self.registry.register(SecretDetector())
            self.registry.register(PIIDetector())

    def inspect_text(self, text):
        if not isinstance(text, str):
            raise TypeError("text must be str")
        findings = []
        for detector in self.registry.all():
            findings.extend(detector.detect(text))
        findings.sort(key=lambda item: (item.start, item.end, item.rule_id))
        weights = {"low":20, "medium":40, "high":70, "critical":100}
        scores = [round(weights[item.severity] * item.confidence) for item in findings]
        risk = min(100, max(scores, default=0) + min(15, max(0, len(findings)-1)*5))
        return InspectionResult(tuple(findings), risk)
