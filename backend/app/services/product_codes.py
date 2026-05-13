"""Normalize stable product codes (ASIN-style SKUs) for catalog + lookup."""


def normalize_product_code(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    if not s:
        return None
    if len(s) > 40:
        raise ValueError("product_code must be at most 40 characters")
    for c in s:
        if not (c.isalnum() or c in "-_"):
            raise ValueError("product_code may only contain letters, digits, hyphen, underscore")
    return s
