"""Job description extraction from pasted text, public pages and provider APIs.

All retrieved content is untrusted. It is parsed as data only: it is never
interpreted as instructions and is never allowed to influence system prompts.
"""
from __future__ import annotations

import html
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx

from app.core.config import get_settings
from app.core.errors import AppError, ValidationAppError
from app.core.net import FetchResult, fetch_job_page, html_to_text, normalize_job_url, validate_url_async
from app.core.text import (
    clean_whitespace,
    detect_seniority,
    detect_work_arrangement,
    extract_skills,
)

logger = logging.getLogger("careerpilot.jobs.import")

RESTRICTED_HOSTS = {
    "linkedin.com": "LinkedIn blocks automated access to job pages.",
    "indeed.com": "Indeed blocks automated access to job pages.",
    "glassdoor.com": "Glassdoor blocks automated access to job pages.",
    "monster.com": "Monster blocks automated access to job pages.",
    "ziprecruiter.com": "ZipRecruiter blocks automated access to job pages.",
    "wellfound.com": "Wellfound requires authentication for job details.",
    "upwork.com": "Upwork requires authentication for job details.",
    "fiverr.com": "Fiverr requires authentication for job details.",
}

CURRENCY_SYMBOLS = {"$": "USD", "£": "GBP", "€": "EUR", "₦": "NGN", "₹": "INR",
                    "C$": "CAD", "A$": "AUD", "R$": "BRL", "¥": "JPY"}

SECTION_HEADINGS = {
    "requirements": {"requirements", "required", "must have", "must-have", "what you'll need",
                     "what we're looking for", "qualifications", "who you are", "you have",
                     "skills and experience", "essential"},
    "responsibilities": {"responsibilities", "what you'll do", "the role", "your role",
                         "day to day", "duties", "about the role", "what you will do"},
    "benefits": {"benefits", "perks", "what we offer", "compensation", "why join"},
}

EMPLOYMENT_PATTERNS = [
    ("internship", r"\bintern(ship)?\b"),
    ("contract", r"\b(contract|contractor|freelance|fixed[- ]term)\b"),
    ("part_time", r"\bpart[- ]time\b"),
    ("temporary", r"\btemporary\b"),
    ("full_time", r"\bfull[- ]time\b"),
]


def detect_restricted_source(url: str) -> str | None:
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return None
    for domain, reason in RESTRICTED_HOSTS.items():
        if host == domain or host.endswith("." + domain):
            return reason
    return None


