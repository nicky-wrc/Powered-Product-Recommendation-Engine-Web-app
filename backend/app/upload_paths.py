"""Server-local storage for uploaded product images (dev-friendly)."""

from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
UPLOADS_ROOT = BACKEND_ROOT / "uploads"
PRODUCT_IMAGES_DIR = UPLOADS_ROOT / "products"
PROFILE_IMAGES_DIR = UPLOADS_ROOT / "profiles"
