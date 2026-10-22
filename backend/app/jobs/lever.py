"""Lever job board provider (public postings API).

Endpoint: https://api.lever.co/v0/postings/{site_name}?mode=json
Public postings only; no authentication. Not a general search engine.
"""
from __future__ import annotations

import logging
from datetime import datetime

import httpx

from app.core.config import get_settings
from app.core.text import detect_seniority, detect_work_arrangement, extract_skills
from app.jobs.base import JobProvider, ProviderCandidate, ProviderError, ProviderQuery

logger = logging.getLogger("careerpilot.jobs.lever")

API_BASE = "https://api.lever.co/v0/postings"


class LeverProvider(JobProvider):
    key = "lever"
    label = "Lever"
    requires_token = True
    supports_search = False
    supports_board = True
    notes = ("Requires the company's public Lever site name (the first path segment of "
             "jobs.lever.co/company). Returns published postings only.")
    rate_limit_seconds = 1.2

    async def list_board(self, token: str, query: ProviderQuery) -> list[ProviderCandidate]:
        await self._throttle()
        settings = get_settings()
        url = f"{API_BASE}/{token}?mode=json"
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=6.0), follow_redirects=False,
                headers={"User-Agent": settings.job_discovery_user_agent, "Accept": "application/json"},
            ) as client:
                response = await client.get(url)
        except httpx.HTTPError as exc:
            raise ProviderError("Lever could not be reached.") from exc
        if response.status_code == 404:
            raise ProviderError("That Lever site name was not found.", retryable=False)
        if response.status_code == 429:
            raise ProviderError("Lever rate limit reached. Try again later.")
        if response.status_code >= 400:
            raise ProviderError(f"Lever returned HTTP {response.status_code}.")
        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError("Lever returned an unexpected response.") from exc
        if not isinstance(payload, list):
            raise ProviderError("Lever returned an unexpected response.")
        candidates: list[ProviderCandidate] = []
        for posting in payload[: min(query.max_results * 3, 300)]:
            if not isinstance(posting, dict):
                continue
            categories = posting.get("categories") or {}
            description = posting.get("descriptionPlain") or ""
            lists = posting.get("lists") or []
            sections = []
            for block in lists:
                if isinstance(block, dict):
                    sections.append(str(block.get("text", "")))
                    sections.extend(str(item) for item in (block.get("content") or [])[:15])
            text = "\n".join([description, *sections])[:30_000]
            title = posting.get("text", "") or "Untitled role"
            location = categories.get("location", "") or ""
            commitment = (categories.get("commitment", "") or "").lower()
            employment = {
                "intern": "internship", "part": "part_time", "contract": "contract",
                "temporary": "contract", "full": "full_time",
            }
            employment_type = next((v for k, v in employment.items() if k in commitment), "unknown")
            candidates.append(ProviderCandidate(
                provider=self.key,
                provider_job_id=str(posting.get("id", "")),
                title=title,
                company=token.replace("-", " ").title(),
                location=location,
                description=text,
                skills=extract_skills(f"{title} {text}")[:40],
                technologies=extract_skills(f"{title} {text}")[:20],
                work_arrangement=detect_work_arrangement(
                    f"{location} {categories.get('workplaceType', '')} {text[:2000]}"),
                employment_type=employment_type,
                source_url=posting.get("hostedUrl", "") or "",
                apply_url=posting.get("applyUrl", "") or posting.get("hostedUrl", "") or "",
                posted_at=_parse(posting.get("createdAt")),
                raw={"id": posting.get("id"), "team": categories.get("team", "")},
            ))
            if len(candidates) >= min(query.max_results, 200):
                break
        return candidates


def _parse(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000)
        except (ValueError, OSError):
            return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


provider = LeverProvider()
