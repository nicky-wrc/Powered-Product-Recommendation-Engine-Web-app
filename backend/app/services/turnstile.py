"""Cloudflare Turnstile server-side verification (optional — off when secret unset)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

log = logging.getLogger(__name__)
_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def assert_turnstile_solved(token: str | None) -> None:
    """Raise HTTPException(400) if CAPTCHA is required but missing or invalid."""
    from fastapi import HTTPException, status

    secret = (settings.turnstile_secret_key or "").strip()
    if not secret:
        return
    t = (token or "").strip()
    if not t:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "กรุณายืนยันว่าไม่ใช่บอท (CAPTCHA)")
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(_VERIFY_URL, data={"secret": secret, "response": t})
            r.raise_for_status()
            data: dict[str, Any] = r.json()
    except httpx.HTTPError as e:
        log.warning("turnstile verify HTTP error: %s", e)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ไม่สามารถตรวจสอบ CAPTCHA ได้ — ลองใหม่ภายหลัง",
        ) from e
    if not data.get("success"):
        err = data.get("error-codes") or []
        log.info("turnstile failed: %s", err)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "CAPTCHA ไม่ผ่านการตรวจสอบ — ลองใหม่",
        )
