# Architecture

CareerPilot AI is a two-tier application: a Next.js App Router frontend and a FastAPI backend
with PostgreSQL as the authoritative store. Background work runs through a database-backed
queue so the system needs no additional broker.

```
┌─────────────────────────┐        /api/* rewrite        ┌──────────────────────────┐
│ Next.js (App Router)    │ ───────────────────────────▶ │ FastAPI /api/v1          │
│ Server Components +     │                              │ routes → services        │
│ TanStack Query client   │ ◀─────────────────────────── │ schemas → SQLAlchemy     │
└─────────────────────────┘        JSON + cookies        └───────────┬──────────────┘
                                                                     │
                        ┌────────────────────────────────┬───────────┴────────────┐
                        ▼                                ▼                        ▼
                PostgreSQL (41 tables)          media volume (uploads,      AI providers
                sessions, jobs, documents,       exports)                    (user-configured)
                tasks, usage, notifications
                        ▲
                        │ claim / heartbeat / results
                ┌───────┴────────┐
                │ worker process │  document_generate, document_review,
                └────────────────┘  document_revision, job_discovery,
                                    interview_prepare, scheduled_search,
                                    revalidate_jobs, reminders
```

## Request path

1. The browser calls `/api/v1/...` on the Next.js origin.
2. A Next.js runtime Route Handler forwards `/api/v1/*` to `CP_BACKEND_URL`, so cookies stay
   first-party and the backend is not exposed to the browser. On Vercel, a caller-side service
   binding injects that URL into `web`; the backend has no public rewrite.
3. FastAPI middleware order: request ID/logging → host allowlist → CORS → origin+size checks →
   rate limiting → router.
4. Routes depend on `CurrentUser` (session resolution) and `DbSession`. Every query filters by
   `user_id`; ownership helpers raise 404 rather than 403 so another user's IDs reveal nothing.
5. Mutations additionally require the `X-CSRF-Token` header matching the `cp_csrf` cookie and a
   session bound to the request.

## Backend modules

| Path | Responsibility |
| --- | --- |
| `app/main.py` | App factory, lifespan (schema bootstrap in dev, inline worker), health checks, router registration under `/api/v1`, error handlers, docs URLs. |
| `app/core/` | Settings, error envelope, password/session/CSRF/crypto helpers, rate limiter, SSRF-safe URL validation and fetching, text utilities, structured logging, middleware. |
| `app/database/` | Engine/session factory, `Base`, `UTCDateTime` (timezone-aware on read for every backend), `JSONType` (JSONB on PostgreSQL). |
| `app/models/` | 41 tables grouped by domain: user/security, profile, jobs, documents, applications, system. |
| `app/schemas/` | Pydantic request/response models. Request bases reject unknown fields, so a renamed field fails loudly instead of being ignored. |
| `app/api/routes/` | HTTP surface: `auth`, `onboarding`, `profile`, `jobs`, `documents`, `applications`, `interviews`, `ai`, `system`. |
| `app/services/` | Domain logic: auth, profile snapshot, matching, job import/discovery, applications, interviews, insights, privacy, notifications, storage, email. |
| `app/documents/` | Content model, template designs, reviewer, renderers, extraction. |
| `app/ai/` | Provider adapters, configuration encryption, usage accounting, structured output validation. |
| `app/tasks/` | Queue (claim/retry/cancel), handlers, worker loop, reminder scheduler. |
| `app/jobs/` | Greenhouse and Lever adapters plus the provider registry. |

## Data model

41 tables, all with `user_id` except global reference data:

- **Accounts and security** — `users`, `user_sessions`, `security_tokens`, `worker_heartbeats`.
- **Career profile** — `user_profiles`, `work_experiences`, `education_records`, `skills`,
  `projects`, `certifications`, `achievements`, `career_preferences`,
  `writing_style_profiles`, `onboarding_drafts`, `profile_corrections`, `uploaded_files`.
- **Jobs** — `job_listings`, `job_sources`, `job_imports`, `job_matches`, `job_searches`.
- **Documents** — `master_cvs`, `cv_versions`, `documents`, `document_versions`,
  `document_reviews`, `document_files`.
- **Applications** — `applications`, `application_events`, `application_strategies`,
  `reminders`, `interview_sessions`, `interview_questions`, `interview_answers`,
  `interview_notes`.
- **System** — `background_tasks`, `notifications`, `ai_provider_configurations`,
  `ai_usage_records`, `insight_dismissals`, `user_feedback`.

