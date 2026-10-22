# CareerPilot AI

Multi-user AI career-management application: job discovery, explainable matching, a
review-gated application studio (CV / cover letter), interview practice, an application
tracker, career insights and privacy controls.

Brand accent: neon green `#39FF14`. Light and dark themes, no purple anywhere.

> **Status — read this first.** This repository is a working implementation under active
> completion, not a shipped product. Sections below state exactly what has been exercised
> and what has not. No deployment has been performed, no hosting is configured, and no
> statistics, testimonials or job inventories are fabricated by the application.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, TanStack Query, Recharts, Lucide, React Hook Form + Zod (public/auth forms) |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, pytest, httpx |
| Database | PostgreSQL in production (SQLite supported for local development) |
| Documents | `python-docx` (DOCX), ReportLab (PDF), plain text |
| Auth | Server-side sessions, httpOnly cookie, double-submit CSRF token, Argon2id password hashing |
| Background work | Database-backed task queue + worker process (no Redis requirement) |
| AI | Bring-your-own-provider: any OpenAI-compatible endpoint or local Ollama. Fully optional. |

---

## Repository layout

```
backend/
  app/
    main.py            FastAPI app factory, lifespan, health checks
    core/              config, errors, security, rate limiting, SSRF-safe fetching, logging
    database/          engine/session, Base, UTCTime columns
    models/            41 SQLAlchemy tables
    schemas/           Pydantic request/response models
    api/routes/        auth, onboarding, profile, jobs, documents, applications,
                       interviews, ai settings, workspace/system
    services/          business logic (matching, tracker, insights, privacy, notifications)
    documents/         CV content model, reviewer, DOCX/PDF/TXT renderers, CV extraction
    jobs/              Greenhouse + Lever adapters, SSRF-safe URL import, registry
    ai/                provider adapters (OpenAI-compatible, Ollama), usage accounting
    tasks/             queue, worker loop, handlers
  tests/               pytest (suite in progress — see Status)
apps/web/
  src/app/             public marketing + auth routes, authenticated app routes, onboarding
  src/components/      app shell, UI kit, cards, onboarding editors
  src/lib/             API client, shared types, formatting helpers
```

---

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" "sqlalchemy>=2.0" "pydantic>=2" pydantic-settings \
    alembic "psycopg[binary]" python-docx reportlab pypdf httpx argon2-cffi cryptography \
    email-validator python-multipart jinja2 pytest pytest-asyncio

export CP_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
export CP_DATABASE_URL="postgresql+psycopg://user:pass@localhost:5432/careerpilot"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Without `CP_DATABASE_URL` the backend uses `sqlite:///./careerpilot.db`, which is convenient
for local evaluation but is not the intended production store.

API documentation is served at `/api/v1/docs` and the OpenAPI schema at
`/api/v1/openapi.json` (both are disabled in production unless `CP_DEBUG=true`).

Run a standalone worker (recommended when `CP_ENABLE_INLINE_WORKER=false`):

```bash
cd backend && python -m app.worker
```

### Frontend

```bash
cd apps/web
npm install
CP_BACKEND_URL=http://127.0.0.1:8000 npm run dev   # http://localhost:3000
```

`next.config.ts` proxies `/api/:path*` to `CP_BACKEND_URL` so the browser only ever talks to
the Next.js origin; the session cookie stays first-party.

---

## Configuration

Settings are environment variables with the `CP_` prefix (see `backend/app/core/config.py`).

| Variable | Default | Notes |
| --- | --- | --- |
| `CP_SECRET_KEY` | insecure dev value | **Must** be replaced in any real deployment. Signs sessions and encrypts AI keys. |
| `CP_AI_ENCRYPTION_KEY` | falls back to secret | Optional separate key for provider credential encryption. |
| `CP_APP_ENV` | `development` | `production` enables secure cookies and hides dev tokens. |
| `CP_DATABASE_URL` | `sqlite:///./careerpilot.db` | Use a PostgreSQL URL in production. |
| `CP_AUTO_CREATE_SCHEMA` | `true` | Development convenience; production should run migrations. |
| `CP_FRONTEND_ORIGIN` | `http://localhost:3000` | Used in verification/reset links and CORS. |
| `CP_ALLOWED_HOSTS` | `localhost,127.0.0.1,testserver` | Comma-separated host allowlist. |
| `CP_ENABLE_INLINE_WORKER` | `true` | Runs the queue worker inside the API process (single-process convenience). |
| `CP_MEDIA_ROOT` | `backend/media` | Private storage for uploads and exports. |
| `CP_MAX_UPLOAD_MB` | `10` | CV upload limit. |
| `CP_AI_ALLOW_PRIVATE_ENDPOINTS` | `false` | Required only for loopback/LAN AI endpoints such as Ollama on localhost. |
| `CP_SMTP_HOST` / `CP_SMTP_PORT` / `CP_SMTP_USER` / `CP_SMTP_PASSWORD` | unset | When unset, verification/reset links are returned to the UI in development and the app never claims an email was sent. |
| `CP_RATE_LIMIT_ENABLED` | `true` | In-process rate limiting. |
| `CP_AI_PRICING_JSON` | `{}` | Optional model pricing table; without it the UI states that cost estimates are unavailable. |

