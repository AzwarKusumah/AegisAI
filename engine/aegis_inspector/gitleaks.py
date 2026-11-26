"""Optional Gitleaks CLI adapter. Reports metadata only and redacts secrets."""
from __future__ import annotations

import json
import shutil
import subprocess

from .engine import Finding

class GitleaksDetector:
    name = "gitleaks"

    def __init__(self, executable: str = "gitleaks", timeout_seconds: int = 15):
        if timeout_seconds < 1 or timeout_seconds > 120:
            raise ValueError("timeout_seconds must be between 1 and 120")
        self.executable = shutil.which(executable)
        self.timeout_seconds = timeout_seconds

    @property
    def available(self) -> bool:
        return self.executable is not None

    def detect(self, text: str) -> list[Finding]:
        if not self.executable:
            raise RuntimeError("Gitleaks executable is unavailable")
        command = [
            self.executable, "stdin",
            "--report-format", "json",
            "--report-path", "-",
            "--redact=100",
            "--no-banner",
            "--log-level", "error",
            "--timeout", str(self.timeout_seconds),
        ]
        try:
            completed = subprocess.run(
                command,
                input=text,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds + 2,
                check=False,
            )
            report = json.loads(completed.stdout or "[]")
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            raise RuntimeError("Gitleaks scan failed") from exc

        if not isinstance(report, list):
            raise RuntimeError("unexpected Gitleaks report format")
        lines = text.splitlines(keepends=True)
        offsets, offset = [], 0
        for line in lines:
            offsets.append(offset)
            offset += len(line)
        findings = []
        for item in report:
            if not isinstance(item, dict):
                continue
            line = item.get("StartLine", 1)
            if not isinstance(line, int) or line < 1:
                line = 1
            start = offsets[min(line - 1, len(offsets) - 1)] if offsets else 0
            end = start + (len(lines[line - 1]) if lines and line <= len(lines) else 0)
            rule_id = str(item.get("RuleID") or "gitleaks-finding")[:128]
            findings.append(Finding(rule_id, "secret", "critical", start, end, .99, self.name))
        if completed.returncode not in (0, 1):
            raise RuntimeError("Gitleaks returned an execution error")
        return findings
