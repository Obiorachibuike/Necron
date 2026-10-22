"""Database-backed background task queue.

Task state lives in PostgreSQL, so queued work survives restarts and the UI can
report real status. A Redis-backed queue can be added behind this interface
without changing callers.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError
from app.database.base import utcnow
from app.models import BackgroundTask, WorkerHeartbeat

logger = logging.getLogger("careerpilot.tasks")

ACTIVE_STATUSES = ("queued", "running")
TERMINAL_STATUSES = ("completed", "failed", "cancelled")


def find_by_dedupe(db: Session, user_id: str, dedupe_key: str) -> BackgroundTask | None:
    if not dedupe_key:
        return None
    return db.scalar(select(BackgroundTask).where(
        BackgroundTask.user_id == user_id,
        BackgroundTask.dedupe_key == dedupe_key,
        BackgroundTask.status.in_(ACTIVE_STATUSES),
    ).order_by(BackgroundTask.created_at.desc()))


def enqueue(db: Session, user_id: str, task_type: str, title: str, payload: dict | None = None,
            dedupe_key: str = "", max_attempts: int | None = None) -> BackgroundTask:
    settings = get_settings()
    existing = find_by_dedupe(db, user_id, dedupe_key)
    if existing:
        return existing
    task = BackgroundTask(
        user_id=user_id, task_type=task_type, title=title[:300], status="queued",
        payload=payload or {}, queued_at=utcnow(),
        max_attempts=max_attempts or settings.task_max_attempts, dedupe_key=dedupe_key[:200],
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, user_id: str, task_id: str) -> BackgroundTask:
    task = db.get(BackgroundTask, task_id)
    if not task or task.user_id != user_id:
        raise NotFoundError("Task not found")
    return task


def list_tasks(db: Session, user_id: str, limit: int = 20) -> list[BackgroundTask]:
    return list(db.scalars(select(BackgroundTask).where(BackgroundTask.user_id == user_id)
                           .order_by(BackgroundTask.created_at.desc()).limit(limit)).all())


def cancel_task(db: Session, user_id: str, task_id: str) -> BackgroundTask:
    task = get_task(db, user_id, task_id)
    if task.status in TERMINAL_STATUSES:
        raise ConflictError("This task has already finished.")
    task.cancel_requested_at = utcnow()
    if task.status == "queued":
        task.status = "cancelled"
        task.finished_at = utcnow()
        task.progress_note = "Cancelled before it started"
    else:
        task.progress_note = "Cancellation requested; stopping after the current step"
    db.commit()
    db.refresh(task)
    return task


def retry_task(db: Session, user_id: str, task_id: str) -> BackgroundTask:
    task = get_task(db, user_id, task_id)
    if task.status not in {"failed", "cancelled"}:
        raise ConflictError("Only failed or cancelled tasks can be retried.")
    retry = BackgroundTask(
        user_id=user_id, task_type=task.task_type, title=task.title, status="queued",
        payload=task.payload, queued_at=utcnow(), max_attempts=task.max_attempts,
        dedupe_key="", progress_note="Retry requested by user",
    )
    db.add(retry)
    db.commit()
    db.refresh(retry)
    return retry


def worker_status(db: Session) -> dict:
    settings = get_settings()
    cutoff = utcnow() - timedelta(seconds=45)
    active = db.scalar(select(func.count()).select_from(WorkerHeartbeat).where(
        WorkerHeartbeat.last_seen_at >= cutoff)) or 0
    queued = db.scalar(select(func.count()).select_from(BackgroundTask).where(
        BackgroundTask.status == "queued")) or 0
    running = db.scalar(select(func.count()).select_from(BackgroundTask).where(
        BackgroundTask.status == "running")) or 0
    failed = db.scalar(select(func.count()).select_from(BackgroundTask).where(
        BackgroundTask.status == "failed")) or 0
    heartbeat = db.scalar(select(func.max(WorkerHeartbeat.last_seen_at)))
    if active:
        message = f"{active} worker(s) online."
    elif queued or running:
        message = ("No background worker is online. Queued tasks will remain queued until a worker "
                   "starts (`python -m app.worker`) or inline processing is enabled.")
    else:
        message = "No background tasks are waiting."
    return {
        "inline_worker_enabled": settings.enable_inline_worker,
        "active_workers": int(active), "queued_tasks": int(queued),
        "running_tasks": int(running), "failed_tasks": int(failed),
        "last_worker_heartbeat": heartbeat, "message": message,
    }


def claim_next_task(db: Session, worker_id: str) -> BackgroundTask | None:
    """Atomically claim one queued task. Safe with multiple workers on PostgreSQL."""
    for _attempt in range(3):
        stmt = (select(BackgroundTask)
                .where(BackgroundTask.status == "queued",
                       BackgroundTask.cancel_requested_at.is_(None))
                .order_by(BackgroundTask.queued_at.asc()).limit(1))
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            stmt = stmt.with_for_update(skip_locked=True)
        task = db.scalar(stmt)
        if not task:
            db.rollback()
            return None
        now = utcnow()
        result = db.execute(
            update(BackgroundTask)
            .where(BackgroundTask.id == task.id, BackgroundTask.status == "queued")
            .values(status="running", started_at=now, worker_id=worker_id,
                    attempts=BackgroundTask.attempts + 1, progress_note="Starting")
            .execution_options(synchronize_session=False)
        )
        db.commit()
        if result.rowcount == 1:
            db.refresh(task)
            return task
        db.rollback()
    return None


def clean_heartbeats(db: Session, older_than_seconds: int = 3600) -> int:
    cutoff = utcnow() - timedelta(seconds=older_than_seconds)
    result = db.execute(delete(WorkerHeartbeat).where(WorkerHeartbeat.last_seen_at < cutoff))
    db.commit()
    return result.rowcount or 0


class TaskContext:
    """Progress reporting and safe cancellation for a running task."""

    def __init__(self, db: Session, task: BackgroundTask) -> None:
        self.db = db
        self.task = task
        self._cancelled = False

    def progress(self, percent: int | None, note: str = "") -> None:
        if percent is not None:
            percent = max(0, min(100, int(percent)))
        self.task.progress = percent
        self.task.progress_note = note[:300]
        self.db.commit()

    def check_cancelled(self) -> None:
        self.db.refresh(self.task)
        if self.task.cancel_requested_at is not None:
            self._cancelled = True
            raise TaskCancelled("Task cancelled by the user.")

    @property
    def cancelled(self) -> bool:
        return self._cancelled

    def sub_progress(self, start: int, end: int):
        """Return a callback mapping a 0-1 fraction onto a real stage range."""
        def callback(fraction: float, note: str = "") -> None:
            fraction = max(0.0, min(1.0, fraction))
            self.progress(int(start + (end - start) * fraction), note)
        return callback


class TaskCancelled(Exception):
    pass