def detect_provider(url: str) -> dict:
    """Identify a supported structured provider and its identifiers from a URL."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return {"provider": "generic", "token": "", "job_id": ""}
    host = (parts.hostname or "").lower()
    path_parts = [p for p in parts.path.split("/") if p]
    if "greenhouse.io" in host:
        # /{token}/jobs/{id}
        if len(path_parts) >= 3 and path_parts[1] == "jobs":
            return {"provider": "greenhouse", "token": path_parts[0], "job_id": path_parts[2]}
        if len(path_parts) >= 4 and path_parts[1] == "jobs" and path_parts[2] == "jobs":
            return {"provider": "greenhouse", "token": path_parts[0], "job_id": path_parts[3]}
        if len(path_parts) >= 2:
            return {"provider": "greenhouse", "token": path_parts[0], "job_id": ""}
    if "lever.co" in host and len(path_parts) >= 2:
        return {"provider": "lever", "token": path_parts[0], "job_id": path_parts[1]}
    return {"provider": "generic", "token": "", "job_id": ""}


def parse_salary(text: str) -> tuple[int | None, int | None, str, str]:
    if not text:
        return None, None, "", "annual"
    pattern = re.compile(
        r"(?P<cur>USD|GBP|EUR|NGN|CAD|AUD|INR|\$|£|€|₦|₹)?\s?"
        r"(?P<low>\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?\s?[kK]?)"
        r"(?:\s*(?:-|–|to)\s*(?P<cur2>USD|GBP|EUR|NGN|CAD|AUD|INR|\$|£|€|₦|₹)?\s?"
        r"(?P<high>\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?\s?[kK]?))?",
        re.I,
    )
    for match in pattern.finditer(text):
        low_raw = match.group("low").replace(",", "").replace(" ", "").replace(".", "") \
            if re.search(r"\d{1,3}(?:[,.]\d{3})+", match.group("low")) else match.group("low").replace(" ", "")
        multiplier = 1
        if low_raw.lower().endswith("k"):
            multiplier, low_raw = 1000, low_raw[:-1]
        try:
            low = int(float(low_raw) * multiplier)
        except ValueError:
            continue
        if low <= 0:
            continue
        high = None
        if match.group("high"):
            high_raw = match.group("high").replace(",", "").replace(" ", "")
            high_multiplier = 1
            if high_raw.lower().endswith("k"):
                high_multiplier, high_raw = 1000, high_raw[:-1]
            try:
                high = int(float(high_raw) * high_multiplier)
            except ValueError:
                high = None
        currency = match.group("cur") or match.group("cur2") or ""
        currency = CURRENCY_SYMBOLS.get(currency, currency.upper())
        period = "hourly" if re.search(r"per hour|/hour|/hr|hourly", text, re.I) else "annual"
        if currency and (low >= 1000 or period == "annual"):
            return (low, high, currency, period)
    return None, None, "", "annual"


def parse_relative_date(text: str) -> datetime | None:
    now = datetime.now(timezone.utc)
    match = re.search(r"(\d{1,2})\s*(day|week|hour|month)s?\s+ago", text or "", re.I)
    if match:
        value, unit = int(match.group(1)), match.group(2).lower()
        return now - timedelta(**{f"{unit}s": value})
    match = re.search(r"posted\s+(?:on\s+)?(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})",
                      text or "", re.I)
    if match:
        try:
            return datetime.strptime(f"{match.group(1)} {match.group(2)} {match.group(3)}", "%d %b %Y").replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _split_bullets(lines: list[str]) -> list[str]:
    bullets = []
    for line in lines:
        cleaned = re.sub(r"^\s*[•●▪◦\-\*\u2013\u2022]\s*", "", line).strip()
        if cleaned:
            bullets.append(cleaned[:500])
    return bullets[:30]


def _sectionize(text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {"body": []}
    current = "body"
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        normalized = re.sub(r"[^a-z ']", "", line.lower()).strip().rstrip(":")
        matched = next((key for key, headings in SECTION_HEADINGS.items() if normalized in headings), None)
        if matched and len(line) <= 60:
            current = matched
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return sections


def extract_job_from_text(text: str, *, url: str = "", title_hint: str = "",
                          company_hint: str = "", page_title: str = "") -> dict:
    """Heuristic structured extraction with explicit confidence and warnings."""
    text = (text or "").strip()
    if len(clean_whitespace(text)) < 40:
        raise ValidationAppError("There is not enough text to analyze. Paste the full job description.")
    text = text[:60_000]
    warnings: list[str] = []
    sections = _sectionize(text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    title = title_hint.strip()
    if not title:
        for pattern in (r"job title\s*[:\-]\s*(.+)", r"position\s*[:\-]\s*(.+)", r"role\s*[:\-]\s*(.+)"):
            match = re.search(pattern, text[:2000], re.I)
            if match:
                title = clean_whitespace(match.group(1))[:200]
                break
    if not title and page_title:
        title = re.sub(r"\b(job|career|position|opening|apply|hiring)\b.*$", "", page_title,
                       flags=re.I).strip(" -|–:")[:200] or page_title[:200]
    if not title:
        for line in lines[:6]:
            if 2 <= len(line.split()) <= 12 and not re.search(r"@|https?://|\d{5,}", line):
                title = line[:200]
                break
    if not title:
        title = "Untitled role"
        warnings.append("The job title could not be detected. Confirm it before saving.")

    company = company_hint.strip()
    if not company:
        match = re.search(r"company\s*[:\-]\s*(.+)", text[:3000], re.I)
        if match:
            company = clean_whitespace(match.group(1))[:200]
    if not company:
        match = re.search(r"\bat\s+([A-Z][A-Za-z0-9&'.]+(?:\s+[A-Z][A-Za-z0-9&'.]+){0,3})", title)
        if match:
            company = match.group(1)[:200]
    if not company and url:
        provider = detect_provider(url)
        if provider["token"]:
            company = provider["token"].replace("-", " ").title()[:200]
        else:
            host = (urlsplit(url).hostname or "").replace("www.", "")
            base = host.split(".")
            if len(base) >= 2:
                company = base[-2].replace("-", " ").title()[:200]
    if not company:
        company = "Unknown company"
        warnings.append("The company name could not be detected. Edit it before saving.")

    location = ""
    match = re.search(r"location\s*[:\-]\s*([^\n]{2,120})", text[:4000], re.I)
    if match:
        location = clean_whitespace(match.group(1))[:200]
    if not location:
        match = re.search(r"\b(remote|hybrid)\b", text[:3000], re.I)
        if match:
            location = match.group(1).capitalize()

    arrangement = detect_work_arrangement(f"{location} {title} {text[:4000]}")
    employment_type = "unknown"
    for key, pattern in EMPLOYMENT_PATTERNS:
        if re.search(pattern, text[:6000], re.I):
            employment_type = key
            break
    level = detect_seniority(title, text[:3000])

    requirements = _split_bullets(sections.get("requirements", []))
    responsibilities = _split_bullets(sections.get("responsibilities", []))
    if not requirements:
        warnings.append("No dedicated requirements section was found; requirements were inferred from the description.")
    if not responsibilities:
        responsibilities = _split_bullets([l for l in lines if re.match(r"^[•●▪\-*]", l)])[:15]

    skills = extract_skills(f"{title} {text}")
    salary_min, salary_max, currency, period = parse_salary(text)
    posted_at = parse_relative_date(text)

    confidence = {
        "title": "high" if title_hint or title != "Untitled role" else "low",
        "company": "high" if company_hint or company != "Unknown company" else "low",
        "location": "high" if location else "low",
        "salary": "high" if salary_min else "low",
        "requirements": "high" if requirements else "low",
        "skills": "medium" if skills else "low",
    }
    return {
        "title": title,
        "company": company,
        "location": location,
        "work_arrangement": arrangement,
        "employment_type": employment_type,
        "experience_level": level,
        "description": text,
        "requirements": requirements,
        "responsibilities": responsibilities,
        "skills": skills[:40],
        "technologies": skills[:20],
        "salary_min": salary_min,
        "salary_max": salary_max,
        "salary_currency": currency,
        "salary_period": period,
        "source_url": url,
        "apply_url": url,
        "industry": "",
        "posted_at": posted_at,
        "provider": "url" if url else "manual",
        "provider_job_id": "",
        "confidence": confidence,
        "warnings": warnings[:6],
        "extraction_source": "heuristic_text",
    }


async def _fetch_json(url: str, timeout: float = 12.0) -> dict | list:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=6.0),
                                 follow_redirects=False,
                                 headers={"User-Agent": settings.job_discovery_user_agent,
                                          "Accept": "application/json"}) as client:
        response = await client.get(url)
        if response.status_code >= 400:
            raise AppError(502, "provider_error", f"Job provider returned HTTP {response.status_code}.")
        content = response.content[:settings.job_fetch_max_bytes]
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise AppError(502, "provider_error", "Job provider returned an unexpected response.") from exc


async def fetch_greenhouse_job(token: str, job_id: str) -> dict:
    data = await _fetch_json(
        f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{job_id}?content=true")
    content_html = html.unescape(data.get("content", "") or "")
    text, _title = html_to_text(content_html)
    location = (data.get("location") or {}).get("name", "")
    extracted = extract_job_from_text(
        text or data.get("title", ""), url=data.get("absolute_url", ""),
        title_hint=data.get("title", ""), company_hint=token.replace("-", " ").title(),
    )
    extracted.update({
        "location": location or extracted["location"],
        "provider": "greenhouse",
        "provider_job_id": str(data.get("id", job_id)),
        "source_url": data.get("absolute_url", "") or extracted["source_url"],
        "apply_url": data.get("absolute_url", "") or extracted["apply_url"],
        "posted_at": _parse_iso(data.get("updated_at")),
        "confidence": {**extracted["confidence"], "title": "high", "company": "high"},
    })
    extracted["warnings"] = [w for w in extracted["warnings"]
                             if "title could not" not in w and "company name could not" not in w]
    extracted["extraction_source"] = "greenhouse_api"
    return extracted


async def fetch_lever_job(token: str, job_id: str) -> dict:
    data = await _fetch_json(f"https://api.lever.co/v0/postings/{token}/{job_id}?mode=json")
    if not isinstance(data, dict):
        raise AppError(502, "provider_error", "Job provider returned an unexpected response.")
    description = data.get("descriptionPlain") or ""
    extras = []
    for block in data.get("lists", []) or []:
        extras.append(f"{block.get('text', '')}")
        extras.extend(block.get("content", "") or [])
    text = "\n".join([description, *extras])
    categories = data.get("categories") or {}
    extracted = extract_job_from_text(
        text, url=data.get("hostedUrl", ""), title_hint=data.get("text", ""),
        company_hint=token.replace("-", " ").title(),
    )
    extracted.update({
        "location": categories.get("location", "") or extracted["location"],
        "employment_type": _map_commitment(categories.get("commitment", "")),
        "work_arrangement": detect_work_arrangement(
            f"{categories.get('location', '')} {categories.get('workplaceType', '')} {text[:2000]}"),
        "provider": "lever",
        "provider_job_id": str(data.get("id", job_id)),
        "source_url": data.get("hostedUrl", "") or extracted["source_url"],
        "apply_url": data.get("applyUrl", "") or data.get("hostedUrl", ""),
        "posted_at": _parse_iso(data.get("createdAt")),
        "confidence": {**extracted["confidence"], "title": "high", "company": "high"},
    })
    extracted["warnings"] = [w for w in extracted["warnings"]
                             if "title could not" not in w and "company name could not" not in w]
    extracted["extraction_source"] = "lever_api"
    return extracted


def _map_commitment(value: str) -> str:
    lowered = (value or "").lower()
    if "intern" in lowered:
        return "internship"
    if "part" in lowered:
        return "part_time"
    if "contract" in lowered or "temporary" in lowered:
        return "contract"
    if "full" in lowered:
        return "full_time"
    return "unknown"


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


async def import_job(url: str = "", description: str = "", title_hint: str = "",
                     company_hint: str = "") -> dict:
    """Return an extraction result plus retrieval metadata.

    Provider APIs are used when the URL is a recognised Greenhouse or Lever
    posting; otherwise a single public page is fetched with SSRF protections.
    Restricted boards are never scraped.
    """
    if not url:
        extracted = extract_job_from_text(description, title_hint=title_hint,
                                          company_hint=company_hint)
        extracted["fetcher"] = "manual"
        extracted["retrieval_message"] = "Parsed from the description you pasted."
        return {"status": "extracted", "extracted": extracted, "fetcher": "manual",
                "requires_manual_description": False,
                "message": "Description parsed. Review the extracted details before saving."}

    url = await validate_url_async(url)
    restricted = detect_restricted_source(url)
    if restricted:
        raise AppError(
            422, "source_restricted",
            f"{restricted} Paste the job description manually to analyze it.",
            details=[{"field": "url", "message": restricted}],
        )
    provider = detect_provider(url)
    if provider["provider"] in {"greenhouse", "lever"} and provider["job_id"]:
        try:
            if provider["provider"] == "greenhouse":
                extracted = await fetch_greenhouse_job(provider["token"], provider["job_id"])
            else:
                extracted = await fetch_lever_job(provider["token"], provider["job_id"])
            return {
                "status": "extracted", "extracted": extracted, "fetcher": f"{provider['provider']}_api",
                "requires_manual_description": False,
                "message": f"Retrieved from the {provider['provider'].title()} job API.",
            }
        except (AppError, httpx.HTTPError) as exc:
            logger.info("provider_fetch_failed provider=%s error=%s", provider["provider"], type(exc).__name__)
            # Fall through to a normal page fetch.

    fetched: FetchResult = await fetch_job_page(url)
    if not fetched.ok:
        raise AppError(
            422, "fetch_failed",
            f"{fetched.message} Paste the job description to continue.",
            details=[{"field": "url", "message": fetched.message}],
        )
    if len(clean_whitespace(fetched.text)) < 120:
        raise AppError(
            422, "fetch_empty",
            "The page did not contain enough readable text. Paste the description manually.",
        )
    extracted = extract_job_from_text(fetched.text, url=fetched.final_url,
                                      title_hint=title_hint, company_hint=company_hint,
                                      page_title=fetched.title)
    extracted["provider"] = provider["provider"] if provider["provider"] != "generic" else "url"
    extracted["provider_job_id"] = provider["job_id"]
    extracted["fetcher"] = "html"
    return {
        "status": "extracted",
        "extracted": extracted,
        "fetcher": "html",
        "requires_manual_description": False,
        "message": "Page retrieved and parsed. Review the extracted details before saving.",
        "truncated": fetched.truncated,
        "redirects": fetched.redirects,
    }


def build_dedupe_hash(company: str, title: str, location: str, normalized_url: str,
                      provider: str = "", provider_job_id: str = "") -> str:
    import hashlib

    if provider in {"greenhouse", "lever"} and provider_job_id:
        key = f"{provider}:{provider_job_id}"
    elif normalized_url:
        key = normalized_url
    else:
        key = "|".join(
            " ".join(part.lower().split())
            for part in (company, title, location)
        )
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def normalize_extracted(extracted: dict, provider: str = "") -> dict:
    url = extracted.get("source_url", "")
    normalized_url = normalize_job_url(url) if url else ""
    company = (extracted.get("company") or "").strip()
    title = (extracted.get("title") or "").strip()
    dedupe = build_dedupe_hash(company, title, extracted.get("location", ""), normalized_url,
                               provider or extracted.get("provider", ""),
                               extracted.get("provider_job_id", ""))
    extracted["url_normalized"] = normalized_url
    extracted["dedupe_hash"] = dedupe
    return extracted
