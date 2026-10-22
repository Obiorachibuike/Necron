"""Job discovery, manual entry, URL import, matching, strategies and saved searches."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.ai.service import get_active_config
from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.database.base import utcnow
from app.jobs.base import ProviderError, ProviderQuery
from app.jobs.registry import PROVIDER_INFO, get_provider
from app.models import (
    Application,
    ApplicationStrategy,
    JobImport,
    JobListing,
    JobMatch,
    JobSearch,
    JobSource,
    User,
)
from app.schemas.common import MessageResponse, page_envelope
from app.schemas.jobs import (
    AnalyzedMatch,
    DiscoverRequest,
    DiscoveryRunOut,
    ExtractedJob,
    JobDetailOut,
    JobImportConfirm,
    JobImportOut,
    JobImportRequest,
    JobListingIn,
    JobListingOut,
    JobMatchOut,
    JobSourceIn,
    JobSourceOut,
    MatchRefreshOut,
    ProviderInfo,
    SavedSearchIn,
    SavedSearchOut,
)
from app.schemas.documents import StrategyIn, StrategyOut
from app.services.job_import import import_job, normalize_extracted, normalize_job_url, build_dedupe_hash
from app.services.jobs_service import (
    apply_extracted,
    candidate_to_extracted,
    compute_schedule,
    discover_jobs,
    job_stats,
    save_imported_job,
    source_query_from_search,
)
from app.services.matching import build_snapshot, upsert_match
from app.services.notifications import create_notification
from app.documents.service import (
    enhance_strategy_with_ai,
    build_deterministic_strategy,
    job_owned_or_404,
)
from app.tasks.queue import enqueue, worker_status

logger = logging.getLogger("careerpilot.api.jobs")

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _source_label(job: JobListing) -> str:
    if job.source:
        return job.source.display_name or job.source.company_name or job.source.provider
    return job.provider.replace("_", " ").title()


def job_dict(db, job: JobListing, match: JobMatch | None = None,
             application_id: str | None = None) -> dict:
    return {
        "id": job.id, "provider": job.provider, "company": job.company, "title": job.title,
        "location": job.location, "work_arrangement": job.work_arrangement,
        "employment_type": job.employment_type, "experience_level": job.experience_level,
        "description": job.description, "requirements": job.requirements or [],
        "responsibilities": job.responsibilities or [], "skills": job.skills or [],
        "technologies": job.technologies or [], "industry": job.industry,
        "salary_min": job.salary_min, "salary_max": job.salary_max,
        "salary_currency": job.salary_currency, "salary_period": job.salary_period,
        "visa_sponsorship": job.visa_sponsorship, "relocation_support": job.relocation_support,
        "source_url": job.source_url, "apply_url": job.apply_url,
        "posted_at": job.posted_at, "first_seen_at": job.first_seen_at,
        "last_verified_at": job.last_verified_at, "listing_status": job.listing_status,
        "is_saved": job.is_saved, "created_at": job.created_at, "updated_at": job.updated_at,
        "match_score": match.overall_score if match else None,
        "match_category": match.category if match else None,
        "has_match": match is not None,
        "has_application": application_id is not None,
        "source_name": _source_label(job),
    }


def _detail(db, user_id: str, job: JobListing) -> JobDetailOut:
    match = db.scalar(select(JobMatch).where(JobMatch.user_id == user_id,
                                             JobMatch.job_id == job.id))
    application = db.scalar(select(Application).where(Application.user_id == user_id,
                                                      Application.job_id == job.id))
    return JobDetailOut(
        **job_dict(db, job, match, application.id if application else None),
        match=JobMatchOut.model_validate(match) if match else None,
        application_id=application.id if application else None,
    )


# --------------------------------------------------------------------------- static routes
# Static paths must be registered before /{job_id} so they are not captured as IDs.


@router.get("/stats", response_model=dict)
async def stats(user: CurrentUser, db: DbSession) -> dict:
    return job_stats(db, user.id)


@router.get("/providers", response_model=list[ProviderInfo])
async def providers() -> list[ProviderInfo]:
    return [ProviderInfo(**item) for item in PROVIDER_INFO]


@router.get("/sources", response_model=list[JobSourceOut])
async def list_sources(user: CurrentUser, db: DbSession) -> list[JobSourceOut]:
    sources = list(db.scalars(select(JobSource).where(
        or_(JobSource.user_id == user.id, JobSource.is_global.is_(True)))
        .order_by(JobSource.created_at.asc())).all())
    return [JobSourceOut.model_validate(source) for source in sources]


@router.post("/sources", response_model=JobSourceOut, status_code=201)
async def create_source(payload: JobSourceIn, user: CurrentUser, db: DbSession) -> JobSourceOut:
    if payload.provider not in {"greenhouse", "lever"}:
        raise ValidationAppError("Only Greenhouse and Lever boards can be added as sources.")
    existing = db.scalar(select(JobSource).where(
        JobSource.user_id == user.id, JobSource.provider == payload.provider,
        JobSource.board_token == payload.board_token))
    if existing:
        return JobSourceOut.model_validate(existing)
    source = JobSource(
        user_id=user.id, provider=payload.provider, board_token=payload.board_token,
        company_name=payload.company_name[:200],
        display_name=(payload.display_name or payload.company_name or
                      f"{payload.provider.title()} · {payload.board_token}")[:250],
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return JobSourceOut.model_validate(source)


@router.patch("/sources/{source_id}", response_model=JobSourceOut)
async def update_source(source_id: str, payload: dict, user: CurrentUser,
                        db: DbSession) -> JobSourceOut:
    source = db.get(JobSource, source_id)
    if not source or (source.user_id != user.id and not source.is_global):
        raise NotFoundError("Job source not found")
    if source.is_global:
        raise AppError(403, "forbidden", "Global sources are managed by the operator.")
    if "enabled" in payload:
        source.enabled = bool(payload["enabled"])
    if "display_name" in payload:
        source.display_name = str(payload["display_name"])[:250]
    if "company_name" in payload:
        source.company_name = str(payload["company_name"])[:200]
    db.commit()
    db.refresh(source)
    return JobSourceOut.model_validate(source)


@router.delete("/sources/{source_id}", response_model=MessageResponse)
async def delete_source(source_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    source = db.get(JobSource, source_id)
    if not source or source.user_id != user.id:
        raise NotFoundError("Job source not found")
    db.delete(source)
    db.commit()
    return MessageResponse(message="Job source removed. Saved listings are kept.")


async def _run_source_health(db, source: JobSource) -> dict:
    provider = get_provider(source.provider)
    if not provider:
        raise ValidationAppError("Unsupported provider")
    try:
        health = await provider.health(source.board_token)
    except Exception as exc:  # noqa: BLE001 - isolated provider failure
        logger.info("source_health_failed provider=%s error=%s", source.provider, type(exc).__name__)
        health = None
    if health is None:
        source.health_status = "error"
        source.health_message = "The provider could not be reached."
        source.last_checked_at = utcnow()
        db.commit()
        return {"ok": False, "message": source.health_message, "items": 0}
    source.health_status = health.status
    source.health_message = health.message
    source.last_checked_at = health.checked_at or utcnow()
    source.last_items_count = health.items
    db.commit()
    return {"ok": health.ok, "message": health.message, "items": health.items}


@router.post("/sources/{source_id}/test", response_model=dict)
async def test_source(source_id: str, user: CurrentUser, db: DbSession) -> dict:
    source = db.get(JobSource, source_id)
    if not source or (source.user_id != user.id and not source.is_global):
        raise NotFoundError("Job source not found")
    return await _run_source_health(db, source)


@router.get("/sources/{source_id}/preview", response_model=list[dict])
async def preview_source(source_id: str, user: CurrentUser, db: DbSession,
                         limit: int = Query(10, ge=1, le=50)) -> list[dict]:
    source = db.get(JobSource, source_id)
    if not source or (source.user_id != user.id and not source.is_global):
        raise NotFoundError("Job source not found")
    provider = get_provider(source.provider)
    if not provider:
        raise ValidationAppError("Unsupported provider")
    try:
        candidates = await provider.list_board(source.board_token,
                                               ProviderQuery(max_results=limit))
    except ProviderError as exc:
        raise AppError(502, "provider_error", str(exc)) from exc
    return [{
        "provider_job_id": c.provider_job_id, "title": c.title, "company": c.company,
        "location": c.location, "employment_type": c.employment_type,
        "work_arrangement": c.work_arrangement, "source_url": c.source_url,
        "posted_at": c.posted_at, "skills": c.skills[:10],
    } for c in candidates[:limit]]


@router.post("/import", response_model=JobImportOut)
async def import_listing(payload: JobImportRequest, user: CurrentUser, db: DbSession) -> JobImportOut:
    try:
        result = await import_job(
            url=payload.url if payload.mode == "url" else "",
            description=payload.description, title_hint=payload.title,
            company_hint=payload.company)
    except AppError as exc:
        record = JobImport(
            user_id=user.id, source_url=payload.url[:2000], mode=payload.mode,
            status="failed", message=exc.message[:1000],
            raw_excerpt=payload.description[:5000],
        )
        db.add(record)
        db.commit()
        raise
    extracted = result["extracted"]
    record = JobImport(
        user_id=user.id, source_url=payload.url[:2000], mode=payload.mode,
        fetcher=result.get("fetcher", ""), status="extracted",
        message=result.get("message", "")[:1000], extracted=extracted,
        raw_excerpt=(extracted.get("description") or payload.description)[:5000],
    )
    db.add(record)
    db.commit()
    job_out = None
    if payload.save:
        job, match, _created = save_imported_job(db, user, extracted, save=True,
                                                 analyze=payload.analyze)
        job_out = _detail(db, user.id, job)
        record.job_id = job.id
        record.status = "saved"
        db.commit()
    return JobImportOut(
        import_id=record.id, status="saved" if job_out else "extracted",
        message=(result.get("message", "") + (" Saved and scored." if job_out else
                                              " Review the details, then save.")).strip(),
        extracted=extracted, job=job_out,
        requires_manual_description=bool(result.get("requires_manual_description")),
        warnings=extracted.get("warnings", []),
    )


@router.post("/import/confirm", response_model=JobDetailOut)
async def confirm_import(payload: JobImportConfirm, user: CurrentUser, db: DbSession) -> JobDetailOut:
    extracted = payload.extracted.model_dump()
    extracted["posted_at"] = payload.extracted.posted_at
    job, match, created = save_imported_job(db, user, extracted, save=payload.save,
                                            analyze=payload.analyze)
    return _detail(db, user.id, job)


@router.get("/imports", response_model=list[dict])
async def list_imports(user: CurrentUser, db: DbSession, limit: int = Query(10, ge=1, le=50)) -> list[dict]:
    records = list(db.scalars(select(JobImport).where(JobImport.user_id == user.id)
                              .order_by(JobImport.created_at.desc()).limit(limit)).all())
    return [{"id": r.id, "mode": r.mode, "status": r.status, "source_url": r.source_url,
             "fetcher": r.fetcher, "message": r.message, "job_id": r.job_id,
             "created_at": r.created_at} for r in records]


@router.post("/discover", response_model=DiscoveryRunOut)
async def run_discovery(payload: DiscoverRequest, user: CurrentUser, db: DbSession) -> DiscoveryRunOut:
    search = None
    if payload.search_id:
        search = db.get(JobSearch, payload.search_id)
        if not search or search.user_id != user.id:
            raise NotFoundError("Saved search not found")
    query = source_query_from_search(search, {
        "keywords": payload.keywords, "title": payload.title, "company": payload.company,
        "location": payload.location, "work_arrangements": payload.work_arrangements,
        "employment_types": payload.employment_types, "max_results": payload.max_results,
        "posted_within_days": payload.posted_within_days,
    })
    sources = db.scalars(select(JobSource).where(
        or_(JobSource.user_id == user.id, JobSource.is_global.is_(True)),
        JobSource.enabled.is_(True))).all()
    if not sources:
        raise ValidationAppError(
            "No job boards are configured. Add a public Greenhouse or Lever board, or import a job "
            "by URL or description.")
    task = enqueue(
        db, user.id, "job_discovery", "Discovering jobs",
        {"user_id": user.id, "search_id": payload.search_id, "source_ids": payload.source_ids,
         "query": query.__dict__, "max_results": payload.max_results},
        dedupe_key=f"discovery:{user.id}",
    )
    return DiscoveryRunOut(task_id=task.id, status=task.status,
                           message="Discovery queued. Results will appear as listings are scored.")


@router.post("/revalidate", response_model=DiscoveryRunOut)
async def revalidate(user: CurrentUser, db: DbSession) -> DiscoveryRunOut:
    task = enqueue(db, user.id, "revalidate_jobs", "Re-checking saved job listings",
                   {"user_id": user.id, "limit": 25},
                   dedupe_key=f"revalidate:{user.id}")
    return DiscoveryRunOut(task_id=task.id, status=task.status,
                           message="Listing verification queued.")


# --------------------------------------------------------------------------- saved searches


@router.get("/searches", response_model=list[SavedSearchOut])
async def list_searches(user: CurrentUser, db: DbSession) -> list[SavedSearchOut]:
    searches = list(db.scalars(select(JobSearch).where(JobSearch.user_id == user.id)
                               .order_by(JobSearch.created_at.desc())).all())
    available = worker_status(db)["active_workers"] > 0
    return [SavedSearchOut.model_validate(s).model_copy(update={"worker_available": available})
            for s in searches]


def _apply_search(search: JobSearch, payload: SavedSearchIn) -> JobSearch:
    for field, value in payload.model_dump().items():
        setattr(search, field, value)
    return search


@router.post("/searches", response_model=SavedSearchOut, status_code=201)
async def create_search(payload: SavedSearchIn, user: CurrentUser, db: DbSession) -> SavedSearchOut:
    search = _apply_search(JobSearch(user_id=user.id, name=payload.name), payload)
    search.next_run_at = compute_schedule(search)
    db.add(search)
    db.commit()
    db.refresh(search)
    return SavedSearchOut.model_validate(search).model_copy(
        update={"worker_available": worker_status(db)["active_workers"] > 0})


@router.patch("/searches/{search_id}", response_model=SavedSearchOut)
async def update_search(search_id: str, payload: SavedSearchIn, user: CurrentUser,
                        db: DbSession) -> SavedSearchOut:
    search = db.get(JobSearch, search_id)
    if not search or search.user_id != user.id:
        raise NotFoundError("Saved search not found")
    _apply_search(search, payload)
    search.next_run_at = compute_schedule(search)
    db.commit()
    db.refresh(search)
    return SavedSearchOut.model_validate(search).model_copy(
        update={"worker_available": worker_status(db)["active_workers"] > 0})


@router.delete("/searches/{search_id}", response_model=MessageResponse)
async def delete_search(search_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    search = db.get(JobSearch, search_id)
    if not search or search.user_id != user.id:
        raise NotFoundError("Saved search not found")
    db.delete(search)
    db.commit()
    return MessageResponse(message="Saved search deleted.")


@router.post("/searches/{search_id}/run", response_model=DiscoveryRunOut)
async def run_search(search_id: str, user: CurrentUser, db: DbSession) -> DiscoveryRunOut:
    search = db.get(JobSearch, search_id)
    if not search or search.user_id != user.id:
        raise NotFoundError("Saved search not found")
    task = enqueue(
        db, user.id, "job_discovery", f"Search: {search.name}",
        {"user_id": user.id, "search_id": search.id,
         "max_results": search.schedule_max_results},
        dedupe_key=f"discovery:search:{search.id}",
    )
    return DiscoveryRunOut(task_id=task.id, status=task.status,
                           message="Search queued.")


# --------------------------------------------------------------------------- strategies


def _strategy_out(strategy: ApplicationStrategy, generated_by_ai: bool = False,
                  ai_message: str = "") -> StrategyOut:
    return StrategyOut(
        id=strategy.id, job_id=strategy.job_id, positioning=strategy.positioning,
        selected_experience_ids=strategy.selected_experience_ids,
        selected_project_ids=strategy.selected_project_ids,
        selected_skill_ids=strategy.selected_skill_ids, highlights=strategy.highlights,
        gaps=strategy.gaps, keywords=strategy.keywords, approved=strategy.approved,
        approved_at=strategy.approved_at, source=strategy.source,
        created_at=strategy.created_at, updated_at=strategy.updated_at,
        generated_by_ai=generated_by_ai, ai_message=ai_message,
    )


@router.get("/{job_id}/strategy", response_model=StrategyOut)
async def get_strategy(job_id: str, user: CurrentUser, db: DbSession) -> StrategyOut:
    job = job_owned_or_404(db, user.id, job_id)
    strategy = db.scalar(select(ApplicationStrategy).where(
        ApplicationStrategy.user_id == user.id, ApplicationStrategy.job_id == job.id)
        .order_by(ApplicationStrategy.updated_at.desc()))
    if not strategy:
        raise NotFoundError("No strategy has been created for this job yet.")
    return _strategy_out(strategy, generated_by_ai=strategy.source == "ai")


@router.post("/{job_id}/strategy", response_model=StrategyOut)
async def create_strategy(job_id: str, user: CurrentUser, db: DbSession,
                          use_ai: bool = Query(True)) -> StrategyOut:
    job = job_owned_or_404(db, user.id, job_id)
    existing = db.scalar(select(ApplicationStrategy).where(
        ApplicationStrategy.user_id == user.id, ApplicationStrategy.job_id == job.id)
        .order_by(ApplicationStrategy.updated_at.desc()))
    strategy = existing or build_deterministic_strategy(db, user, job)
    ai_message = ""
    generated_by_ai = False
    if use_ai and get_active_config(db, user.id):
        strategy = await enhance_strategy_with_ai(db, user, job, strategy)
        generated_by_ai = strategy.source == "ai"
        ai_message = ("Strategy drafted with AI from verified evidence. Review and approve it."
                      if generated_by_ai else "AI enhancement unavailable; deterministic strategy kept.")
    else:
        ai_message = "Deterministic strategy based on your verified evidence."
    return _strategy_out(strategy, generated_by_ai, ai_message)


@router.patch("/strategies/{strategy_id}", response_model=StrategyOut)
async def update_strategy(strategy_id: str, payload: StrategyIn, user: CurrentUser,
                          db: DbSession) -> StrategyOut:
    strategy = db.get(ApplicationStrategy, strategy_id)
    if not strategy or strategy.user_id != user.id:
        raise NotFoundError("Strategy not found")
    snapshot = build_snapshot(db, user)
    valid_exp = {e.id for e in snapshot.experiences}
    valid_proj = {p.id for p in snapshot.projects}
    valid_skill = {s.id for s in snapshot.skills}
    invalid = (set(payload.selected_experience_ids) - valid_exp) | \
              (set(payload.selected_project_ids) - valid_proj) | \
              (set(payload.selected_skill_ids) - valid_skill)
    if invalid:
        raise ValidationAppError("The strategy references items that are not in your profile.")
    strategy.positioning = payload.positioning
    strategy.selected_experience_ids = payload.selected_experience_ids
    strategy.selected_project_ids = payload.selected_project_ids
    strategy.selected_skill_ids = payload.selected_skill_ids
    strategy.highlights = payload.highlights
    strategy.gaps = payload.gaps
    strategy.keywords = payload.keywords
    if payload.approved and not strategy.approved:
        strategy.approved = True
        strategy.approved_at = utcnow()
    elif not payload.approved:
        strategy.approved = False
        strategy.approved_at = None
    db.commit()
    db.refresh(strategy)
    return _strategy_out(strategy, generated_by_ai=strategy.source == "ai")


# --------------------------------------------------------------------------- listings


@router.get("", response_model=dict)
async def list_jobs(
    user: CurrentUser, db: DbSession,
    q: str = Query("", max_length=200),
    scope: str = Query("saved", pattern="^(saved|all|discovered)$"),
    listing_status: str | None = Query(None, max_length=30),
    arrangement: str | None = Query(None, max_length=20),
    employment_type: str | None = Query(None, max_length=40),
    provider: str | None = Query(None, max_length=40),
    min_score: int | None = Query(None, ge=0, le=100),
    max_score: int | None = Query(None, ge=0, le=100),
    posted_within_days: int | None = Query(None, ge=1, le=90),
    sort: str = Query("match", pattern="^(match|newest|oldest|title|company|score_asc)$"),
    page: int = Query(1, ge=1, le=1000),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    stmt = select(JobListing).where(JobListing.user_id == user.id)
    if scope == "saved":
        stmt = stmt.where(JobListing.is_saved.is_(True))
    elif scope == "discovered":
        stmt = stmt.where(JobListing.is_saved.is_(False))
    if listing_status:
        stmt = stmt.where(JobListing.listing_status == listing_status)
    if arrangement:
        stmt = stmt.where(JobListing.work_arrangement == arrangement)
    if employment_type:
        stmt = stmt.where(JobListing.employment_type == employment_type)
    if provider:
        stmt = stmt.where(JobListing.provider == provider)
    if posted_within_days:
        from datetime import timedelta

        stmt = stmt.where(JobListing.created_at >= utcnow() - timedelta(days=posted_within_days))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(JobListing.title.ilike(like), JobListing.company.ilike(like),
                              JobListing.description.ilike(like), JobListing.location.ilike(like)))
    match_alias = select(JobMatch).where(JobMatch.job_id == JobListing.id,
                                          JobMatch.user_id == user.id).subquery()
    score_column = match_alias.c.overall_score
    if min_score is not None or max_score is not None or sort in {"match", "score_asc"}:
        stmt = stmt.outerjoin(match_alias, match_alias.c.job_id == JobListing.id)
    if min_score is not None:
        stmt = stmt.where(score_column >= min_score)
    if max_score is not None:
        stmt = stmt.where(score_column <= max_score)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = {
        "match": score_column.desc().nullslast(),
        "score_asc": score_column.asc().nullslast(),
        "newest": JobListing.created_at.desc(),
        "oldest": JobListing.created_at.asc(),
        "title": JobListing.title.asc(),
        "company": JobListing.company.asc(),
    }[sort]
    jobs = list(db.scalars(stmt.order_by(order).limit(page_size)
                           .offset((page - 1) * page_size)).all())
    job_ids = [job.id for job in jobs]
    matches = {m.job_id: m for m in db.scalars(select(JobMatch).where(
        JobMatch.user_id == user.id, JobMatch.job_id.in_(job_ids))).all()} if job_ids else {}
    applications = {a.job_id: a for a in db.scalars(select(Application).where(
        Application.user_id == user.id, Application.job_id.in_(job_ids))).all()} if job_ids else {}
    items = [job_dict(db, job, matches.get(job.id),
                      applications[job.id].id if job.id in applications else None) for job in jobs]
    return page_envelope(items, int(total), page, page_size)


@router.post("", response_model=JobDetailOut, status_code=201)
async def create_job(payload: JobListingIn, user: CurrentUser, db: DbSession) -> JobDetailOut:
    extracted = payload.model_dump()
    extracted["provider"] = "manual"
    job, match, _created = save_imported_job(db, user, extracted, save=True, analyze=True)
    return _detail(db, user.id, job)


@router.get("/{job_id}", response_model=JobDetailOut)
async def get_job(job_id: str, user: CurrentUser, db: DbSession) -> JobDetailOut:
    job = job_owned_or_404(db, user.id, job_id)
    if not db.scalar(select(JobMatch).where(JobMatch.user_id == user.id,
                                             JobMatch.job_id == job.id)):
        upsert_match(db, user.id, job)
        db.commit()
    return _detail(db, user.id, job)


@router.patch("/{job_id}", response_model=JobDetailOut)
async def update_job(job_id: str, payload: dict, user: CurrentUser, db: DbSession) -> JobDetailOut:
    job = job_owned_or_404(db, user.id, job_id)
    recompute = False
    for field in ("is_saved", "title", "company", "location", "work_arrangement",
                  "employment_type", "experience_level", "description", "requirements",
                  "responsibilities", "skills", "technologies", "industry", "salary_min",
                  "salary_max", "salary_currency", "salary_period", "source_url", "apply_url",
                  "visa_sponsorship", "relocation_support"):
        if field in payload:
            value = payload[field]
            if isinstance(value, str):
                value = value[:60_000]
            setattr(job, field, value)
            if field not in {"is_saved"}:
                recompute = True
    if recompute:
        upsert_match(db, user.id, job)
    db.commit()
    db.refresh(job)
    return _detail(db, user.id, job)


@router.delete("/{job_id}", response_model=MessageResponse)
async def delete_job(job_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    job = job_owned_or_404(db, user.id, job_id)
    db.delete(job)
    db.commit()
    return MessageResponse(message="Job deleted.")


@router.get("/{job_id}/match", response_model=JobMatchOut)
async def get_match(job_id: str, user: CurrentUser, db: DbSession) -> JobMatchOut:
    job = job_owned_or_404(db, user.id, job_id)
    match = db.scalar(select(JobMatch).where(JobMatch.user_id == user.id,
                                             JobMatch.job_id == job.id))
    if not match:
        match = upsert_match(db, user.id, job)
        db.commit()
    return JobMatchOut.model_validate(match)


@router.post("/{job_id}/match", response_model=MatchRefreshOut)
async def refresh_match(job_id: str, user: CurrentUser, db: DbSession) -> MatchRefreshOut:
    job = job_owned_or_404(db, user.id, job_id)
    snapshot = build_snapshot(db, user)
    match = upsert_match(db, user.id, job, snapshot=snapshot)
    db.commit()
    db.refresh(match)
    create_notification(db, user.id, "match", "Match analysis refreshed",
                        f"{job.title} at {job.company}: {match.overall_score:g}/100.",
                        f"/jobs/{job.id}")
    return MatchRefreshOut(job_id=job.id, match=JobMatchOut.model_validate(match),
                           message="Match analysis recomputed from your current verified profile.")
