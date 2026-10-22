"""Standalone background worker entry point.

Usage:
    python -m app.worker

Runs the DB-backed queue worker with heartbeat, retries and the periodic
scheduler (saved searches + reminders). The API can also run an inline worker
when CP_ENABLE_INLINE_WORKER=true (default in development).
"""
from app.tasks.worker import main

if __name__ == "__main__":  # pragma: no cover - process entry point
    main()
