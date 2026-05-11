"""Attach X-Request-ID to every request (propagate client id or generate UUID)."""

import uuid
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        hdr = request.headers.get("x-request-id") or request.headers.get("X-Request-ID")
        rid = hdr.strip() if hdr and hdr.strip() else str(uuid.uuid4())
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
