from aegis_inspector.engine import InspectionEngine

def test_secret_detection_is_metadata_only():
    secret = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
    result = InspectionEngine().inspect_text(secret)
    assert result.findings
    assert "AKIAIOSFODNN7EXAMPLE" not in str(result.to_dict())
    assert result.risk_score > 0

def test_pii_detection():
    result = InspectionEngine().inspect_text("Contact: user@example.org")
    assert any(item.category == "email" for item in result.findings)

def test_public_text():
    result = InspectionEngine().inspect_text("ordinary public content")
    assert not result.findings
    assert result.risk_score == 0

def test_invalid_input():
    try:
        InspectionEngine().inspect_text(42)
    except TypeError:
        return
    raise AssertionError("expected TypeError")
