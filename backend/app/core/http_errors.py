"""Consistent JSON errors + safe 500 responses (HTTP errors pass through unchanged shape)."""

import logging
import traceback

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def register_exception_handlers(app) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exc(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors(), "type": "validation_error"},
        )

    @app.exception_handler(Exception)
    async def unhandled_exc(request: Request, exc: Exception) -> JSONResponse:
        if isinstance(exc, StarletteHTTPException):
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=dict(exc.headers) if exc.headers else {},
            )
        rid = getattr(request.state, "request_id", None)
        logger.error("unhandled error request_id=%s\n%s", rid, traceback.format_exc())
        body: dict = {"detail": "Internal server error", "type": "server_error"}
        if rid:
            body["request_id"] = rid
        return JSONResponse(status_code=500, content=body)
