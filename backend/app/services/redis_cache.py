"""Optional Redis JSON cache (graceful no-op when REDIS_URL is unset)."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)
_client: Any = None
_warned_connection = False


def _connect():
    global _client, _warned_connection
    if not settings.redis_url:
        return None
    if _client is not None:
        return _client
    try:
        import redis

        _client = redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=1.5)
        _client.ping()
        return _client
    except Exception as e:
        if not _warned_connection:
            logger.warning("Redis unavailable (%s); caching disabled.", e)
            _warned_connection = True
        _client = None
        return None


def redis_status() -> str:
    r = _connect()
    if not settings.redis_url:
        return "disabled"
    if r is None:
        return "unavailable"
    try:
        r.ping()
        return "ok"
    except Exception:
        return "unavailable"


def cache_get_json(key: str) -> Any | None:
    r = _connect()
    if r is None:
        return None
    try:
        raw = r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug("cache get miss %s: %s", key, e)
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int) -> None:
    r = _connect()
    if r is None:
        return
    try:
        r.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception as e:
        logger.debug("cache set failed %s: %s", key, e)
