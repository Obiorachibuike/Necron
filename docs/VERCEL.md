# Vercel Services deployment

The repository root contains a `vercel.json` that builds CareerPilot as one Vercel project with
two services. This is deployment configuration only; it does not provision a database, durable
file storage, email, or a continuously running worker.

## Service map

| Service | Root | Public ingress | Responsibility |
| --- | --- | --- | --- |
| `web` | `apps/web` | `/(.*)` | Next.js UI and same-origin `/api/v1/*` runtime proxy |
| `backend` | `backend` | None (internal) | FastAPI at `app.main:app`, with routes under `/api/v1` |

`web` declares one caller-side binding to `backend`:

```text
type=service  service=backend  format=url  env=CP_BACKEND_URL
```

Vercel injects `CP_BACKEND_URL` into the `web` service's functions at runtime. **Do not set that
variable in the Vercel dashboard.** It is unavailable during builds and in middleware, so the
Next.js Route Handler at `apps/web/src/app/api/v1/[...path]/route.ts` reads it only while handling
a request. The former build-time rewrite in `next.config.ts` has intentionally been removed.

The request path is:

```text
Browser /api/v1/*
  → public web service
  → Next.js runtime proxy (CP_BACKEND_URL)
  → private backend service /api/v1/*
```

Cookies, CSRF headers, request bodies, query strings, downloads, and multiple `Set-Cookie` response
headers cross this proxy. The browser continues to use relative `/api/v1` URLs and one origin.

## Run both services locally

Install a current Vercel CLI (this configuration was checked with 65.2.0) and Python 3.12
(selected for this service by `backend/.python-version`), then run from the repository root:

```bash
vercel dev -L
```

`vercel dev` starts both services and injects the local binding. Use this command to test the
service configuration rather than starting only Next.js. For standalone frontend development,
`next dev` still falls back to `http://127.0.0.1:8000`; `apps/web/.env.example` documents the
optional `CP_BACKEND_URL` override for non-Vercel local runs.

Useful checks while the services are running:

```bash
curl -i http://localhost:3000/api/v1/health
curl -i http://localhost:3000/
```

The API response arrives through `web`; `backend` has no public top-level rewrite.

## Vercel project settings

Import the repository with its **Root Directory at the repository root**, not `apps/web`, so Vercel
can discover both entries in `vercel.json`. Do not replace the services configuration with a
standalone Next.js project preset.

Configure the backend's normal production variables, especially:

- `CP_APP_ENV=production`, a strong `CP_SECRET_KEY`, and `CP_AI_ENCRYPTION_KEY`;
- `CP_DATABASE_URL` pointing to managed PostgreSQL, and run Alembic migrations separately;
- `CP_FRONTEND_ORIGIN=https://your-public-domain` for a stable custom domain. If it is unset, the
  backend uses Vercel's current `VERCEL_URL`, which is useful for unique preview deployments;
- `CP_ALLOWED_HOSTS` with any custom public hostnames. On Vercel the backend additionally trusts
  the current `VERCEL_URL` and `*.services.vercel-infra.com`, the generated hosts used by private
  service bindings. The backend remains unreachable from the public route table;
- SMTP settings if verification and reset emails should actually be delivered.

Environment variables remain scoped to the appropriate Development, Preview, or Production
environment. Use separate databases for preview and production data.

## Stateful-work limitations to resolve before production

The two configured services handle HTTP requests. They do not make the rest of the original
deployment topology serverless-safe:

- **Database:** SQLite is not a production Vercel database. Provision PostgreSQL and apply
  migrations; do not enable `CP_AUTO_CREATE_SCHEMA` in production.
- **Uploads and exports:** Vercel's local filesystem is ephemeral. `CP_MEDIA_ROOT` on local disk is
  unsuitable for durable user files across instances. A persistent object-storage implementation
  or another durable backend is still required for production uploads and generated documents.
- **Background work:** the repository's standalone worker is not one of these two request services.
  A serverless function cannot be relied upon as a continuously polling worker. Configure a Vercel
  Daemon or an external worker before relying on queued generation, discovery, and reminders;
  do not treat the inline development worker as a production queue service.
- **Function limits:** request duration and payload limits apply to AI operations, imports, and CV
  uploads. Verify the limits for the project's Vercel plan before accepting production traffic.

See `DEPLOYMENT.md` for the existing database, migration, worker, email, and verification checklists.
