"""Background worker loop, usable inline (dev) or as a separate process."""
from __future__ import annotations

import logging
import os
import signal
import socket
import threading
import uuid
from time import sleep

from sqlalchemy import select

from app.core.config import get_settings
from app.database.base import utcnow
from app.database.session import SessionLocal, engine
from app.models import WorkerHeartbeat
from app.tasks.handlers import execute_task, run_schedule_once
from app.tasks.queue import claim_next_task, clean_heartbeats

logger = logging.getLogger("careerpilot.worker")


def _worker_id(mode: str) -> str:
    return f"{mode}-{socket.gethostname()[:20]}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


def heartbeat(db, worker_id: str, mode: str, started_at) -> None:
    existing = db.scalar(select(WorkerHeartbeat).where(WorkerHeartbeat.worker_id == worker_id))
    now = utcnow()
    if existing:
        existing.last_seen_at = now
    else:
        db.add(WorkerHeartbeat(worker_id=worker_id, mode=mode, started_at=started_at,
                               last_seen_at=now))
    db.commit()


def remove_heartbeat(worker_id: str) -> None:
    db = SessionLocal()
    try:
        existing = db.scalar(select(WorkerHeartbeat).where(WorkerHeartbeat.worker_id == worker_id))
        if existing:
            db.delete(existing)
            db.commit()
    finally:
        db.close()


class WorkerLoop:
    def __init__(self, mode: str = "inline", run_scheduler: bool = True) -> None:
        self.settings = get_settings()
        self.worker_id = _worker_id(mode)
        self.mode = mode
        self.run_scheduler = run_scheduler
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._started_at = utcnow()
        self._last_heartbeat = 0.0
        self._last_scheduler = 0.0

    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, name=f"cp-worker-{self.mode}",
                                        daemon=True)
        self._thread.start()
        logger.info("worker_started id=%s mode=%s", self.worker_id, self.mode)

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)
        remove_heartbeat(self.worker_id)
        logger.info("worker_stopped id=%s", self.worker_id)

    def _loop(self) -> None:
        import time

        while not self._stop.is_set():
            try:
                db = SessionLocal()
                try:
                    if time.monotonic() - self._last_heartbeat > 10:
                        heartbeat(db, self.worker_id, self.mode, self._started_at)
                        self._last_heartbeat = time.monotonic()
                    if self.run_scheduler and time.monotonic() - self._last_scheduler > 60:
                        try:
                            result = run_schedule_once(db)
                            if result.get("scheduled_searches") or result.get("reminders"):
                                logger.info("scheduler_run %s", result)
                        except Exception:  # noqa: BLE001
                            db.rollback()
                            logger.exception("scheduler_failed")
                        self._last_scheduler = time.monotonic()
                        clean_heartbeats(db)
                    task = claim_next_task(db, self.worker_id)
                    if task:
                        logger.info("task_claimed id=%s type=%s", task.id, task.task_type)
                        execute_task(db, task)
                        logger.info("task_finished id=%s status=%s", task.id, task.status)
                finally:
                    db.close()
            except Exception:  # noqa: BLE001
                logger.exception("worker_loop_error")
            sleep(self.settings.task_poll_seconds)


def ensure_schema() -> None:
    """Worker started before the API: create tables when configured to do so."""
    settings = get_settings()
    if settings.auto_create_schema:
        import app.models  # noqa: F401
        from app.database.base import Base

        Base.metadata.create_all(engine)


def main() -> None:
    from app.core.logging import configure_logging

    configure_logging()
    settings = get_settings()
    ensure_schema()
    loop = WorkerLoop(mode="standalone", run_scheduler=True)
    stop_event = threading.Event()

    def _handle_signal(signum, _frame):
        logger.info("worker_signal_received signal=%s", signum)
        stop_event.set()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    loop.start()
    logger.info("worker_ready poll_interval=%s", settings.task_poll_seconds)
    while not stop_event.is_set():
        sleep(0.5)
    loop.stop()


if __name__ == "__main__":  # pragma: no cover - process entry point
    main()
