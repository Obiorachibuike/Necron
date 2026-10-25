# CareerPilot AI

Multi-user AI career-management application: job discovery, explainable matching, a
review-gated application studio (CV / cover letter), interview practice, an application
tracker, career insights and privacy controls.

It ships as a **web app** and as **CareerPilot Desktop** — a native Electron shell for
Windows, macOS and Linux that opens the same workspace with a tray, native notifications,
menu shortcuts, deep links, document downloads and update checks. The marketing site at
`apps/web` includes a download page whose buttons resolve real GitHub Release assets.

Brand accent: neon green `#39FF14`. Light, dark and system themes. No purple anywhere.

> **Status — read this first.** This is a working, tested implementation running locally, not
> a deployed product. No hosting has been configured and no deployment has been performed.
> Desktop installers are built by CI but are **unsigned and unnotarized**, and they are not
> hosted first-party. Everything claimed below was executed in this repository; the "Known
> gaps" section lists what was not. The application never fabricates statistics, testimonials,
> job inventories or progress percentages.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, TanStack Query, Recharts, Lucide, React Hook Form + Zod |
| Desktop | Electron 38, electron-updater, electron-builder (NSIS, DMG/ZIP, AppImage/deb), Node test runner |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, pytest, httpx |
| Database | PostgreSQL (authoritative store); SQLite supported for local development and tests |
| Documents | `python-docx` (DOCX), ReportLab (PDF), plain text, LaTeX source |
| Auth | Server-side sessions, httpOnly cookie, double-submit CSRF token, Argon2id hashing |
| Background work | Database-backed task queue and worker process (no Redis required) |
| AI | Bring-your-own-provider: OpenAI-compatible endpoints or local Ollama. Entirely optional. |

---

## Repository layout

```
backend/
  app/
    main.py            FastAPI app factory, lifespan, health checks
    core/              config, errors, security, rate limiting, SSRF-safe fetching, logging
    database/          engine/session, Base, UTC timestamp type
    models/            41 SQLAlchemy tables
    schemas/           Pydantic request/response models
    api/routes/        auth, onboarding, profile, jobs, documents, applications,
                       interviews, ai settings, workspace/system
    services/          business logic (matching, tracker, insights, privacy, notifications)
    documents/         content model, template designs, reviewer, renderers, CV extraction
    jobs/              Greenhouse + Lever adapters, SSRF-safe URL import, registry
    ai/                provider adapters (OpenAI-compatible, Ollama), usage accounting
    tasks/             queue, worker loop, handlers
  migrations/          Alembic environment + initial revision (0001_initial)
  tests/               pytest: unit + integration (174 tests)
apps/web/
  src/app/             marketing site (including /download), auth, app routes, onboarding
  src/app/download/    redirect route that resolves the current GitHub Release asset
  src/components/      app shell, UI kit, cards, download buttons, match score
  src/lib/             API client, shared types, desktop release metadata
  src/test/            Vitest setup
apps/desktop/
  src/main.cjs         Electron main process: windows, tray, menus, IPC, updates, downloads
  src/preload.cjs      fixed contextBridge API for the shell's local windows
  src/lib/             tested URL, settings, file and notification helpers
  src/renderer/        connect-workspace, desktop settings, offline and loading pages
  build/               generated app/tray icons and macOS entitlements
  test/                node:test suites (48 tests, incl. main-process smoke test)
docs/                  ARCHITECTURE, SECURITY, AI_PROVIDERS, JOB_SOURCES, WEBSITE_DEPLOYMENT
DEPLOYMENT.md          backend/web deployment instructions (nothing has been deployed)
```

---

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt          # runtime + pytest + embedded Postgres helper

cp .env.example .env                          # then edit the two required secrets
export CP_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
export CP_AI_ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())')"

# PostgreSQL (authoritative). Without this the backend falls back to SQLite for evaluation.
export CP_DATABASE_URL="postgresql+psycopg://careerpilot:careerpilot@localhost:5432/careerpilot"
alembic upgrade head

uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run the background worker in a second shell when `CP_ENABLE_INLINE_WORKER=false`:

```bash
cd backend && python -m app.worker
```

API docs: `/api/v1/docs`, schema: `/api/v1/openapi.json` (empty in production unless
`CP_DEBUG=true`). Health: `/api/v1/health`, readiness: `/api/v1/health/ready`.

### Frontend

```bash
cd apps/web
npm install
CP_BACKEND_URL=http://127.0.0.1:8000 npm run dev   # http://localhost:3000
```

`next.config.ts` proxies `/api/:path*` to `CP_BACKEND_URL`, so the browser only talks to the
Next.js origin and the session cookie stays first-party.

### Desktop app

```bash
cd apps/desktop
npm install
npm test                      # 48 tests, no display required
npm start                     # opens the connect-workspace window
# connect http://localhost:3000 after the web and backend processes are running
```

Packaging:

```bash
npm run dist:linux            # AppImage + deb
npm run dist:win              # NSIS installer + portable exe
npm run dist:mac              # DMG + ZIP (Apple silicon and Intel)
```

The shell is a client only: it requires a workspace URL and cannot run the backend itself.
See [`apps/desktop/README.md`](apps/desktop/README.md) for the security model, deep links,
update behaviour, signing steps and exact artifact names.

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest        # 174 passed (unit + integration)
cd apps/web && npm test                        # 25 passed (Vitest + Testing Library)
cd apps/web && npm run typecheck && npm run build
cd apps/desktop && npm test                    # 48 passed (node:test)
```

What the suites cover:

- **Unit** — password/session/CSRF helpers and URL/company normalisation; matching maths
  (including thin-profile confidence shrinkage and the "insufficient data" path); all eight
  template renderers (PDF/DOCX/TXT, validation, unicode); reviewer rules and approval blockers.
- **Integration** — registration/login/logout/password change/session revocation, CSRF
  enforcement, cross-user isolation, onboarding draft/import/complete, profile CRUD and
  verification rules, job import (including SSRF rejection), matching, strategy approval gate,
  document generation → review → revision → approval → export, master CV history, tracker
  status transitions/reminders/calendar, interviews, insights, notifications, search, meta,
  AI configuration encryption and usage reporting, task cancel/retry, privacy export and
  account deletion.
- **PostgreSQL** — the initial migration was generated against an empty PostgreSQL 16.2
  database and verified with `upgrade head` (41/41 tables), a second no-op upgrade, and a
  `downgrade base` → `upgrade head` round trip.
- **Desktop** — URL/origin/allowlist rules, settings persistence and file permissions,
  download sanitisation, notification selection, structural isolation checks (sandbox,
  context isolation, no preload on the remote window, IPC sender validation, CSP on local
  pages) and a main-process smoke test that drives boot → health check → save workspace →
  main window with an Electron stub.
- **Not covered** — there is no browser-driven end-to-end suite (Playwright) because no
  browser runtime is installed in the development environment; the frontend is covered by
  component/unit tests plus a production build. Real Electron windows, tray rendering, OS
  notification delivery and installer execution are not exercised in CI. Live AI calls are
  not exercised: tests use an unreachable local endpoint to prove the app reports the
  failure honestly.

---

## Configuration

Settings are environment variables with the `CP_` prefix (see `backend/app/core/config.py` and
`backend/.env.example`).

| Variable | Default | Notes |
| --- | --- | --- |
| `CP_SECRET_KEY` | insecure dev value | **Must** be replaced. Signs sessions and CSRF tokens. |
| `CP_AI_ENCRYPTION_KEY` | falls back to secret | Encrypts provider credentials at rest. |
| `CP_APP_ENV` | `development` | `production` enables secure cookies and hides dev tokens. |
| `CP_DATABASE_URL` | `sqlite:///./careerpilot.db` | PostgreSQL URL in any real deployment. |
| `CP_AUTO_CREATE_SCHEMA` | `true` | Development convenience; production runs migrations. |
| `CP_FRONTEND_ORIGIN` | `http://localhost:3000` | Origin allowed to make mutating requests. |
| `CP_ALLOWED_HOSTS` | `localhost,127.0.0.1,testserver` | Host allowlist; `*` is refused in production. |
| `CP_ENABLE_INLINE_WORKER` | `true` | Worker inside the API process (single-process convenience). |
| `CP_MEDIA_ROOT` | `backend/media` | Private storage for uploads and exports. |
| `CP_AI_ALLOW_PRIVATE_ENDPOINTS` | `false` | Required for loopback/LAN AI endpoints such as local Ollama. |
| `CP_SMTP_*` | unset | Without SMTP the API reports `email_configured=false` and never claims an email was sent. |
| `CP_RATE_LIMIT_ENABLED` | `true` | In-process per-user/IP limits. |
| `CP_AI_PRICING_JSON` | `{}` | Optional price table; without it the UI shows tokens and no cost estimate. |

