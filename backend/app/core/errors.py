"""Consistent API error envelope and exception handlers."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("careerpilot.errors")


class AppError(Exception):
    """Application error rendered with a stable machine-readable code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(404, "not_found", message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "You do not have access to this resource") -> None:
        super().__init__(403, "forbidden", message)


class AuthError(AppError):
    def __init__(self, message: str = "Authentication required", code: str = "unauthenticated") -> None:
        super().__init__(401, code, message)


class ConflictError(AppError):
    def __init__(self, message: str, code: str = "conflict",
                 details: list[dict[str, Any]] | None = None) -> None:
        super().__init__(409, code, message, details)


class ValidationAppError(AppError):
    def __init__(self, message: str, details: list[dict[str, Any]] | None = None,
                 code: str = "validation_error") -> None:
        super().__init__(422, code, message, details)


class RateLimitError(AppError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(429, "rate_limited", "Too many requests. Please slow down.")
        self.retry_after = retry_after


def error_body(code: str, message: str, details: list[dict[str, Any]] | None = None,
               request_id: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": {"code": code, "message": message, "details": details or []}}
    if request_id:
        body["request_id"] = request_id
    return body


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        headers = {"X-Request-ID": getattr(request.state, "request_id", "")}
        if isinstance(exc, RateLimitError):
            headers["Retry-After"] = str(exc.retry_after)
        if isinstance(exc, AuthError) and exc.status_code == 401:
            headers["WWW-Authenticate"] = "Cookie"
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.details,
                               getattr(request.state, "request_id", None)),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(p) for p in err.get("loc", []) if p != "body"),
                "message": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=error_body("validation_error", "Please check the highlighted fields.",
                               details, getattr(request.state, "request_id", None)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {401: "unauthenticated", 403: "forbidden", 404: "not_found",
                405: "method_not_allowed", 413: "payload_too_large"}.get(exc.status_code, "http_error")
        message = str(exc.detail) if exc.detail else "Request failed"
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(code, message, request_id=getattr(request.state, "request_id", None)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception("Unhandled error request_id=%s path=%s", request_id, request.url.path)
        return JSONResponse(
            status_code=500,
            content=error_body(
                "internal_error",
                "Something went wrong on our side. Please try again.",
                request_id=request_id,
            ),
        )
