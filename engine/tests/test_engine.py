from pathlib import Path
import io
import zipfile

import pytest
from aegis_inspector.engine import InspectionEngine, create_default_engine
from aegis_inspector.extractors import ExtractionError, extract_file

def test_secret_detection_returns_metadata_only():
    secret = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
    result = create_default_engine(include_gitleaks=False).inspect_text(secret)
    assert result.findings
    assert "AKIAIOSFODNN7EXAMPLE" not in str(result.to_dict())
    assert result.risk_score > 0

def test_pii_detection():
    result = create_default_engine(include_gitleaks=False).inspect_text("Contact user@example.org")
    assert any(item.category == "email" for item in result.findings)

def test_public_text():
    result = InspectionEngine().inspect_text("ordinary public content")
    assert not result.findings
    assert result.risk_score == 0

def test_plain_file_extraction(tmp_path: Path):
    path = tmp_path / "note.txt"
    path.write_text("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE", encoding="utf-8")
    result = create_default_engine(include_gitleaks=False).inspect_file(path)
    assert result.findings
    assert result.source_name == "note.txt"

def test_zip_traversal_rejected():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("../outside.txt", "no")
    with pytest.raises(ExtractionError, match="unsafe"):
        extract_file(stream.getvalue(), "bundle.zip")

def test_unsupported_file_not_clean(tmp_path: Path):
    path = tmp_path / "blob.bin"
    path.write_bytes(b"binary")
    result = InspectionEngine().inspect_file(path)
    assert not result.complete
    assert result.errors == ("extraction_failed",)
