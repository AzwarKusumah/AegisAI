from aegis_inspector.engine import InspectionEngine, create_default_engine

def test_secret_detection_returns_metadata_only():
    secret = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
    result = create_default_engine(include_gitleaks=False).inspect_text(secret)
    assert result.findings
    assert "AKIAIOSFODNN7EXAMPLE" not in str(result.to_dict())
    assert result.risk_score > 0

def test_pii_detection():
    result = InspectionEngine().inspect_text("Contact user@example.org")
    assert any(item.category == "email" for item in result.findings)

def test_public_text():
    result = InspectionEngine().inspect_text("ordinary public content")
    assert not result.findings
    assert result.risk_score == 0

def test_inspect_bytes_without_temp_file():
    secret = b"AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
    result = create_default_engine(include_gitleaks=False).inspect_bytes(secret, "settings.env")
    assert result.findings
    assert result.complete
    assert result.source_name == "settings.env"
    assert "AKIAIOSFODNN7EXAMPLE" not in str(result.to_dict())

def test_unsupported_bytes_are_not_clean():
    result = InspectionEngine().inspect_bytes(b"binary", "unknown.bin")
    assert not result.complete
    assert result.errors == ("extraction_failed",)

def test_non_bytes_rejected():
    try:
        InspectionEngine().inspect_bytes("not bytes", "file.txt")
    except TypeError:
        return
    raise AssertionError("expected TypeError")
