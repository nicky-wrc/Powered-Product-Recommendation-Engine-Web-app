"""URL-safe slug for brand names (supports Latin + Thai)."""

from __future__ import annotations

import re

_THAI_LATIN_LOWER = re.compile(r"[^\w\u0e00-\u0e7f\-]+", re.UNICODE)
_DUP_HYPH = re.compile(r"-{2,}")


def slugify_brand(name: str) -> str:
    raw = (name or "").strip().lower()
    if not raw:
        return "brand"
    s = _THAI_LATIN_LOWER.sub("-", raw)
    s = _DUP_HYPH.sub("-", s).strip("-")
    return s or "brand"


def brand_name_for_slug(db_brands: list[str], slug: str) -> str | None:
    want = (slug or "").strip().lower()
    if not want:
        return None
    for b in db_brands:
        if slugify_brand(b) == want:
            return b
    return None
