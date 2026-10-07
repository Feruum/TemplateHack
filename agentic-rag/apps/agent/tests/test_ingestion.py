from pathlib import Path

import pytest

from agent.config.settings import settings
from agent.infrastructure.ingestion import (
    IngestionValidationError,
    LocalIngestionBackend,
    validate_document,
)


def test_validate_document_accepts_supported_content() -> None:
    assert validate_document("notes.txt", "text/plain; charset=utf-8", b"hello") == (
        "notes.txt",
        "text/plain",
    )
    filename, content_type = validate_document(
        "handbook.pdf", "application/pdf", b"%PDF-1.7\nbody"
    )
    assert filename == "handbook.pdf"
    assert content_type == "application/pdf"


@pytest.mark.parametrize(
    ("filename", "content_type", "content", "code"),
    [
        ("payload.exe", "application/octet-stream", b"MZ", "UNSUPPORTED_FILE_TYPE"),
        ("empty.txt", "text/plain", b"", "EMPTY_FILE"),
        ("fake.pdf", "application/pdf", b"not a pdf", "INVALID_PDF"),
        ("binary.txt", "text/plain", b"text\x00binary", "INVALID_TEXT"),
        ("notes.txt", "application/pdf", b"text", "CONTENT_TYPE_MISMATCH"),
    ],
)
def test_validate_document_returns_stable_errors(
    filename: str, content_type: str, content: bytes, code: str
) -> None:
    with pytest.raises(IngestionValidationError) as error:
        validate_document(filename, content_type, content)
    assert error.value.code == code


def test_validate_document_enforces_bounded_upload(monkeypatch) -> None:
    monkeypatch.setattr(settings, "ingestion_max_file_bytes", 4)
    with pytest.raises(IngestionValidationError) as error:
        validate_document("notes.txt", "text/plain", b"12345")
    assert error.value.code == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_local_backend_round_trip_is_confined(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    backend = LocalIngestionBackend()
    await backend.upload("job/document.txt", b"hello", "text/plain", "ignored")
    assert await backend.download("job/document.txt") == b"hello"
    await backend.delete("job/document.txt")
    assert not (tmp_path / "job" / "document.txt").exists()

    with pytest.raises(IngestionValidationError) as error:
        await backend.download("../../outside.txt")
    assert error.value.code == "INVALID_BLOB_PATH"
