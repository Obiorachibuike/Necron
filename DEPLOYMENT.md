# Deployment guide

This document describes how to deploy CareerPilot AI. **Nothing here has been executed for this
repository**: there is no hosted instance, no domain, no managed database and no email provider
configured. Treat every step as a checklist, and verify each one in your own environment.

> **Desktop and website.** This document covers the API, worker and web deployment. The
> Electron shell and its release pipeline are documented in
> [`apps/desktop/README.md`](apps/desktop/README.md); marketing-site deployment and installer
> publishing are in [`docs/WEBSITE_DEPLOYMENT.md`](docs/WEBSITE_DEPLOYMENT.md). Nothing has
> been deployed from this repository.

The application is three processes plus two stateful dependencies:

```
Browser ──▶ Next.js (web, port 3000) ──/api/*──▶ FastAPI (api, port 8000) ──▶ PostgreSQL
                                                        │
                                                        ├── worker (same image, different command)
                                                        └── media volume (uploads + exports)
```

---

## 1. Prerequisites

| Requirement | Notes |
| --- | --- |
| Linux host or container platform | 1 vCPU / 1 GB RAM is enough for evaluation; size for your traffic. |
| Node.js 22+ | Frontend build. Node 20 may work but 22 is what was verified. |
| Python 3.11+ | Backend. Verified with CPython 3.11. |
| PostgreSQL 16+ | Authoritative store. Verified against PostgreSQL 16.2. |
| Reverse proxy with TLS | Nginx, Caddy, Traefik or a platform load balancer. |
| Persistent volume | For `CP_MEDIA_ROOT` (uploaded CVs and generated exports). |

SQLite is supported for local evaluation only. It is a single file with coarse locking and does
not tolerate multiple API/worker processes; do not use it in production.

---

## 2. Build the backend

```bash
git clone <your-repository-url> careerpilot
cd careerpilot/backend

python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Create `backend/.env` from `.env.example` and set at minimum:

```dotenv
CP_APP_ENV=production
CP_DEBUG=false
CP_SECRET_KEY=<48+ random characters>
CP_AI_ENCRYPTION_KEY=<Fernet key>
CP_DATABASE_URL=postgresql+psycopg://careerpilot:<password>@<db-host>:5432/careerpilot
CP_FRONTEND_ORIGIN=https://careerpilot.example
CP_ALLOWED_HOSTS=careerpilot.example,api.careerpilot.example
CP_MEDIA_ROOT=/var/lib/careerpilot/media
CP_ENABLE_INLINE_WORKER=false
CP_AUTO_CREATE_SCHEMA=false
```

Generate the secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

`CP_AI_ENCRYPTION_KEY` protects stored provider API keys. Changing it later makes existing keys
undecryptable; users would have to re-enter them. Back it up with the database.

Keep `.env` out of version control (the repository `.gitignore` already excludes it).

---

## 3. Create the database and run migrations

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE careerpilot LOGIN PASSWORD 'change-me';
CREATE DATABASE careerpilot OWNER careerpilot;
SQL

cd backend
alembic upgrade head
alembic current           # expect 0001_initial (head)
```

The initial revision creates all 41 tables and indexes. It has been verified on an empty
PostgreSQL 16.2 database, including a second no-op `upgrade head` and a
`downgrade base` → `upgrade head` round trip. Never edit an applied revision; add a new one:

```bash
alembic revision --autogenerate -m "describe the change"
# review the generated file before applying it
alembic upgrade head
```

Back up before every migration:

```bash
pg_dump --format=custom --file=careerpilot-$(date +%F).dump careerpilot
```

---

## 4. Run the API

```bash
cd backend
set -a; . ./.env; set +a
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

Notes:

- Use more than one worker only when `CP_ENABLE_INLINE_WORKER=false`; the inline worker is meant
  for single-process development.
- Health checks: `GET /api/v1/health` (liveness) and `GET /api/v1/health/ready` (database check).
- API documentation (`/api/v1/docs`) is served only when `CP_DEBUG=true`.

### systemd example

```ini
[Unit]
Description=CareerPilot API
After=network.target postgresql.service

[Service]
User=careerpilot
WorkingDirectory=/opt/careerpilot/backend
EnvironmentFile=/opt/careerpilot/backend/.env
ExecStart=/opt/careerpilot/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

---

## 5. Run the worker

The worker claims queued tasks from PostgreSQL. Without it, generation, discovery and interview
preparation stay queued and the UI shows them as queued — it does not fake progress.