Frontend: `CP_BACKEND_URL` (server-side only, used by the rewrite proxy).

---

## What is implemented

**Accounts & security**
- Email + password registration, sign-in, sign-out, password reset, email verification flow.
- Argon2id hashing, server-side sessions (24-byte tokens, hashed at rest), httpOnly cookie,
  double-submit CSRF header on all mutations, per-route rate limits.
- Every query is scoped to the authenticated user; cross-user IDs return 404, not data.
- Sessions list/revoke, password change (revokes other sessions), account deletion with
  password + typed `DELETE` confirmation.

**Onboarding (11 steps)**
- Resumable draft persisted per step, CV import (PDF/DOCX) with extraction review, explicit
  provenance (`user_confirmed`, `document_extracted`, …) and a verification flag per record.
- Imported items are never silently marked verified, and the completion call deduplicates.

**Career profile**
- Profile, preferences and writing style; experience, education, skills, projects,
  certifications and achievements with add/edit/delete/verify.

**Jobs**
- Manual entry, SSRF-safe URL import, public Greenhouse and Lever board adapters, saved
  searches, optional scheduled discovery, freshness re-validation.
- Deterministic, explainable scoring (skills 30, experience 18, location 12, education 8,
  projects 8, employment type 5, salary 5, certifications 4, industry 3) with per-category
  rationale, matched/missing skills and bands at 80/60/40. No AI required.

**Application Studio**
- Strategy approval gate → drafter → independent reviewer → revision loop → approval →
  PDF/DOCX/TXT export with file validation.
- Critical factual findings block approval; warnings require explicit acknowledgement.
- Master CV with eight distinct templates, versioned edits (never silently overwritten),
  restore-as-new-version and downloads.

**Interview coach**
- Mock sessions with job-aware question generation, deterministic rubric scoring, optional AI
  feedback, follow-up prompts, notes and session summaries.

**Tracker & insights**
- Kanban/table/calendar views, status history, reminders, stats and response-rate calculation
  from real records only.
- Insights cite evidence, sample size, calculation method and confidence.

**AI provider settings**
- OpenAI-compatible and Ollama adapters, encrypted API keys (never returned to the client),
  connection tests, model listing, per-task model overrides, token accounting, monthly limits,
  and an explicit disclosure that must be accepted before activation.

**Platform**
- Versioned `/api/v1` with OpenAPI, health/readiness endpoints, database-backed background
  tasks with real status and retry/cancel, in-app notifications, JSON data export.

## What is not done yet

These are known gaps; do not treat them as delivered:

- **Alembic migration is empty.** The schema is currently created with
  `Base.metadata.create_all` when `CP_AUTO_CREATE_SCHEMA=true`. A reviewable initial revision
  still needs to be generated and verified on an empty PostgreSQL database.
- **No pytest suite.** `backend/tests/` contains only the package marker. Verification so far
  was done with scripted end-to-end smoke runs (SQLite and an embedded PostgreSQL instance).
- **`next build` has not been run.** The frontend typechecks (`tsc --noEmit`) but a production
  build and a full browser walkthrough against the live API are still pending.
- **Some backend paths are untested end to end:** application creation with a CV document id,
  `POST /applications/{id}/status`, AI provider activation with a public endpoint, task
  retry/cancel, `/search`, `/meta`, and the onboarding completion payload with education
  `is_current`.
- **Host allowlist is permissive** (`TrustedHostMiddleware` currently accepts `*` in addition to
  the configured list) and must be tightened before any real deployment.
- **Transactional email is unconfigured.** Without SMTP, verification and reset links are only
  surfaced in development.
- README `DEPLOYMENT.md` and `docs/{ARCHITECTURE,SECURITY,AI_PROVIDERS,JOB_SOURCES}` are still
  to be written.
- No production login is provided in this repository; create an account through the sign-up page.

---

## Product rules enforced in code

1. No fabricated qualifications, employers, metrics or job listings; AI output is checked
   against verified profile evidence before it enters a document.
2. The master CV is never overwritten without creating a new version.
3. Documents with unresolved critical findings cannot be approved.
4. CareerPilot never submits an application; the tracker records what you did elsewhere.
5. API keys are encrypted at rest and never returned by the API.
6. Nothing is sent to an AI provider until you configure one and start an AI action.

## License

No license has been chosen for this repository yet.
