# Job sources

CareerPilot imports job listings through three channels. All of them store data as untrusted
text: listing content is never executed, and instructions found inside a posting are treated as
data by both the matcher and the AI prompts.

| Channel | Requires | Notes |
| --- | --- | --- |
| Manual entry | nothing | Paste a title, company and description. The same parsing and scoring pipeline runs as for imported listings. |
| URL import | a public `http(s)` job page | SSRF-safe fetch with DNS resolution checks, redirect re-validation, size and time caps. |
| Greenhouse boards | a company's public board token | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| Lever boards | a company's public board token | `https://api.lever.co/v0/postings/{token}?mode=json` |

There is **no LinkedIn, Indeed or other authenticated-source integration**, and no general web
search provider. Paid or login-walled sources are not scraped. This is a deliberate limitation,
not an unfinished adapter: scraping those services violates their terms and breaks frequently.

## Adding a board

**Discover → Job sources → Add source**, or:

```http
POST /api/v1/jobs/sources
{"provider": "greenhouse", "board_token": "acme", "company_name": "Acme"}
```

The board token is the slug in the public careers URL:

- `boards.greenhouse.io/acme` → `acme`
- `jobs.lever.co/acme` → `acme`

Tokens are validated as URL-safe slugs; values containing `/`, `..` or whitespace are rejected.
Sources can be disabled or deleted, and discovery never runs against a disabled source.

Then either import a single posting by its URL, or run discovery:

```http
POST /api/v1/jobs/discover
{"keywords": "backend python", "max_results": 50, "posted_within_days": 30}
```

Discovery is a background task. The response returns `{task_id, status: "queued"}` and does **not**
claim to have found anything. Results appear as the worker creates them; the task result reports
`found`, `created`, `duplicates` and `scored`. Board failures are recorded per source with the
provider's error message.

## How listings are normalised

1. Fetch with `CareerPilotAI/1.0` user agent (configurable via `CP_JOB_DISCOVERY_USER_AGENT`),
   12-second timeout and 2 MB cap.
2. HTML is converted to text; whitespace and control characters are cleaned.
3. Title, company, location, employment type, work arrangement, salary range, seniority and
   skills are extracted with deterministic heuristics and returned with confidence values.
4. Missing fields stay empty. The importer never guesses a salary or a location; a listing with no
   stated salary simply scores that category `null`.
5. Each listing is deduplicated per user by provider + provider job id, then by a normalised
   content fingerprint (title, company, location, description).
6. The listing is scored immediately unless scoring is disabled, and appears in Discover with its
   breakdown.

## Freshness and re-validation

Every listing stores `first_seen_at`, `last_verified_at` and `listing_status`
(`active`, `unavailable`, `not_recently_verified`). Re-validation is a queued task that re-fetches
listings and marks ones that no longer resolve as `unavailable`, leaving the rest
`not_recently_verified` until they are checked. The UI labels listings that have not been recently
verified instead of implying they are still open.

## SSRF and safety rules

Before any outbound request the URL must:

- use `http` or `https`, with no embedded credentials;
- use port 80 or 443;
- resolve only to public addresses — loopback, private, link-local, reserved, multicast, CGNAT and
  cloud metadata addresses are rejected;
- avoid blocked hostnames and suffixes (`localhost`, `.local`, `.internal`, `metadata.google.internal`);
- remain valid after every redirect hop (redirects are followed manually and capped).

Responses are capped in bytes and time, and non-HTML content is rejected. These rules are covered
by tests that attempt `127.0.0.1`, `169.254.169.254`, `file://`, `localhost` and private-host
listing URLs.

Operator escape hatch for local development only:

```dotenv
CP_JOB_FETCH_ALLOW_PRIVATE_HOSTS=true
```

Never enable it on a public deployment.

## Scheduled searches

Saved searches store filters (keywords, locations, arrangements, employment types, experience
levels, technologies, salary floor, provider list, minimum match score) and an optional daily or
weekly schedule. A scheduled search enqueues the same discovery task, records `last_run_at`, `last_result_count`
and `last_error`, and creates an in-app notification when it is enabled and new listings were
created. It does not send email digests; no mailer is configured by default. Filters are validated on write, so a
search cannot be saved with an impossible arrangement that would silently return nothing.

## Adding a new source adapter

1. Create `app/jobs/<provider>.py` implementing the adapter interface used by Greenhouse and
   Lever: `fetch_board(token)` / `fetch_listing(url)` returning normalised listing dictionaries.
2. Register it in `app/jobs/registry.py` and in the provider metadata exposed by `/api/v1/jobs/providers`
   and `/api/v1/meta`.
3. Enforce the same SSRF rules if the adapter performs HTTP requests; degrade gracefully on rate
   limits (back off, report the error, do not create partial listings).
4. Add fixture-based tests for the provider's JSON shape and an integration test for the failure
   path.
5. Document the endpoint, auth model, rate limits and licence/terms constraints in this file.

Only public, documented APIs are acceptable. Do not add adapters that require scraping
authenticated pages or bypass a site's terms of service.
