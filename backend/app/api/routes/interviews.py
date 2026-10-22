"""Interview coach endpoints: sessions, question banks, mock answers and notes."""
from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import NotFoundError, ValidationAppError
from app.database.base import utcnow
from app.models import (
    InterviewAnswer,
    InterviewNote,
    InterviewQuestion,
    InterviewSession,
    JobListing,
)
from app.schemas.applications import (
    AnswerFeedback,
    AnswerIn,
    FollowUpOut,
    InterviewAnswerOut,
    InterviewQuestionOut,
    InterviewSessionDetailOut,
    InterviewSessionIn,
    InterviewSessionOut,
    InterviewSummaryOut,
    SessionNoteIn,
)
from app.schemas.common import MessageResponse
from app.services.interviews import (
    CATEGORIES,
    delete_session,
    evaluate_answer,
    generate_interview_questions,
    session_owned_or_404,
    session_summary,
)
from app.services.profile_service import build_snapshot
from app.tasks.queue import enqueue

router = APIRouter(tags=["interview coach"])


def _session_out(session: InterviewSession, answered: int = 0, total: int = 0) -> InterviewSessionOut:
    return InterviewSessionOut(
        id=session.id, job_id=session.job_id, application_id=session.application_id,
        title=session.title, mode=session.mode, status=session.status,
        questions_source=session.questions_source, current_index=session.current_index,
        summary=session.summary, overall_score=session.overall_score, notes=session.notes,
        completed_at=session.completed_at, created_at=session.created_at,
        updated_at=session.updated_at, question_count=total, answered_count=answered,
    )


@router.get("/interviews", response_model=list[InterviewSessionOut])
async def list_sessions(user: CurrentUser, db: DbSession,
                        limit: int = Query(30, ge=1, le=100)) -> list[InterviewSessionOut]:
    sessions = list(db.scalars(select(InterviewSession).where(
        InterviewSession.user_id == user.id).order_by(InterviewSession.created_at.desc())
        .limit(limit)).all())
    output = []
    for session in sessions:
        total = db.scalar(select(func.count()).select_from(InterviewQuestion).where(
            InterviewQuestion.session_id == session.id)) or 0
        answered = db.scalar(select(func.count()).select_from(InterviewAnswer).join(
            InterviewQuestion, InterviewAnswer.question_id == InterviewQuestion.id).where(
            InterviewQuestion.session_id == session.id)) or 0
        output.append(_session_out(session, int(answered), int(total)))
    return output


