"""Shared image upload validation and streaming read (product + profile avatars)."""

from pathlib import Path

from fastapi import HTTPException, UploadFile, status

_MAX_IMAGE_BYTES = 5 * 1024 * 1024

_CT_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/pjpeg": ".jpg",
    "image/png": ".png",
    "image/apng": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/x-ms-bmp": ".bmp",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/heic-sequence": ".heic",
    "image/heif-sequence": ".heif",
}

_SUFFIX_TO_EXT: dict[str, str] = {
    ".jpg": ".jpg",
    ".jpeg": ".jpg",
    ".jpe": ".jpg",
    ".png": ".png",
    ".webp": ".webp",
    ".gif": ".gif",
    ".avif": ".avif",
    ".bmp": ".bmp",
    ".svg": ".svg",
    ".ico": ".ico",
    ".heic": ".heic",
    ".heif": ".heif",
}


def _ext_from_magic(data: bytes) -> str | None:
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if len(data) >= 6 and data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"avif", b"avis"):
            return ".avif"
        if brand in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
            return ".heic"
    if len(data) >= 2 and data[:2] == b"BM":
        return ".bmp"
    head = data[:4096].lstrip()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in data[:8192]):
        return ".svg"
    if len(data) >= 4 and data[:4] in (b"\x00\x00\x01\x00", b"\x00\x00\x02\x00"):
        return ".ico"
    return None


def resolve_upload_extension(content_type: str | None, filename: str | None, data: bytes) -> str:
    raw = (content_type or "").split(";")[0].strip().lower()
    if raw and raw != "application/octet-stream":
        ext = _CT_TO_EXT.get(raw)
        if ext is not None:
            return ext
    if filename:
        suf = Path(filename).suffix.lower()
        if suf in _SUFFIX_TO_EXT:
            return _SUFFIX_TO_EXT[suf]
    ext = _ext_from_magic(data)
    if ext is not None:
        return ext
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        "Could not detect image type. Use JPEG, PNG, WebP, GIF, AVIF, BMP, SVG, ICO, or HEIC.",
    )


async def read_image_upload(file: UploadFile, *, max_bytes: int = _MAX_IMAGE_BYTES) -> tuple[bytes, str]:
    chunks: list[bytes] = []
    total = 0
    while True:
        part = await file.read(65536)
        if not part:
            break
        total += len(part)
        if total > max_bytes:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large (max 5MB)")
        chunks.append(part)
    if total == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    data = b"".join(chunks)
    ext = resolve_upload_extension(file.content_type, file.filename, data)
    return data, ext
