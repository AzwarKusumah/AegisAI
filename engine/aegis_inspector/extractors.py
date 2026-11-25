"""Bounded, in-memory extraction. Never writes archive members to disk."""
from __future__ import annotations

import io
import zipfile
from pathlib import PurePosixPath

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 100
MAX_ARCHIVE_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
MAX_TEXT_CHARS = 5_000_000
TEXT_EXTENSIONS = {
    ".txt", ".md", ".env", ".json", ".yaml", ".yml", ".toml", ".ini",
    ".conf", ".py", ".go", ".rs", ".js", ".ts", ".sh", ".sql", ".xml", ".csv",
}

class ExtractionError(ValueError):
    pass

def _decode(data: bytes) -> str:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ExtractionError("file is not valid UTF-8 text") from exc
    if len(text) > MAX_TEXT_CHARS:
        raise ExtractionError("extracted text exceeds character limit")
    return text

def _extract_one(data: bytes, filename: str) -> list[tuple[str, str]]:
    suffix = PurePosixPath(filename).suffix.lower()
    if suffix in TEXT_EXTENSIONS or not suffix:
        return [(filename, _decode(data))]
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data), strict=True)
            if reader.is_encrypted or len(reader.pages) > 250:
                raise ExtractionError("encrypted or oversized PDF")
            if any(page.images for page in reader.pages):
                raise ExtractionError("PDF contains images; OCR is not available")
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            if len(text) > MAX_TEXT_CHARS:
                raise ExtractionError("extracted text exceeds character limit")
            return [(filename, text)]
        except ImportError as exc:
            raise ExtractionError("install the documents extra for PDF extraction") from exc
        except ExtractionError:
            raise
        except Exception as exc:
            raise ExtractionError("PDF extraction failed") from exc
    if suffix == ".docx":
        try:
            from docx import Document
            document = Document(io.BytesIO(data))
            chunks = [paragraph.text for paragraph in document.paragraphs]
            for table in document.tables:
                for row in table.rows:
                    chunks.append(" | ".join(cell.text for cell in row.cells))
            text = "\n".join(chunks)
            if len(text) > MAX_TEXT_CHARS:
                raise ExtractionError("extracted text exceeds character limit")
            return [(filename, text)]
        except ImportError as exc:
            raise ExtractionError("install the documents extra for DOCX extraction") from exc
        except ExtractionError:
            raise
        except Exception as exc:
            raise ExtractionError("DOCX extraction failed") from exc
    if suffix == ".xlsx":
        try:
            from openpyxl import load_workbook
            workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=False)
            chunks = []
            for sheet in workbook.worksheets:
                chunks.append("[SHEET] " + sheet.title)
                for row in sheet.iter_rows(values_only=True):
                    chunks.append("\t".join("" if value is None else str(value) for value in row))
                    if sum(map(len, chunks)) > MAX_TEXT_CHARS:
                        raise ExtractionError("extracted text exceeds character limit")
            workbook.close()
            return [(filename, "\n".join(chunks))]
        except ImportError as exc:
            raise ExtractionError("install the documents extra for XLSX extraction") from exc
        except ExtractionError:
            raise
        except Exception as exc:
            raise ExtractionError("XLSX extraction failed") from exc
    raise ExtractionError("unsupported file type: " + (suffix or "unknown"))

def extract_file(data: bytes, filename: str) -> list[tuple[str, str]]:
    if not isinstance(data, bytes):
        raise TypeError("data must be bytes")
    if not filename or not isinstance(filename, str):
        raise ValueError("filename must be non-empty")
    if len(data) > MAX_FILE_BYTES:
        raise ExtractionError("file exceeds maximum size")
    if PurePosixPath(filename).suffix.lower() != ".zip":
        return _extract_one(data, PurePosixPath(filename).name)

    documents, expanded = [], 0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_ENTRIES:
                raise ExtractionError("archive contains too many entries")
            for info in infos:
                if info.is_dir():
                    continue
                member = PurePosixPath(info.filename)
                if member.is_absolute() or ".." in member.parts or "\\" in info.filename:
                    raise ExtractionError("archive contains unsafe member path")
                mode = (info.external_attr >> 16) & 0o170000
                if mode == 0o120000:
                    raise ExtractionError("archive contains symbolic link")
                if info.flag_bits & 1 or info.file_size > MAX_FILE_BYTES:
                    raise ExtractionError("encrypted or oversized archive member")
                if info.compress_size == 0 and info.file_size > 0:
                    raise ExtractionError("invalid compression metadata")
                if info.compress_size and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO:
                    raise ExtractionError("archive compression ratio exceeds limit")
                expanded += info.file_size
                if expanded > MAX_ARCHIVE_EXPANDED_BYTES:
                    raise ExtractionError("archive expanded size exceeds limit")
                if member.suffix.lower() == ".zip":
                    raise ExtractionError("nested ZIP archives are not supported")
                with archive.open(info) as stream:
                    content = stream.read(MAX_FILE_BYTES + 1)
                if len(content) > MAX_FILE_BYTES:
                    raise ExtractionError("archive member exceeds actual size limit")
                documents.extend(_extract_one(content, member.name))
    except ExtractionError:
        raise
    except (zipfile.BadZipFile, OSError, RuntimeError) as exc:
        raise ExtractionError("invalid or unreadable ZIP archive") from exc
    return documents
