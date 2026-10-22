"""Private file storage.

Files live outside the repository tree (CP_MEDIA_ROOT) under a per-user UUID
directory. Public URLs are never generated; downloads go through an
authenticated endpoint or short-lived signed token. Original filenames are
never used to build paths.
"""
from __future__ import annotations

import hashlib
import io
import logging
import re
import shutil
import uuid
import zipfile
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import ValidationAppError

logger = logging.getLogger("careerpilot.storage")

SAFE_ID = re.compile(r"^[a-f0-9-]{36}$")


def _root() -> Path:
    root = Path(get_settings().media_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _user_dir(user_id: str, category: str) -> Path:
    if not SAFE_ID.match(user_id or ""):
        raise ValidationAppError("Invalid user reference")
    if category not in {"uploads", "exports"}:
        raise ValidationAppError("Invalid storage category")
    path = _root() / category / user_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def file_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _looks_like_pdf(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


def _looks_like_docx(data: bytes) -> bool:
    if not data.startswith(b"PK"):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
            if "word/document.xml" not in names:
                return False
            # Reject path traversal / zip bombs inside the archive.
            if any(name.startswith("/") or ".." in name for name in names):
                return False
            return True
    except (zipfile.BadZipFile, OSError):
        return False


def sniff_document(data: bytes) -> str:
    """Return 'pdf' or 'docx' based on content, never the filename."""
    if _looks_like_pdf(data):
        return "pdf"
    if _looks_like_docx(data):
        return "docx"
    raise ValidationAppError("Only PDF and DOCX files are supported. The file content did not match.")


def save_upload(user_id: str, data: bytes, original_name: str, content_type: str) -> dict:
    settings = get_settings()
    if not data:
        raise ValidationAppError("The uploaded file is empty.")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ValidationAppError(f"Files must be {settings.max_upload_mb} MB or smaller.")
    kind = sniff_document(data)
    target_dir = _user_dir(user_id, "uploads")
    filename = f"{uuid.uuid4().hex}.{kind}"
    target = target_dir / filename
    tmp = target.with_suffix(target.suffix + ".part")
    try:
        tmp.write_bytes(data)
        tmp.replace(target)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
    return {
        "storage_path": f"uploads/{user_id}/{filename}",
        "fmt": kind,
        "size_bytes": len(data),
        "sha256": file_sha256(data),
        "original_name": re.sub(r"[^\w.\- ()\[\]]", "_", original_name or "upload")[:200],
        "content_type": (content_type or "")[:120],
    }


def save_export(user_id: str, document_id: str, version: int, fmt: str, data: bytes) -> dict:
    if fmt not in {"pdf", "docx", "txt", "tex"}:
        raise ValidationAppError("Unsupported export format")
    if not SAFE_ID.match(document_id or ""):
        raise ValidationAppError("Invalid document reference")
    target_dir = _user_dir(user_id, "exports")
    filename = f"{document_id}-v{version}.{fmt}"
    target = target_dir / filename
    tmp = target.with_suffix(target.suffix + ".part")
    try:
        tmp.write_bytes(data)
        tmp.replace(target)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
    return {
        "storage_path": f"exports/{user_id}/{filename}",
        "size_bytes": len(data),
        "sha256": file_sha256(data),
    }


def read_stored(relative_path: str, user_id: str) -> bytes:
    """Read a stored file, enforcing that the path stays under the user's directory."""
    root = _root()
    candidate = (root / relative_path).resolve()
    user_root = (root / "exports" / user_id).resolve()
    uploads_root = (root / "uploads" / user_id).resolve()
    if not (str(candidate).startswith(str(user_root) + "/") or
            str(candidate).startswith(str(uploads_root) + "/")):
        raise ValidationAppError("Invalid file reference")
    if not candidate.is_file():
        raise ValidationAppError("The file is no longer available.")
    return candidate.read_bytes()


def delete_stored(relative_path: str) -> None:
    root = _root()
    candidate = (root / relative_path).resolve()
    if not str(candidate).startswith(str(root) + "/"):
        return
    candidate.unlink(missing_ok=True)
    # Remove empty parent directories.
    try:
        parent = candidate.parent
        while parent != root and parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()
            parent = parent.parent
    except OSError:  # pragma: no cover
        pass


def delete_user_files(user_id: str) -> None:
    root = _root()
    if not SAFE_ID.match(user_id or ""):
        return
    for category in ("uploads", "exports"):
        path = (root / category / user_id).resolve()
        if str(path).startswith(str(root) + "/") and path.exists():
            shutil.rmtree(path, ignore_errors=True)


def storage_health() -> tuple[bool, str]:
    try:
        root = _root()
        probe = root / ".write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True, str(root)
    except OSError as exc:  # pragma: no cover - environment dependent
        return False, type(exc).__name__
