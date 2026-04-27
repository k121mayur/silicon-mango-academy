from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import settings


def get_upload_root() -> Path:
    return Path(settings.uploads_root).resolve()


def ensure_upload_directories() -> None:
    root = get_upload_root()
    root.mkdir(parents=True, exist_ok=True)
    for child in (
        "certificates",
        "certificate_templates",
        "course_banners",
        "course_syllabi",
        "session_resources",
    ):
        (root / child).mkdir(parents=True, exist_ok=True)


def sanitize_filename(filename: str) -> str:
    safe_chars = []
    for char in filename:
        if char.isalnum() or char in {"-", "_", "."}:
            safe_chars.append(char)
        else:
            safe_chars.append("_")
    return "".join(safe_chars).strip("._") or "file"


def relative_upload_path(*parts: str) -> str:
    return "/".join(part.strip("/\\") for part in parts if part)


def absolute_upload_path(relative_path: str) -> Path:
    return get_upload_root() / Path(*relative_path.replace("\\", "/").split("/"))


def public_upload_url(relative_path: str) -> str:
    normalized = relative_path.replace("\\", "/").lstrip("/")
    return f"/uploads/{normalized}"


async def save_upload_file(upload: UploadFile, folder: str) -> tuple[str, str, str]:
    ensure_upload_directories()

    original_name = upload.filename or "file"
    extension = Path(original_name).suffix.lower()
    generated_name = f"{uuid4().hex}{extension}"
    relative_path = relative_upload_path(folder, generated_name)
    destination = absolute_upload_path(relative_path)
    destination.parent.mkdir(parents=True, exist_ok=True)

    contents = await upload.read()
    destination.write_bytes(contents)

    return relative_path, public_upload_url(relative_path), original_name
