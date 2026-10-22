"""Greenhouse job board provider (public, documented board API).

Endpoint: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
No authentication is required for public boards. Only jobs the company has
chosen to publish via Greenhouse are visible; this is not a general job search
engine.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime

import httpx

from app.core.config import get_settings
from app.core.net import html_to_text
from app.core.text import detect_seniority, detect_work_arrangement, extract_skills
from app.jobs.base import JobProvider, ProviderCandidate, ProviderError, ProviderQuery

logger = logging.getLogger("careerpilot.jobs.greenhouse")

API_BASE = "https://boards-api.greenhouse.io/v1/boards"


class GreenhouseProvider(JobProvider):
    key = "greenhouse"
    label = "Greenhouse"
    requires_token = True
    supports_search = False
    supports_board = True
    notes = ("Requires the company's public Greenhouse board token (for example, the first path "
             "segment of boards.greenhouse.io/company). Only published postings are returned.")
    rate_limit_seconds = 1.2

    async def list_board(self, token: str, query: ProviderQuery) -> list[ProviderCandidate]:
        await self._throttle()
        settings = get_settings()
        url = f"{API_BASE}/{token}/jobs?content=true"
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=6.0), follow_redirects=False,
                headers={"User-Agent": settings.job_discovery_user_agent, "Accept": "application/json"},
            ) as client:
                response = await client.get(url)
        except httpx.HTTPError as exc:
            raise ProviderError("Greenhouse could not be reached.") from exc
        if response.status_code == 404:
            raise ProviderError("That Greenhouse board token was not found.", retryable=False)
        if response.status_code == 429:
            raise ProviderError("Greenhouse rate limit reached. Try again later.")
        if response.status_code >= 400:
            raise ProviderError(f"Greenhouse returned HTTP {response.status_code}.")
        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError("Greenhouse returned an unexpected response.") from exc
        jobs = payload.get("jobs", []) if isinstance(payload, dict) else []
        candidates: list[ProviderCandidate] = []
        for job in jobs[: min(query.max_results * 3, 300)]:
            content_html = html.unescape(job.get("content", "") or "")
            text, _title = html_to_text(content_html, limit=20_000)
            location = (job.get("location") or {}).get("name", "") or ""
            title = job.get("title", "") or "Untitled role"
            candidates.append(ProviderCandidate(
                provider=self.key,
                provider_job_id=str(job.get("id", "")),
                title=title,
                company=(job.get("company_name") or token.replace("-", " ").title()).strip(),
                location=location,
                description=text,
                skills=extract_skills(f"{title} {text}")[:40],
                technologies=extract_skills(f"{title} {text}")[:20],
                work_arrangement=detect_work_arrangement(f"{location} {text[:2000]}"),
                employment_type=_employment_type(job, text),
                source_url=job.get("absolute_url", "") or "",
                apply_url=job.get("absolute_url", "") or "",
                posted_at=_parse(job.get("updated_at")),
                raw={"id": job.get("id"), "updated_at": job.get("updated_at")},
            ))
            if len(candidates) >= min(query.max_results, 200):
                break
        return candidates


def _employment_type(job: dict, text: str) -> str:
    lowered = text[:3000].lower()
    metadata = " ".join(
        str(item.get("value", "")) for item in (job.get("metadata") or []) if isinstance(item, dict)
    ).lower()
    haystack = f"{lowered} {metadata}"
    if "intern" in haystack:
        return "internship"
    if "part-time" in haystack or "part time" in haystack:
        return "part_time"
    if "contract" in haystack:
        return "contract"
    if "full-time" in haystack or "full time" in haystack:
        return "full_time"
    return "unknown"


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


provider = GreenhouseProvider()
