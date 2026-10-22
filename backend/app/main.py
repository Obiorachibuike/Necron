"""CareerPilot AI API application factory.

Run locally:
    uvicorn app.main:app --reload --port 8000

The API is versioned under /api/v1 and documented at /api/v1/openapi.json and
/api/v1/docs (disabled in production unless CP_DEBUG is enabled).
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.routes import (
    ai,
    applications,
    auth,
    documents,
    interviews,
    jobs,
    onboarding,
    profile,
    system,
)
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import OriginAndSizeMiddleware, RequestContextMiddleware
from app.core.ratelimit import RateLimitMiddleware
from app.database.base import Base, utcnow
from app.database.session import SessionLocal, engine
from app.services.notifications import unread_count
from app.tasks.worker import WorkerLoop

logger = logging.getLogger("careerpilot.main")


def _create_schema() -> None:
    settings = get_settings()
    if not settings.auto_create_schema:
        return
    import app.models  # noqa: F401  (register metadata)

    Base.metadata.create_all(engine)
    logger.info("schema_ready auto_create_schema=true")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    _create_schema()
    worker: WorkerLoop | None = None
    if settings.enable_inline_worker:
        worker = WorkerLoop(mode="inline", run_scheduler=True)
        worker.start()
        app.state.inline_worker = worker
        logger.info("inline_worker_enabled interval=%ss", settings.task_poll_seconds)
    try:
        yield
    finally:
        if worker is not None:
            worker.stop()
            logger.info("inline_worker_stopped")


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description=(
            "CareerPilot AI — multi-user career management API. All endpoints are scoped to the "
            "authenticated account; cross-user access is rejected server-side."
        ),
        docs_url=f"{settings.api_prefix}/docs" if (settings.debug or not settings.is_production) else None,
        redoc_url=None,
        openapi_url=(f"{settings.api_prefix}/openapi.json"
                     if (settings.debug or not settings.is_production) else None),
        lifespan=lifespan,
    )

    # Middleware executes in reverse registration order: rate limit → context → origin/size.
    app.add_middleware(OriginAndSizeMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin.rstrip("/")],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Requested-With", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Content-Disposition", "Retry-After"],
        max_age=600,
    )
    app.add_middleware(TrustedHostMiddleware,
                       allowed_hosts=settings.effective_allowed_hosts)

    install_error_handlers(app)

    api = APIRouter(prefix=settings.api_prefix)

    @api.get("/health", tags=["system"])
    async def health() -> dict:
        return {"status": "ok", "app": settings.app_name, "time": utcnow().isoformat(),
                "environment": settings.app_env}

    @api.get("/health/ready", tags=["system"])
    async def readiness() -> JSONResponse:
        checks: dict[str, str] = {}
        ok = True
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception as exc:  # noqa: BLE001
            ok = False
            checks["database"] = f"error: {type(exc).__name__}"
        try:
            from app.tasks.queue import worker_status

            with SessionLocal() as db:
                status = worker_status(db)
            checks["worker"] = "online" if status["active_workers"] else "offline"
            if status["active_workers"]:
                checks["worker_heartbeat"] = (
                    status["last_worker_heartbeat"].isoformat()
                    if status["last_worker_heartbeat"] else "")
            checks["queued_tasks"] = str(status["queued_tasks"])
        except Exception as exc:  # noqa: BLE001
            checks["worker"] = f"error: {type(exc).__name__}"
        return JSONResponse(status_code=200 if ok else 503,
                            content={"status": "ready" if ok else "degraded", "checks": checks,
                                     "time": utcnow().isoformat()})

    # Each router owns its resource prefix; mount them once under /api/v1.
    for module in (auth, onboarding, profile, jobs, documents, applications, interviews, ai,
                   system):
        api.include_router(module.router)

    app.include_router(api)

    @app.get("/", include_in_schema=False)
    async def root() -> dict:
        return {
            "app": settings.app_name,
            "api": settings.api_prefix,
            "docs": f"{settings.api_prefix}/docs",
            "health": f"{settings.api_prefix}/health",
        }

    return app


app = create_app()