Frontend: `CP_BACKEND_URL` (server-side only, used by the rewrite proxy). The marketing
site's download route optionally reads `CP_GITHUB_TOKEN` to raise the GitHub API rate limit.

---

## What is implemented

**Accounts & security**
- Register, sign in/out, password reset, email verification flow, session list/revoke.
- Argon2id hashing, server-side sessions hashed at rest, httpOnly `SameSite=Lax` cookie,
  double-submit CSRF header on every mutation, per-route rate limits, strict host allowlist,
  origin check on mutations.
- Every query is scoped to the authenticated user; another user's IDs return 404.
- Password change revokes other sessions; account deletion requires the password and the typed
  word `DELETE`, then removes the account's rows and files.

**Onboarding (11 steps)**
- Resumable draft persisted per step (deep-merged, never clobbered by a stale tab), PDF/DOCX CV
  import with reviewable extraction, explicit provenance and a verification flag per record.
- Imported material is never auto-verified; completion deduplicates and marks imports applied.

**Career profile**
- Profile, preferences and writing style; experience, education, skills, projects,
  certifications and achievements with add/edit/delete/verify and input validation
  (including "expert skill requires evidence" and future-date rejection).

**Jobs**
- Manual entry, SSRF-safe URL import, public Greenhouse and Lever board adapters, saved
  searches with validation, optional scheduled discovery, freshness re-validation.
- Deterministic, explainable scoring (skills 30, experience 18, location 12, education 8,
  projects 8, employment type 5, salary 5, certifications 4, industry 3) with per-category
  rationale, matched/missing skills and bands at 80/60/40. No AI required.
- Categories with no evidence are shown as "not scored"; if nothing is measurable the match is
  labelled `insufficient_data` instead of a fake 0/100 or a flattering 100.

**Application Studio**
- Strategy approval gate → drafter → independent reviewer → revision loop → approval →
  PDF/DOCX/TXT export with file validation; regenerating versions the existing document rather
  than forking duplicates, and clears approval until it is reviewed again.
- Critical factual findings block approval; warnings require explicit acknowledgement.
- Master CV with eight genuinely distinct templates (section order, heading treatment,
  alignment, two-column or sidebar layout, skills grid), versioned edits, restore-as-new-version
  and validated downloads.
- AI drafting is opt-in per action. When no provider is configured the API refuses the AI
  request up front; if a configured provider is unreachable at run time the draft is labelled
  deterministic and the notice says why.

**Interview coach**
- Mock sessions with job-aware question generation, deterministic rubric scoring, optional AI
  feedback, follow-ups after an answer, notes and session summaries.

**Tracker & insights**
- Kanban/table/calendar views, status history, reminders, stats and response rates computed
  from real records only. One active application per job, with a 409 that links to the existing
  record.
- Insights cite evidence, sample size, calculation method and confidence; empty states say so.

**AI provider settings**
- OpenAI-compatible and Ollama adapters, encrypted API keys (never returned), connection tests,
  model listing, per-task model overrides, token accounting, daily/monthly limits, and an
  explicit disclosure that must be accepted before any provider call — enforced at the single
  network choke point, not just in the UI.

**Desktop shell** (`apps/desktop`)
- Native windows for Windows, macOS and Linux that load the real workspace — no second UI
  implementation to drift out of date.