@router.post("/interviews", response_model=dict, status_code=201)
async def create_session(payload: InterviewSessionIn, user: CurrentUser, db: DbSession) -> dict:
    job = None
    if payload.job_id:
        job = db.get(JobListing, payload.job_id)
        if not job or job.user_id != user.id:
            raise NotFoundError("Job not found")
    session = InterviewSession(
        user_id=user.id, job_id=job.id if job else None,
        application_id=payload.application_id,
        title=(payload.title or (f"Interview prep — {job.title} at {job.company}" if job
                                 else "General interview preparation"))[:300],
        mode="mock" if payload.use_ai else "question_bank", status="preparing",
        questions_source="deterministic",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    task = enqueue(
        db, user.id, "interview_prepare", f"Preparing questions: {session.title}",
        {"user_id": user.id, "session_id": session.id, "use_ai": payload.use_ai,
         "count": payload.question_count, "categories": payload.categories},
        dedupe_key=f"interview:{session.id}",
    )
    return {"session": _session_out(session).model_dump(),
            "task_id": task.id, "task_status": task.status,
            "message": "Question preparation queued."}


@router.get("/interviews/{session_id}", response_model=InterviewSessionDetailOut)
async def get_session(session_id: str, user: CurrentUser, db: DbSession) -> InterviewSessionDetailOut:
    session = session_owned_or_404(db, user.id, session_id)
    questions = list(db.scalars(select(InterviewQuestion).where(
        InterviewQuestion.session_id == session.id)
        .order_by(InterviewQuestion.sort_order)).all())
    answered = len([q for q in questions if q.answer])
    base = _session_out(session, answered, len(questions)).model_dump()
    answers = list(db.scalars(select(InterviewAnswer).where(
        InterviewAnswer.user_id == user.id,
        InterviewAnswer.question_id.in_([q.id for q in questions]),
    )).all()) if questions else []
    return InterviewSessionDetailOut(
        **base,
        questions=[InterviewQuestionOut(
            id=q.id, category=q.category, question=q.question, guidance=q.guidance,
            sort_order=q.sort_order, has_answer=q.answer is not None,
        ) for q in questions],
        answers=[InterviewAnswerOut.model_validate(a) for a in answers],
    )


@router.delete("/interviews/{session_id}", response_model=MessageResponse)
async def remove_session(session_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    delete_session(db, user.id, session_id)
    return MessageResponse(message="Interview session deleted.")


@router.patch("/interviews/{session_id}/notes", response_model=InterviewSessionOut)
async def update_notes(session_id: str, payload: SessionNoteIn, user: CurrentUser,
                       db: DbSession) -> InterviewSessionOut:
    session = session_owned_or_404(db, user.id, session_id)
    session.notes = payload.notes[:20_000]
    db.commit()
    return _session_out(session)


@router.post("/interviews/{session_id}/answer", response_model=AnswerFeedback)
async def submit_answer(session_id: str, payload: AnswerIn, user: CurrentUser,
                        db: DbSession) -> AnswerFeedback:
    session = session_owned_or_404(db, user.id, session_id)
    question = db.get(InterviewQuestion, payload.question_id)
    if not question or question.session_id != session.id:
        raise NotFoundError("Question not found in this session")
    if len(payload.answer_text.strip()) < 10:
        raise ValidationAppError("Write a little more so the feedback is useful.")
    answer = await evaluate_answer(db, user, session, question, payload.answer_text)
    total = db.scalar(select(func.count()).select_from(InterviewQuestion).where(
        InterviewQuestion.session_id == session.id)) or 0
    answered = db.scalar(select(func.count()).select_from(InterviewAnswer).join(
        InterviewQuestion, InterviewAnswer.question_id == InterviewQuestion.id).where(
        InterviewQuestion.session_id == session.id)) or 0
    db.refresh(session)
    return AnswerFeedback(
        answer=InterviewAnswerOut.model_validate(answer),
        session_progress={
            "answered": int(answered), "total": int(total),
            "current_index": session.current_index, "status": session.status,
            "overall_score": session.overall_score,
        },
    )


@router.post("/interviews/{session_id}/questions/{question_id}/follow-up", response_model=FollowUpOut)
async def follow_up(session_id: str, question_id: str, user: CurrentUser, db: DbSession) -> FollowUpOut:
    session = session_owned_or_404(db, user.id, session_id)
    question = db.get(InterviewQuestion, question_id)
    if not question or question.session_id != session.id:
        raise NotFoundError("Question not found in this session")
    if not question.answer:
        raise ValidationAppError("Answer the question first to receive a follow-up.")
    text = question.answer.follow_up
    if not text:
        text = ("What was the measurable outcome, and how would you approach it differently next time?")
    return FollowUpOut(follow_up=text)


@router.post("/interviews/{session_id}/complete", response_model=InterviewSummaryOut)
async def complete(session_id: str, user: CurrentUser, db: DbSession) -> InterviewSummaryOut:
    session = session_owned_or_404(db, user.id, session_id)
    questions = list(db.scalars(select(InterviewQuestion).where(
        InterviewQuestion.session_id == session.id)).all())
    if not questions:
        raise ValidationAppError("This session has no questions yet.")
    if not any(q.answer for q in questions):
        raise ValidationAppError("Answer at least one question before finishing the session.")
    scores = [q.answer.score for q in questions if q.answer and q.answer.score is not None]
    session.overall_score = round(sum(scores) / len(scores), 1) if scores else None
    session.status = "completed"
    session.completed_at = utcnow()
    session.summary = (f"Mock interview completed with {len(scores)} answered question(s). "
                       f"Average rubric score: {session.overall_score if session.overall_score is not None else 'n/a'}.")
    db.commit()
    summary = session_summary(db, session)
    db.refresh(session)
    detail = await get_session(session_id, user, db)
    return InterviewSummaryOut(
        session=detail, strengths=summary["strengths"],
        improvements=summary["improvements"], next_steps=summary["next_steps"],
        average_score=summary["average_score"],
    )


@router.get("/interviews/{session_id}/summary", response_model=InterviewSummaryOut)
async def get_summary(session_id: str, user: CurrentUser, db: DbSession) -> InterviewSummaryOut:
    session = session_owned_or_404(db, user.id, session_id)
    summary = session_summary(db, session)
    return InterviewSummaryOut(
        session=await get_session(session_id, user, db), strengths=summary["strengths"],
        improvements=summary["improvements"], next_steps=summary["next_steps"],
        average_score=summary["average_score"],
    )


@router.get("/interviews/meta/categories", response_model=list[dict])
async def categories() -> list[dict]:
    return [{"key": key, "label": key.replace("_", " ").title()} for key in CATEGORIES]


# --------------------------------------------------------------------------- notes


@router.get("/interview-notes", response_model=list[dict])
async def list_notes(user: CurrentUser, db: DbSession) -> list[dict]:
    notes = list(db.scalars(select(InterviewNote).where(InterviewNote.user_id == user.id)
                            .order_by(InterviewNote.updated_at.desc())).all())
    return [{"id": n.id, "title": n.title, "body": n.body, "company": n.company,
             "interview_date": n.interview_date, "session_id": n.session_id,
             "updated_at": n.updated_at} for n in notes]


@router.post("/interview-notes", response_model=dict, status_code=201)
async def create_note(payload: dict, user: CurrentUser, db: DbSession) -> dict:
    title = str(payload.get("title", "")).strip()
    body = str(payload.get("body", "")).strip()
    if not title and not body:
        raise ValidationAppError("Write a title or notes.")
    session_id = payload.get("session_id")
    if session_id:
        session_owned_or_404(db, user.id, session_id)
    note = InterviewNote(
        user_id=user.id, title=title[:250], body=body[:20_000],
        company=str(payload.get("company", ""))[:200],
        session_id=session_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "title": note.title, "body": note.body, "company": note.company,
            "updated_at": note.updated_at}


@router.patch("/interview-notes/{note_id}", response_model=dict)
async def update_note(note_id: str, payload: dict, user: CurrentUser, db: DbSession) -> dict:
    note = db.get(InterviewNote, note_id)
    if not note or note.user_id != user.id:
        raise NotFoundError("Note not found")
    if "title" in payload:
        note.title = str(payload["title"])[:250]
    if "body" in payload:
        note.body = str(payload["body"])[:20_000]
    if "company" in payload:
        note.company = str(payload["company"])[:200]
    db.commit()
    db.refresh(note)
    return {"id": note.id, "title": note.title, "body": note.body, "company": note.company,
            "updated_at": note.updated_at}


@router.delete("/interview-notes/{note_id}", response_model=MessageResponse)
async def delete_note(note_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    note = db.get(InterviewNote, note_id)
    if not note or note.user_id != user.id:
        raise NotFoundError("Note not found")
    db.delete(note)
    db.commit()
    return MessageResponse(message="Note deleted.")
