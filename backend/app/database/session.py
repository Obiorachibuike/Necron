"""Engine and session management."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

_connect_args: dict = {}
_engine_kwargs: dict = {"pool_pre_ping": True, "echo": _settings.db_echo}
if _settings.database_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}
    _engine_kwargs["poolclass"] = None  # type: ignore[assignment]
else:
    _engine_kwargs.update(pool_size=5, max_overflow=10, pool_recycle=1800)

engine: Engine = create_engine(_settings.database_url, connect_args=_connect_args, **_engine_kwargs)

if _settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - sqlite only
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