Provenance and verification are first-class columns on profile records:
`provenance ∈ {user_confirmed, imported_unconfirmed, document_extracted, ai_suggested,
unverified, outdated}` and a `verified` flag. Documents are built only from verified records.

### History is append-only where it matters

- `document_versions` holds every edit; approval and export act on the current version only.
- `cv_versions` holds master CV edits; restore creates a new version rather than rolling back.
- `application_events` records each status change with timestamps, powering the tracker and
  stats without recomputation from wishful data.

## Core flows

### CV import (PDF/DOCX)

1. Upload is size- and type-checked, stored under `media/`, and recorded as `uploaded_files`.
2. Text is extracted (pypdf / python-docx), heuristically sectioned, and returned for review with
   `requires_review=true` and per-field confidence.
3. Nothing reaches the profile until the user confirms; imported records then carry
   `imported_unconfirmed` until explicitly verified.

### Job import

- Manual form or URL. URL fetching resolves DNS, rejects loopback/private/link-local/metadata
  addresses, caps redirects, size and time, then parses the page. Listing text is treated as
  untrusted data everywhere downstream.
- Greenhouse and Lever adapters read public board APIs; no scraping behind authentication.
- Imports are idempotent per user + provider + provider job id, with a content fingerprint.

### Matching (no AI required)

Skill, experience, education, certification, project, location, employment type, salary and
industry categories are scored independently with weights 30/18/8/4/8/12/5/5/3. Each category
returns a score or `null` with a written rationale. A weighted average treats unscored
categories as neutral (50) and shrinks the result toward neutral when evidence coverage is below
60%, so a thin profile cannot present itself as an excellent match. With no scorable category
the result is `insufficient_data` and the UI shows no number. Optional AI may add an explanation
but never changes the deterministic scores.

### Application Studio

```
strategy (user-approved) ──▶ draft (deterministic or AI, grounded) ──▶ review (rules + optional AI)
        ▲                                                                    │
        │                                                               findings
   user edits ◀── new version ◀── revision ◀──────────────────────────────┘
        │
        └──▶ approval (blocked by critical findings) ──▶ export PDF/DOCX/TXT ──▶ validated files
```

- Generation refuses to start without an approved strategy, and refuses AI without a configured
  provider plus an accepted disclosure.
- Review findings have severity `critical | warning | info`. Critical findings block approval;
  warnings require the acknowledgement checkbox.
- Exports are generated, validated (PDF header/page parse, DOCX zip/wordpart), stored, and
  downloadable through authenticated routes with short-lived signed links.

### Background tasks

`background_tasks` stores type, payload, status, progress, attempts and result. The worker
claims rows atomically (row lock + status transition), writes heartbeats, and updates progress
only at real milestones. Cancellation is cooperative and checked between steps. Retry creates a
new task with the same payload. The UI polls task state and shows queued/running/failed
truthfully; no percentage is invented.

## Frontend structure

- `src/app/(marketing)` — landing, features, how it works, pricing, privacy, terms, contact.
- `src/app/(auth)` — sign up, sign in, forgot password, reset password.
- `src/app/onboarding` — an 11-step wizard backed by the resumable draft endpoint.
- `src/app/(app)` — dashboard, profile, discover, job detail, studio, master CV, documents,
  interview coach, tracker, insights, settings, AI settings, privacy.
- `src/components` — app shell (responsive sidebar + top bar), UI kit (button, input, card, tabs,
  dialog, toast, badge), feature components (match score, job card, document card).
- `src/lib` — typed API client with CSRF handling, shared types mirroring the API contract,
  formatting helpers.

Themes are set by a blocking script that reads the `cp_theme` cookie before paint, so there is no
flash; the toggle cycles light → dark → system and persists the choice. Status is always conveyed
with text as well as colour, and motion respects `prefers-reduced-motion`.

## Deliberate trade-offs

- **Database queue over Redis** — one less service to deploy and back up; adequate at this scale.
  Long-running work is never executed inside a request unless `CP_ENABLE_INLINE_WORKER=true`.
- **Server-side sessions over JWT** — immediate revocation and no token in JavaScript.
- **Deterministic-first documents** — the product is fully usable with no AI provider, and AI
  failures degrade to labelled deterministic output rather than fabricated content.
- **In-process rate limiting** — simple and dependency-free; replace with a shared limiter at the
  proxy if you run many API processes and need global limits.
