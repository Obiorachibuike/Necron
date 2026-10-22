"""Application tracker, timeline, calendar and reminders."""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import ValidationAppError
from app.database.base import utcnow
from app.models import Application, Reminder
from app.schemas.applications import (
    ApplicationDetailOut,
    ApplicationEventOut,
    ApplicationIn,
    ApplicationOut,
    ApplicationStats,
    ApplicationUpdate,
    ReminderIn,
    ReminderOut,
    ReminderUpdate,
    StatusChangeRequest,
)
from app.schemas.common import MessageResponse, page_envelope
from app.services.applications import (
    add_event_note,
    application_detail,
    application_out,
    application_owned_or_404,
    application_stats,
    calendar_items,
    change_status,
    create_application,
    create_reminder,
    delete_application,
    delete_reminder,
    list_applications,
    list_reminders,
    reminder_out,
    reminder_owned_or_404,
    update_application,
    update_reminder,
)

router = APIRouter(tags=["applications"])


def _out(application: Application) -> ApplicationOut:
    return ApplicationOut(**application_out(application))


@router.get("/applications/stats", response_model=ApplicationStats)
async def stats(user: CurrentUser, db: DbSession) -> ApplicationStats:
    return ApplicationStats(**application_stats(db, user.id))


@router.get("/applications/calendar", response_model=list[dict])
async def calendar(user: CurrentUser, db: DbSession,
                   start: datetime | None = None, end: datetime | None = None) -> list[dict]:
    start = start or utcnow() - timedelta(days=7)
    end = end or utcnow() + timedelta(days=60)
    if end <= start:
        raise ValidationAppError("End must be after start.")
    if end - start > timedelta(days=370):
        raise ValidationAppError("Choose a range of one year or less.")
    return calendar_items(db, user.id, start, end)


@router.get("/applications", response_model=dict)
async def list_all(user: CurrentUser, db: DbSession,
                   status: str | None = Query(None, max_length=40),
                   q: str = Query("", max_length=200),
                   page: int = Query(1, ge=1, le=1000),
                   page_size: int = Query(50, ge=1, le=200)) -> dict:
    items, total = list_applications(db, user.id, status=status, search=q,
                                     limit=page_size, offset=(page - 1) * page_size)
    return page_envelope([_out(a).model_dump() for a in items], total, page, page_size)


@router.post("/applications", response_model=ApplicationDetailOut, status_code=201)
async def create(payload: ApplicationIn, user: CurrentUser, db: DbSession) -> ApplicationDetailOut:
    application = create_application(db, user, payload.model_dump())
    return ApplicationDetailOut(**application_detail(db, application))


@router.get("/applications/{application_id}", response_model=ApplicationDetailOut)
async def get_one(application_id: str, user: CurrentUser, db: DbSession) -> ApplicationDetailOut:
    application = application_owned_or_404(db, user.id, application_id)
    return ApplicationDetailOut(**application_detail(db, application))


@router.patch("/applications/{application_id}", response_model=ApplicationOut)
async def update(application_id: str, payload: ApplicationUpdate, user: CurrentUser,
                 db: DbSession) -> ApplicationOut:
    application = application_owned_or_404(db, user.id, application_id)
    data = payload.model_dump(exclude_unset=True)
    application = update_application(db, user, application, data)
    return _out(application)


@router.delete("/applications/{application_id}", response_model=MessageResponse)
async def remove(application_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    application = application_owned_or_404(db, user.id, application_id)
    delete_application(db, application)
    return MessageResponse(message="Application deleted.")


@router.post("/applications/{application_id}/status", response_model=ApplicationOut)
async def update_status(application_id: str, payload: StatusChangeRequest, user: CurrentUser,
                        db: DbSession) -> ApplicationOut:
    application = application_owned_or_404(db, user.id, application_id)
    change_status(db, user, application, payload.status, payload.note)
    return _out(application)


@router.post("/applications/{application_id}/notes", response_model=ApplicationEventOut)
async def add_note(application_id: str, payload: dict, user: CurrentUser,
                   db: DbSession) -> ApplicationEventOut:
    application = application_owned_or_404(db, user.id, application_id)
    note = str(payload.get("note", "")).strip()
    if len(note) < 2:
        raise ValidationAppError("Write a note first.")
    event = add_event_note(db, user, application, note)
    return ApplicationEventOut.model_validate(event)


# --------------------------------------------------------------------------- reminders


@router.get("/reminders", response_model=list[ReminderOut])
async def reminders(user: CurrentUser, db: DbSession,
                    include_completed: bool = Query(False)) -> list[ReminderOut]:
    now = utcnow()
    return [ReminderOut(**reminder_out(r, now))
            for r in list_reminders(db, user.id, include_completed=include_completed)]


@router.post("/reminders", response_model=ReminderOut, status_code=201)
async def add_reminder(payload: ReminderIn, user: CurrentUser, db: DbSession) -> ReminderOut:
    reminder = create_reminder(db, user.id, payload.model_dump())
    return ReminderOut(**reminder_out(reminder))


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut)
async def edit_reminder(reminder_id: str, payload: ReminderUpdate, user: CurrentUser,
                        db: DbSession) -> ReminderOut:
    reminder = reminder_owned_or_404(db, user.id, reminder_id)
    reminder = update_reminder(db, reminder, payload.model_dump(exclude_unset=True))
    return ReminderOut(**reminder_out(reminder))


@router.delete("/reminders/{reminder_id}", response_model=MessageResponse)
async def remove_reminder(reminder_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    reminder = reminder_owned_or_404(db, user.id, reminder_id)
    delete_reminder(db, reminder)
    return MessageResponse(message="Reminder deleted.")
