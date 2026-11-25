import io
import zipfile
import pytest

from aegis_inspector.extractors import ExtractionError, extract_file

def test_extract_plain_text():
    assert extract_file(b"hello", "note.txt") == [("note.txt", "hello")]

def test_reject_zip_traversal():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("../outside.txt", "do not extract")
    with pytest.raises(ExtractionError, match="unsafe"):
        extract_file(stream.getvalue(), "bundle.zip")

def test_reject_nested_zip():
    stream = io.BytesIO()
    inner = io.BytesIO()
    with zipfile.ZipFile(inner, "w") as archive:
        archive.writestr("note.txt", "nested")
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("nested.zip", inner.getvalue())
    with pytest.raises(ExtractionError, match="nested"):
        extract_file(stream.getvalue(), "bundle.zip")

def test_unsupported_is_error():
    with pytest.raises(ExtractionError, match="unsupported"):
        extract_file(b"binary", "payload.bin")
