"""In-process sliding-window rate limiting.

Suitable for a single backend instance. For multi-instance deployments set
CP_RATE_LIMIT_ENABLED=false and enforce limits at the edge/proxy, or deploy a
shared Redis-backed limiter (documented in docs/ARCHITECTURE.md).
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _hit(key: str, limit: int, window: float = 60.0) -> int:
    """Record a hit; return 0 when allowed or seconds-to-wait when limited."""
    now = time.monotonic()
    with _LOCK:
        bucket = _BUCKETS[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            return max(1, int(window - (now - bucket[0])) + 1)
        bucket.append(now)
        if len(_BUCKETS) > 20_000:  # opportunistic cleanup
            for k in [k for k, v in _BUCKETS.items() if not v or now - v[-1] > window][:5000]:
                _BUCKETS.pop(k, None)
    return 0


def classify(path: str) -> tuple[str, int]:
    if path.endswith("/auth/login") or path.endswith("/auth/register"):
        return "auth", 10
    if path.endswith("/auth/forgot-password") or path.endswith("/auth/reset-password"):
        return "recover", 8
    if "/ai-" in path or path.endswith("/test-connection") or "/generate" in path:
        return "ai", 40
    return "general", 180


def reset_rate_limits() -> None:
    """Testing helper."""
    with _LOCK:
        _BUCKETS.clear()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        from app.core.config import get_settings

        settings = get_settings()
        if not settings.rate_limit_enabled or request.method == "OPTIONS":
            return await call_next(request)
        bucket, default_limit = classify(request.url.path)
        limit = {
            "auth": settings.login_rate_limit_per_minute,
            "general": settings.rate_limit_per_minute,
            "recover": 8,
            "ai": 40,
        }.get(bucket, default_limit)
        retry_after = _hit(f"{bucket}:{_client_key(request)}", limit)
        if retry_after:
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "rate_limited",
                                   "message": "Too many requests. Please slow down.", "details": []}},
                headers={"Retry-After": str(retry_after)},
            )
        response: Response = await call_next(request)
        return response
