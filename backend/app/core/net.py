"""SSRF-safe outbound HTTP for user-supplied job URLs.

Every hop (including redirects) is validated: scheme, hostname, port and every
resolved IP address. Private, loopback, link-local, reserved and multicast
destinations are rejected, as are cloud metadata endpoints and internal names.
Responses are size-limited, time-limited and parsed as untrusted text.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from dataclasses import dataclass, field
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.core.config import get_settings
from app.core.errors import ValidationAppError

logger = logging.getLogger("careerpilot.net")

BLOCKED_HOSTNAMES = {
    "localhost", "localhost.localdomain", "metadata", "metadata.google.internal",
    "instance-data", "169.254.169.254", "fd00:ec2::254",
}
BLOCKED_SUFFIXES = (".local", ".internal", ".localdomain", ".home.arpa", ".lan", ".intranet")
ALLOWED_PORTS = {80, 443}
ALLOWED_CONTENT_TYPES = ("text/html", "application/xhtml", "text/plain")
TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "gclid", "fbclid", "mc_cid", "mc_eid", "ref", "referrer", "source", "gh_src",
}


@dataclass
class FetchResult:
    ok: bool
    status_code: int
    final_url: str
    text: str = ""
    title: str = ""
    content_type: str = ""
    message: str = ""
    truncated: bool = False
    redirects: list[str] = field(default_factory=list)


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return bool(
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
        or ip.is_reserved or ip.is_unspecified
        or str(ip) in {"169.254.169.254", "100.100.100.200", "192.0.0.192"}
        or (isinstance(ip, ipaddress.IPv4Address) and ip in ipaddress.ip_network("100.64.0.0/10"))
    )


def validate_public_url(raw: str) -> str:
    """Validate scheme/host/port and return a normalized absolute URL string.

    DNS is resolved separately (async) by :func:`validate_url_async` so this can
    be used in synchronous validation contexts.
    """
    raw = (raw or "").strip()
    if not raw:
        raise ValidationAppError("Enter a job posting URL.")
    if len(raw) > 2000:
        raise ValidationAppError("That URL is too long.")
    try:
        parts = urlsplit(raw)
    except ValueError as exc:
        raise ValidationAppError("That URL could not be parsed.") from exc
    if parts.scheme.lower() not in {"http", "https"}:
        raise ValidationAppError("Only http and https URLs are supported.")
    if parts.username or parts.password:
        raise ValidationAppError("URLs with embedded credentials are not allowed.")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise ValidationAppError("The URL is missing a hostname.")
    try:
        port = parts.port
    except ValueError as exc:
        raise ValidationAppError("The URL contains an invalid port.") from exc
    if port is not None and port not in ALLOWED_PORTS:
        raise ValidationAppError("Only standard web ports (80/443) are supported.")
    if host in BLOCKED_HOSTNAMES or host.endswith(BLOCKED_SUFFIXES):
        raise ValidationAppError("That host is not a public job source.")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and _is_blocked_ip(ip) and not get_settings().job_fetch_allow_private_hosts:
        raise ValidationAppError("That address is not a public internet destination.")

    # Strip fragments and credentials; keep the path/query intact.
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path or "/", parts.query, ""))


async def _resolve(host: str) -> list[ipaddress._BaseAddress]:
    loop = asyncio.get_running_loop()
    try:
        infos = await asyncio.wait_for(
            loop.run_in_executor(None, socket.getaddrinfo, host, None, 0, socket.SOCK_STREAM), timeout=5
        )
    except (socket.gaierror, asyncio.TimeoutError) as exc:
        raise ValidationAppError("That host could not be resolved.") from exc
    addresses: list[ipaddress._BaseAddress] = []
    for info in infos:
        try:
            addresses.append(ipaddress.ip_address(info[4][0]))
        except ValueError:
            continue
    if not addresses:
        raise ValidationAppError("That host could not be resolved.")
    return addresses


async def validate_url_async(raw: str) -> str:
    url = validate_public_url(raw)
    host = urlsplit(url).hostname or ""
    try:
        ip = ipaddress.ip_address(host)
        addresses = [ip]
    except ValueError:
        addresses = await _resolve(host)
    allow_private = get_settings().job_fetch_allow_private_hosts
    for address in addresses:
        if _is_blocked_ip(address) and not allow_private:
            raise ValidationAppError(
                "That URL points to a private or internal address, which is blocked for security reasons."
            )
    return url


def normalize_job_url(raw: str) -> str:
    """Canonical form used for duplicate detection (best-effort, never fatal)."""
    try:
        parts = urlsplit(raw.strip())
    except ValueError:
        return raw.strip().lower()[:2000]
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parts.path.rstrip("/") or "/"
    query_pairs = []
    for chunk in parts.query.split("&"):
        if not chunk:
            continue
        key = chunk.split("=", 1)[0]
        if key.lower() in TRACKING_PARAMS:
            continue
        query_pairs.append(chunk)
    query = "&".join(sorted(query_pairs))
    return urlunsplit((parts.scheme.lower(), host, path, query, ""))[:2000]


def normalize_company(value: str) -> str:
    return " ".join(value.lower().replace("&", "and").split())


def html_to_text(html: str, limit: int = 60_000) -> tuple[str, str]:
    """Extract readable text and <title> from untrusted HTML without executing anything."""
    from html.parser import HTMLParser

    class Extractor(HTMLParser):
        def __init__(self) -> None:
            super().__init__(convert_charrefs=True)
            self.parts: list[str] = []
            self.title_parts: list[str] = []
            self.skip_depth = 0
            self.in_title = False
            self.in_body_hint = False

        def handle_starttag(self, tag, attrs):
            if tag in {"script", "style", "noscript", "svg", "iframe", "object", "template"}:
                self.skip_depth += 1
            elif tag == "title":
                self.in_title = True
            elif tag in {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "section"}:
                self.parts.append("\n")
            elif tag in {"td", "th"}:
                self.parts.append(" ")

        def handle_endtag(self, tag):
            if tag in {"script", "style", "noscript", "svg", "iframe", "object", "template"}:
                self.skip_depth = max(0, self.skip_depth - 1)
            elif tag == "title":
                self.in_title = False
            elif tag in {"p", "div", "li", "tr", "h1", "h2", "h3", "h4"}:
                self.parts.append("\n")

        def handle_data(self, data):
            if self.skip_depth:
                return
            if self.in_title:
                self.title_parts.append(data)
                return
            if data.strip():
                self.parts.append(data)

    parser = Extractor()
    try:
        parser.feed(html[:4_000_000])
    except Exception:  # malformed HTML must never break analysis
        logger.debug("HTML parse warning; using partial output")
    text = "".join(parser.parts)
    lines = [" ".join(line.split()) for line in text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    while "\n\n\n" in cleaned:
        cleaned = cleaned.replace("\n\n\n", "\n\n")
    title = " ".join("".join(parser.title_parts).split())
    return cleaned[:limit], title[:300]


async def fetch_job_page(url: str) -> FetchResult:
    settings = get_settings()
    current = await validate_url_async(url)
    redirects: list[str] = []
    headers = {
        "User-Agent": settings.job_discovery_user_agent,
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
        "Accept-Language": "en",
    }
    timeout = httpx.Timeout(settings.job_fetch_timeout_seconds, connect=6.0)

    async with httpx.AsyncClient(
        follow_redirects=False, timeout=timeout, headers=headers,
        limits=httpx.Limits(max_connections=4, max_keepalive_connections=2),
    ) as client:
        for _hop in range(4):
            try:
                async with client.stream("GET", current) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location", "")
                        if not location:
                            return FetchResult(False, response.status_code, current,
                                               message="The page redirected without a destination.")
                        from urllib.parse import urljoin

                        next_url = urljoin(current, location)
                        current = await validate_url_async(next_url)
                        redirects.append(current)
                        continue
                    if response.status_code >= 400:
                        return FetchResult(
                            False, response.status_code, current,
                            message=f"The page returned HTTP {response.status_code}. Paste the description manually.",
                            redirects=redirects,
                        )
                    content_type = response.headers.get("content-type", "").lower()
                    if not any(ct in content_type for ct in ALLOWED_CONTENT_TYPES):
                        return FetchResult(
                            False, response.status_code, current, content_type=content_type,
                            message="That page is not an HTML or text document. Paste the description manually.",
                            redirects=redirects,
                        )
                    chunks: list[bytes] = []
                    size = 0
                    truncated = False
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > settings.job_fetch_max_bytes:
                            truncated = True
                            break
                        chunks.append(chunk)
                    raw = b"".join(chunks)
                    encoding = response.encoding or "utf-8"
                    try:
                        html = raw.decode(encoding, errors="replace")
                    except LookupError:
                        html = raw.decode("utf-8", errors="replace")
                    text, title = html_to_text(html)
                    return FetchResult(
                        True, response.status_code, current, text=text, title=title,
                        content_type=content_type, truncated=truncated, redirects=redirects,
                    )
            except httpx.TimeoutException:
                return FetchResult(False, 0, current, message="The page took too long to respond.",
                                   redirects=redirects)
            except httpx.HTTPError:
                return FetchResult(False, 0, current, message="The page could not be reached.",
                                   redirects=redirects)
            except ValidationAppError:
                raise
        return FetchResult(False, 0, current, message="Too many redirects.", redirects=redirects)
