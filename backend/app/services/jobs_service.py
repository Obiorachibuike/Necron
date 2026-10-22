"""Job persistence, discovery orchestration, deduplication and freshness."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.core.text import detect_seniority
from app.database.base import utcnow
from app.jobs.base import ProviderCandidate, ProviderError, ProviderQuery
from app.jobs.registry import get_provider
from app.models import JobListing, JobMatch, JobSearch, JobSource, User
from app.services.job_import import normalize_extracted
from app.services.matching import build_snapshot, upsert_match
from app.services.notifications import create_notification

logger = logging.getLogger("careerpilot.jobs")


def source_query_from_search(search: JobSearch | None, overrides: dict | None = None) -> ProviderQuery:
    data = {
        "keywords": getattr(search, "keywords", "") if search else "",
        "title": getattr(search, "title", "") if search else "",
        "location": "",
        "work_arrangements": list(getattr(search, "work_arrangements", []) or []) if search else [],
        "employment_types": list(getattr(search, "employment_types", []) or []) if search else [],
        "max_results": getattr(search, "schedule_max_results", 50) if search else 50,
        "posted_within_days": getattr(search, "posted_within_days", None) if search else None,
    }
    if search and search.cities:
        data["location"] = search.cities[0]
    for key, value in (overrides or {}).items():
        if value not in (None, "", []):
            data[key] = value
    return ProviderQuery(**data)


def apply_extracted(job: JobListing, extracted: dict) -> JobListing:
    """Copy validated extracted fields onto a listing without silent overwrites."""
    mapping = {
        "title": ("title", str), "company": ("company", str), "location": ("location", str),
        "work_arrangement": ("work_arrangement", str), "employment_type": ("employment_type", str),
        "experience_level": ("experience_level", str), "description": ("description", str),
        "requirements": ("requirements", list), "responsibilities": ("responsibilities", list),
        "skills": ("skills", list), "technologies": ("technologies", list),
        "industry": ("industry", str), "salary_min": ("salary_min", int),
        "salary_max": ("salary_max", int), "salary_currency": ("salary_currency", str),
        "salary_period": ("salary_period", str), "source_url": ("source_url", str),
        "apply_url": ("apply_url", str), "visa_sponsorship": ("visa_sponsorship", bool),
        "relocation_support": ("relocation_support", bool),
    }
    for key, (attr, kind) in mapping.items():
        if key not in extracted:
            continue
        value = extracted[key]
        if value is None:
            if kind in (int, bool):
                setattr(job, attr, value)
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value and attr not in {"salary_currency"}:
                continue
        if kind is list:
            value = [str(v)[:400] for v in value if str(v).strip()][:80]
        setattr(job, attr, value)
    posted = extracted.get("posted_at")
    if posted:
        if isinstance(posted, str):
            try:
                posted = datetime.fromisoformat(posted.replace("Z", "+00:00"))
            except ValueError:
                posted = None
        if isinstance(posted, datetime):
            job.posted_at = posted
    return job


def save_imported_job(db: Session, user: User, extracted: dict, *, save: bool = True,
                      analyze: bool = True, source_id: str | None = None) -> tuple[JobListing, JobMatch | None, bool]:
    """Persist a job (deduplicated) and optionally score it. Returns (job, match, created)."""
    extracted = normalize_extracted(dict(extracted))
    dedupe = extracted.get("dedupe_hash") or ""
    existing = None
    if dedupe:
        existing = db.scalar(select(JobListing).where(
            JobListing.user_id == user.id, JobListing.dedupe_hash == dedupe))
    if not existing and extracted.get("url_normalized"):
        existing = db.scalar(select(JobListing).where(
            JobListing.user_id == user.id, JobListing.url_normalized == extracted["url_normalized"]))
    created = False
    if existing:
        job = existing
        job.last_verified_at = utcnow() if extracted.get("provider") in {"greenhouse", "lever"} else job.last_verified_at
        if extracted.get("provider") in {"greenhouse", "lever"}:
            job.listing_status = "active"
        if not job.description and extracted.get("description"):
            apply_extracted(job, {"description": extracted["description"]})
    else:
        job = JobListing(
            user_id=user.id,
            source_id=source_id,
            provider=extracted.get("provider", "manual"),
            provider_job_id=str(extracted.get("provider_job_id", ""))[:200],
            url_normalized=extracted.get("url_normalized", ""),
            dedupe_hash=dedupe,
            first_seen_at=utcnow(),
            listing_status="active" if extracted.get("provider") in {"greenhouse", "lever"}
            else "not_recently_verified",
        )
        apply_extracted(job, extracted)
        if extracted.get("provider") in {"greenhouse", "lever"}:
            job.last_verified_at = utcnow()
        job.is_saved = bool(save)
        db.add(job)
        db.flush()
        created = True
    if save:
        job.is_saved = True
    match = None
    if analyze:
        snapshot = build_snapshot(db, user)
        match = upsert_match(db, user.id, job, snapshot=snapshot)
    db.commit()
    db.refresh(job)
    if match:
        db.refresh(match)
    return job, match, created


def candidate_to_extracted(candidate: ProviderCandidate) -> dict:
    return {
        "title": candidate.title, "company": candidate.company, "location": candidate.location,
        "description": candidate.description, "requirements": candidate.requirements,
        "responsibilities": candidate.responsibilities, "skills": candidate.skills,
        "technologies": candidate.technologies, "employment_type": candidate.employment_type,
        "work_arrangement": candidate.work_arrangement, "experience_level": detect_seniority(candidate.title),
        "source_url": candidate.source_url, "apply_url": candidate.apply_url or candidate.source_url,
        "posted_at": candidate.posted_at, "provider": candidate.provider,
        "provider_job_id": candidate.provider_job_id, "salary_min": candidate.salary_min,
        "salary_max": candidate.salary_max, "salary_currency": candidate.salary_currency,
        "industry": "", "confidence": {"title": "high", "company": "high", "requirements": "medium"},
        "warnings": [],
    }


def sources_for_user(db: Session, user_id: str) -> list[JobSource]:
    return list(db.scalars(select(JobSource).where(
        JobSource.enabled.is_(True),
        ((JobSource.user_id == user_id) | (JobSource.is_global.is_(True))),
    )).all())


def _update_source_health(source: JobSource, ok: bool, message: str, item_count: int = 0) -> None:
    source.health_status = "healthy" if ok else "error"
    source.health_message = message[:1000]
    source.last_checked_at = utcnow()
    source.last_items_count = item_count


def discover_jobs(db: Session, user: User, query: ProviderQuery,
                  *, source_ids: list[str] | None = None, search: JobSearch | None = None,
                  max_results: int = 50, progress=None) -> dict:
    """Run discovery across configured sources. Provider failures are isolated."""
    if progress:
        progress(5, "Preparing sources")
    sources = sources_for_user(db, user.id)
    if source_ids:
        sources = [s for s in sources if s.id in set(source_ids)]
    providers_filter = set(search.source_providers or []) if search else set()
    if not sources:
        return {
            "found": 0, "created": 0, "duplicates": 0, "scored": 0,
            "sources_used": [], "source_errors": [],
            "message": ("No job boards are configured yet. Add a public Greenhouse or Lever board in "
                        "Discover Jobs, or import a job by URL or pasted description."),
        }

    snapshot = build_snapshot(db, user)
    created = duplicates = found = scored = 0
    errors: list[dict] = []
    used: list[str] = []
    remaining = max_results
    for index, source in enumerate(sources):
        if remaining <= 0:
            break
        if providers_filter and source.provider not in providers_filter:
            continue
        provider = get_provider(source.provider)
        if not provider:
            errors.append({"source": source.display_name or source.provider,
                           "message": "Unsupported provider."})
            continue
        if progress:
            progress(min(90, 10 + int(index / max(1, len(sources)) * 75)),
                     f"Searching {source.company_name or source.board_token}")
        try:
            candidates = await_provider_search(provider, source, query)
        except ProviderError as exc:
            _update_source_health(source, False, str(exc))
            db.commit()
            errors.append({"source": source.display_name or source.board_token, "message": str(exc)})
            continue
        except Exception as exc:  # noqa: BLE001 - provider isolation
            logger.warning("provider_unexpected_error provider=%s", source.provider)
            _update_source_health(source, False, "Unexpected provider error.")
            db.commit()
            errors.append({"source": source.display_name or source.board_token,
                           "message": "Unexpected provider error."})
            continue
        _update_source_health(source, True, f"Returned {len(candidates)} posting(s).", len(candidates))
        used.append(f"{provider.label}: {source.company_name or source.board_token}")
        for candidate in candidates[:remaining]:
            found += 1
            extracted = candidate_to_extracted(candidate)
            job, _match, was_created = save_imported_job(
                db, user, extracted, save=True, analyze=False, source_id=source.id)
            if was_created:
                created += 1
                job.source_id = source.id
                db.flush()
                remaining -= 1
            else:
                duplicates += 1
            upsert_match(db, user.id, job, snapshot=snapshot)
            scored += 1
        if search and search.min_match_score:
            threshold = search.min_match_score
            for candidate_job in db.scalars(select(JobListing).where(
                    JobListing.user_id == user.id, JobListing.source_id == source.id)).all():
                candidate_match = db.scalar(select(JobMatch).where(
                    JobMatch.job_id == candidate_job.id, JobMatch.user_id == user.id))
                if candidate_match and candidate_match.overall_score < threshold:
                    candidate_job.is_saved = False
        db.commit()
    if progress:
        progress(95, "Saving results")
    if created > 0:
        create_notification(
            db, user.id, "job_matches",
            f"{created} new job {'match' if created == 1 else 'matches'} found",
            "Review the new listings and their match explanations.",
            "/jobs?tab=saved",
        )
    if search:
        search.last_run_at = utcnow()
        search.last_result_count = created
        search.last_error = "; ".join(error["message"] for error in errors)[:2000]
        _schedule_next_run(search)
    db.commit()
    message = (f"{created} new listing(s) saved, {duplicates} duplicate(s) skipped, "
               f"{scored} scored across {len(used)} source(s).")
    if errors:
        message += f" {len(errors)} source(s) reported errors."
    return {"found": found, "created": created, "duplicates": duplicates, "scored": scored,
            "sources_used": used, "source_errors": errors, "message": message}


def await_provider_search(provider, source: JobSource, query: ProviderQuery):
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        raise RuntimeError("Synchronous discovery cannot run inside an event loop; use the async task wrapper")
    return asyncio.run(provider.search(source.board_token, query))


def _schedule_next_run(search: JobSearch) -> None:
    search.next_run_at = compute_schedule(search)


def compute_schedule(search: JobSearch) -> datetime | None:
    if not search.schedule_enabled or search.schedule_frequency == "manual":
        return None
    hour = max(0, min(23, search.schedule_hour_utc))
    now = utcnow()
    candidate = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    if search.schedule_frequency == "weekly":
        candidate += timedelta(days=6)
    return candidate


def dedupe_key_for_listing(user_id: str, extracted: dict) -> str:
    normalized = normalize_extracted(dict(extracted))
    return f"{user_id}:{normalized.get('dedupe_hash', '')}"


def job_stats(db: Session, user_id: str) -> dict:
    total = db.scalar(select(func.count()).select_from(JobListing).where(JobListing.user_id == user_id)) or 0
    saved = db.scalar(select(func.count()).select_from(JobListing).where(
        JobListing.user_id == user_id, JobListing.is_saved.is_(True))) or 0
    matches = db.scalar(select(func.count()).select_from(JobMatch).where(JobMatch.user_id == user_id)) or 0
    strong = db.scalar(select(func.count()).select_from(JobMatch).where(
        JobMatch.user_id == user_id, JobMatch.overall_score >= 80)) or 0
    return {"total": total, "saved": saved, "scored": matches, "strong_matches": strong}


def refresh_listing_freshness(db: Session, user_id: str, limit: int = 25) -> int:
    """Re-check provider-hosted listings and mark unavailable ones honestly."""
    jobs = list(db.scalars(select(JobListing).where(
        JobListing.user_id == user_id,
        JobListing.provider.in_(("greenhouse", "lever")),
        JobListing.is_saved.is_(True),
    ).order_by(JobListing.last_verified_at.asc()).limit(limit)).all())
    checked = 0
    for job in jobs:
        source = db.get(JobSource, job.source_id) if job.source_id else None
        provider = get_provider(job.provider)
        if not source or not provider:
            continue
        try:
            candidates = await_provider_search(
                provider, source, ProviderQuery(max_results=200))
            found = any(c.provider_job_id == job.provider_job_id for c in candidates)
            job.last_verified_at = utcnow()
            job.listing_status = "active" if found else "unavailable"
        except ProviderError:
            job.listing_status = "not_recently_verified"
            job.last_verified_at = utcnow()
            logger.info("freshness_check_failed job=%s", job.id)
        checked += 1
    db.commit()
    return checked
