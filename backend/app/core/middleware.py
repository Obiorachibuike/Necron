"""Request ID, security headers, request size limits and origin checks."""
from __future__ import annotations

import logging
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings

logger = logging.getLogger("careerpilot.http")

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
PUBLIC_PATHS_WITHOUT_ORIGIN_CHECK = {"/api/v1/health", "/api/v1/auth/register",
                                     "/api/v1/auth/login"}


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            )
            if get_settings().is_production:
                response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class OriginAndSizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        if request.method in MUTATING and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            allowed = {settings.effective_frontend_origin.rstrip("/")}
            if origin and origin.rstrip("/") not in allowed:
                return JSONResponse(
                    status_code=403,
                    content={"error": {"code": "origin_rejected",
                                       "message": "Request origin is not allowed.", "details": []}},
                )
        content_type = request.headers.get("content-type", "")
        length_header = request.headers.get("content-length")
        if length_header and "multipart/form-data" not in content_type:
            try:
                length = int(length_header)
            except ValueError:
                length = 0
            if length > settings.max_request_bytes:
                return JSONResponse(
                    status_code=413,
                    content={"error": {"code": "payload_too_large",
                                       "message": "Request body is too large.", "details": []}},
                )
        return await call_next(request)