```ini
[Unit]
Description=CareerPilot worker
After=network.target postgresql.service

[Service]
User=careerpilot
WorkingDirectory=/opt/careerpilot/backend
EnvironmentFile=/opt/careerpilot/backend/.env
ExecStart=/opt/careerpilot/backend/.venv/bin/python -m app.worker
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Run one worker by default. Multiple workers are safe (tasks are claimed atomically) but each
adds database polling load. `/api/v1/tasks/worker-status` reports heartbeats, queue depth and
whether a worker looks offline.

---

## 6. Build and run the frontend

```bash
cd apps/web
npm ci
CP_BACKEND_URL=http://127.0.0.1:8000 npm run build
CP_BACKEND_URL=http://127.0.0.1:8000 npm run start   # serves 0.0.0.0:3000
```

`CP_BACKEND_URL` is read server-side by the Next.js rewrite for `/api/:path*`. The browser never
calls the backend directly, so the session cookie remains first-party and no CORS configuration
is needed. Set `CP_FRONTEND_ORIGIN` on the backend to the public frontend URL.

If the backend is on another machine, keep the rewrite target on a private network and expose
only the Next.js port publicly:

```nginx
server {
    listen 443 ssl http2;
    server_name careerpilot.example;

    ssl_certificate     /etc/letsencrypt/live/careerpilot.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/careerpilot.example/privkey.pem;

    client_max_body_size 12m;          # CV uploads (CP_MAX_UPLOAD_MB=10)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Because requests are proxied through Next.js, the backend sees the proxy as the client. If you
terminate TLS at a proxy and forward directly to FastAPI instead, add the proxy's host to
`CP_ALLOWED_HOSTS` and make sure `X-Forwarded-For` is set for rate limiting.

---

## 7. Email (optional but recommended)

Verification and password-reset flows work without SMTP, but no message is delivered: the API
reports `email_configured=false`, and links are logged (and returned by the API only when
`CP_EXPOSE_DEV_TOKENS=true`, which must never be enabled in production).

Configure SMTP to turn on real delivery:

```dotenv
CP_SMTP_HOST=smtp.your-provider.example
CP_SMTP_PORT=587
CP_SMTP_USER=...
CP_SMTP_PASSWORD=...
CP_SMTP_STARTTLS=true
CP_EMAIL_FROM=CareerPilot AI <no-reply@careerpilot.example>
CP_REQUIRE_EMAIL_VERIFICATION=true
```

Then verify by registering a test account and confirming the message arrives. This repository's
tests do not send real email.

---

## 8. AI providers (optional)

AI is off until a user configures a provider in **Settings → AI provider** and accepts the data
disclosure. No shared key is shipped. For a self-hosted Ollama instance:

```dotenv
CP_AI_ALLOW_PRIVATE_ENDPOINTS=true
```

Only set that flag when the provider really is on a trusted private network; it permits loopback
and RFC1918 endpoints. Without it, private destinations are refused. See
[`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md).

Cost estimates require a price table:

```dotenv
CP_AI_PRICING_JSON={"gpt-4o-mini": {"input": 0.15, "output": 0.6}}
```

Values are USD per million tokens for that model. Leave it empty and the UI reports token usage
without inventing a cost.

---

## 9. Media storage and backups

`CP_MEDIA_ROOT` holds uploaded CVs and generated exports, written with owner-only permissions.
Back it up together with PostgreSQL, and do not serve it as a static directory: downloads go
through authenticated API routes with short-lived signed links.

```bash
# nightly, keep 14 days
pg_dump --format=custom careerpilot | gzip > /backups/db-$(date +%F).dump.gz
tar -czf /backups/media-$(date +%F).tar.gz -C /var/lib/careerpilot media
find /backups -type f -mtime +14 -delete
```

Restore order matters: database first, then media, then start the API and worker.

---

## 10. Post-deployment verification

Run these against the deployed host; each is a real check, not a formality:

1. `GET https://careerpilot.example/api/v1/health/ready` → `200` with `database: ok`.
2. `GET https://careerpilot.example/api/v1/meta` → no secrets, `email_configured` reflects your SMTP setup.
3. Register an account, complete onboarding, and confirm the session cookie is `Secure`, `HttpOnly`, `SameSite=Lax`.
4. Import a job by description, open it, and confirm a match with a per-category breakdown.
5. Approve a strategy, generate a CV, review the findings, approve, export PDF and DOCX, and open both files.
6. Configure an AI provider, accept the disclosure, run a review, and confirm usage tokens appear in Settings.
7. Stop the worker and queue a generation: the task must stay `queued` with no invented progress. Restart the worker and confirm it completes.
8. Export your data, then delete the account, and confirm sign-in fails and the address can be registered again.
9. Check logs for `CP_SECRET_KEY`, provider keys or session tokens — none may appear.

---

## 11. Operational notes

- **Scaling.** API and worker are stateless apart from the database and media volume, so you can
  run several of each. Rate limiting is per-process; put a shared limiter at the proxy if you
  need global limits.
- **Cookies over plain HTTP.** With `CP_APP_ENV=production` cookies are `Secure`; use HTTPS.
  For an internal HTTP test environment set `CP_COOKIE_SECURE=false` explicitly.
- **Host allowlist.** `CP_ALLOWED_HOSTS` must include the Host header clients send. `*` is
  dropped in development and raises at startup in production.
- **Migration on boot.** `CP_AUTO_CREATE_SCHEMA` defaults to `true` for convenience and must be
  `false` in production so the schema is owned by Alembic.
- **Upgrades.** Deploy code and migrations together, run `alembic upgrade head`, restart the
  worker before the API, then verify the checks in section 10.

Nothing in this document has been performed for this repository. No URL, credential or managed
service is provided.