- System tray with workspace routes, native notifications and an unread badge, per-user
  NSIS/DMG/AppImage/deb packaging, single-instance and `careerpilot://` deep links.
- Validated document downloads to the Downloads folder with collision-safe names; external
  origins open in the browser; camera/microphone/geolocation denied by default.
- Isolated persistent session partition, strict CSP on local shell pages, IPC limited to
  local frames, no telemetry, and background update checks from GitHub Releases.
- Signed-ready release workflow builds each platform natively and publishes checksums and
  `latest*.yml` update metadata.

**Website** (`apps/web`)
- Desktop-focused landing page, per-platform download page with install notes, honest
  unsigned-build warnings and checksum instructions.
- `/download/[platform]/[arch]` resolves the newest matching GitHub Release asset and
  falls back to an explanatory state instead of a dead link.
- Vitest coverage includes release/version/asset-name consistency with `apps/desktop`.

---

## Known gaps and unconfigured integrations

These are deliberate statements of what is **not** done. Do not treat them as delivered:

- **Nothing is deployed.** No hosting, domain, TLS certificate, database service or email
  provider is configured. `DEPLOYMENT.md` gives the steps; no step has been executed.
- **Transactional email is unconfigured.** With no SMTP settings, verification and reset links
  are logged server-side (and returned by the API only when `CP_EXPOSE_DEV_TOKENS=true`).
- **AI is unconfigured by default.** No shared key is shipped. Users add their own provider in
  Settings → AI provider; without one, every AI action is disabled or refused and deterministic
  features remain available. Live provider calls were not tested against a real vendor.
- **Job discovery depends on public boards.** Greenhouse and Lever adapters are implemented and
  tested against their documented JSON shapes, but tests do not call the live services. No
  general web search provider is implemented; other sources are imported manually or by URL.
- **No scheduled email digests or push notifications.** Reminders appear in-app and in the
  calendar; there is no mailer to send them.
- **No browser end-to-end suite** (see Tests). Frontend coverage is component-level plus the
  production build. The desktop app is covered by unit + smoke tests, not real OS windows.
- **Desktop builds are unsigned and unnotarized.** Windows SmartScreen and macOS Gatekeeper
  will prompt, and macOS automatic updates require signing. Signing secrets are not
  configured; the release workflow is otherwise complete.
- **The download page needs published installers.** Until a `v*` tag is pushed, the download
  buttons explain that no build is available rather than serving a broken file.
- **Cost estimates need a pricing table.** Without `CP_AI_PRICING_JSON` the UI reports token
  usage and states that cost estimation is unavailable.
- **No production account is seeded.** Create one through the sign-up page.

---

## Product rules enforced in code

1. No fabricated qualifications, employers, metrics or job listings. AI output is checked
   against verified profile evidence before it can enter a document.
2. The master CV is never overwritten without creating a new version.
3. Documents with unresolved critical findings cannot be approved, and unapproved documents
   cannot be exported.
4. CareerPilot never submits an application; the tracker records what you did elsewhere.
5. API keys are encrypted at rest and never returned by the API.
6. The desktop app never invents a default workspace or a hosted account; it connects only
   to the address the user enters.
7. No profile content reaches an AI provider until a provider is configured and the disclosure
   is accepted — enforced before the HTTP call.
8. Every user's data is scoped server-side; cross-user identifiers return 404.

## Documentation

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — environment, migrations, worker, reverse proxy, backups.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, data model, request flows.
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model and controls, with honest limits.
- [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md) — provider setup, privacy, failure behaviour.
- [`docs/JOB_SOURCES.md`](docs/JOB_SOURCES.md) — supported sources and how to add one.
- [`apps/desktop/README.md`](apps/desktop/README.md) — desktop architecture, security model,
  packaging, signing, updates, deep links and known gaps.
- [`docs/WEBSITE_DEPLOYMENT.md`](docs/WEBSITE_DEPLOYMENT.md) — deploying the marketing site
  and publishing installers.

## License

No license has been chosen for this repository yet.
