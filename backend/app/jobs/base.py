"""Common job-provider interface.

Providers are isolated: a failure in one provider is reported and never stops
others. Only documented, public, unauthenticated endpoints are used.
"""
from __future__ import annotations

import abc
import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ProviderQuery:
    keywords: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    work_arrangements: list[str] = field(default_factory=list)
    employment_types: list[str] = field(default_factory=list)
    max_results: int = 50
    posted_within_days: int | None = None


@dataclass
class ProviderCandidate:
    provider: str
    provider_job_id: str
    title: str
    company: str
    location: str = ""
    description: str = ""
    requirements: list[str] = field(default_factory=list)
    responsibilities: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    technologies: list[str] = field(default_factory=list)
    employment_type: str = "unknown"
    work_arrangement: str = "unknown"
    source_url: str = ""
    apply_url: str = ""
    posted_at: datetime | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class ProviderHealth:
    ok: bool
    status: str
    message: str
    items: int = 0
    checked_at: datetime | None = None


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


class JobProvider(abc.ABC):
    key: str = ""
    label: str = ""
    requires_token: bool = True
    supports_search: bool = False
    supports_board: bool = True
    notes: str = ""
    rate_limit_seconds: float = 1.0

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._last_call = 0.0

    async def _throttle(self) -> None:
        async with self._lock:
            elapsed = time.monotonic() - self._last_call
            if elapsed < self.rate_limit_seconds:
                await asyncio.sleep(self.rate_limit_seconds - elapsed)
            self._last_call = time.monotonic()

    @abc.abstractmethod
    async def list_board(self, token: str, query: ProviderQuery) -> list[ProviderCandidate]:
        """Return normalized postings for a public board token."""

    async def search(self, token: str, query: ProviderQuery) -> list[ProviderCandidate]:
        candidates = await self.list_board(token, query)
        return filter_candidates(candidates, query)

    async def health(self, token: str) -> ProviderHealth:
        try:
            items = await self.list_board(token, ProviderQuery(max_results=1))
            from app.database.base import utcnow

            return ProviderHealth(True, "healthy", f"Board responded with {len(items)} posting(s).",
                                  len(items), utcnow())
        except ProviderError as exc:
            from app.database.base import utcnow

            return ProviderHealth(False, "error", str(exc), 0, utcnow())


def filter_candidates(candidates: list[ProviderCandidate], query: ProviderQuery) -> list[ProviderCandidate]:
    keywords = [k.strip().lower() for k in (query.keywords or "").split() if k.strip()]
    title_filter = (query.title or "").strip().lower()
    location_filter = (query.location or "").strip().lower()
    results = []
    for candidate in candidates:
        haystack = f"{candidate.title} {candidate.company} {candidate.description[:4000]}".lower()
        if keywords and not all(keyword in haystack for keyword in keywords):
            continue
        if title_filter and title_filter not in candidate.title.lower():
            continue
        if location_filter and location_filter not in candidate.location.lower():
            continue
        if query.work_arrangements and candidate.work_arrangement != "unknown" \
                and candidate.work_arrangement not in query.work_arrangements:
            continue
        if query.employment_types and candidate.employment_type != "unknown" \
                and candidate.employment_type not in query.employment_types:
            continue
        results.append(candidate)
        if len(results) >= query.max_results:
            break
    return results
