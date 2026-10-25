# Security

This document describes the controls that are implemented, how they were verified, and where
the limits are. It is not a compliance certification. No penetration test or third-party audit
has been performed.

## Threat model

In scope:

- Unauthenticated internet users attacking the public endpoints.
- Authenticated users attempting to read or change another user's data.
- Malicious job postings or URL imports used to make the server fetch internal resources.
- Malicious document content (formulas, scripts, oversized files, path traversal).
- Leaked credentials in logs, API responses or the repository.
- Prompt injection through job listings into AI prompts.

Out of scope: a compromised host or database, malicious platform operators, and denial of
service beyond basic rate limiting.

## Authentication

| Control | Implementation |
| --- | --- |
| Password hashing | Argon2id (`argon2-cffi`), per-password salt, no peppers. |
| Password policy | Minimum 10 characters with at least one letter and one number; rejected by Pydantic before hashing. |
| Sessions | 24-byte random tokens, stored as SHA-256 hashes; the raw token exists only in the cookie. Default TTL 7 days. |
| Cookie | `cp_session`, `HttpOnly`, `SameSite=Lax`, `Secure` when `CP_APP_ENV=production`, `Path=/`. |
| CSRF | Double-submit: a random `cp_csrf` cookie plus an `X-CSRF-Token` header required on every POST/PUT/PATCH/DELETE, bound to the session. |
| Origin check | Mutating `/api/*` requests with an `Origin` header other than `CP_FRONTEND_ORIGIN` are rejected with 403. |
| Rate limits | 180/min general, 10/min auth, 8/min password recovery, 40/min AI, keyed by session/user or IP. |
| Session management | Users can list and revoke sessions; changing the password revokes all other sessions. |
| Email verification | Supported with single-use, expiring tokens. Delivery requires SMTP configuration; without it the API reports `email_configured=false` and does not pretend to send mail. |
| Account deletion | Requires the current password and the typed word `DELETE`; cascades rows and removes the user's files. |

Passwords are never logged, and authentication failures return generic messages that do not
reveal whether an address exists. Password reset responses are identical for known and unknown
addresses.

## Authorization and tenancy

- Every table with user data has a `user_id`; every query filters on the authenticated user.
- Object lookups use ownership helpers that raise `404 not_found` for another user's ID. This
  avoids confirming that an object exists.
- Foreign keys supplied in requests (job, document, strategy, application, reminder, session) are
  re-checked for ownership before use.
- Cross-user isolation is covered by integration tests for jobs, matches, documents, files,
  interviews, tasks, AI configuration, exports and analytics.

## Input validation

- Pydantic request models reject unexpected fields (`extra="forbid"`) and normalise strings.
- Enumerations are validated (statuses, work arrangements, employment types, experience levels,
  providers, templates, document formats).
- URL fields require `http(s)`, reject embedded credentials, and are length-limited.
- Uploads are limited by size (`CP_MAX_UPLOAD_MB`), MIME type and extension; PDFs and DOCX files
  are parsed and validated, not merely accepted.
- Generated filenames are sanitised; storage paths are derived from UUIDs, never user input.
- All database access goes through SQLAlchemy parameter binding.

## SSRF protection for URL imports

Before any outbound fetch:

1. Scheme must be `http` or `https`; embedded credentials are rejected.
2. Port must be 80 or 443.
3. Hostnames are resolved and every resolved address is checked against loopback, private,
   link-local, reserved, multicast and cloud metadata ranges (`169.254.169.254`,
   `100.100.100.200`, `192.0.0.192`, CGNAT `100.64.0.0/10`).
4. Hostnames including `localhost`, `.local`, `.internal` and similar suffixes are blocked.
5. Redirects are followed manually with the same checks on every hop, capped in count.
6. Responses are capped in bytes and time.
7. Stored listing URLs (`source_url`, `apply_url`) pass the same public-destination validation,
   so they cannot be used to render internal links or be re-fetched later.

Private destinations are only permitted when the operator sets
`CP_JOB_FETCH_ALLOW_PRIVATE_HOSTS=true` (for example, a test environment). Integration tests
assert that loopback, metadata, `file://` and localhost URLs are rejected.

## AI data handling

- Provider API keys are encrypted at rest with Fernet (`CP_AI_ENCRYPTION_KEY`, falling back to
  `CP_SECRET_KEY`), never logged, never returned; the API exposes only `has_api_key`.
- **No profile content is sent to any provider until a provider is configured and the data
  disclosure is accepted.** This is enforced in `run_chat`, the single choke point for every
  provider request — not only in the UI or route layer.
- Job text is wrapped and labelled as untrusted data in prompts; output is validated against a
  JSON schema and, for documents, checked against verified profile evidence before acceptance.
- Usage (tokens, requests, failures) is recorded per user. Cost is only shown when a pricing
  table is configured; otherwise the API says estimation is unavailable.
- Users can delete configurations at any time; deleting an account removes configurations and
  usage records.

See [`AI_PROVIDERS.md`](AI_PROVIDERS.md) for the full workflow.

## Document safety

- Content is composed from verified records; links are validated; control characters are
  stripped before rendering.
- PDF generation is local (ReportLab) with fonts discovered from the host; no headless browser or
  remote rendering service is used. LaTeX is optional and, if unavailable, the feature reports so
  instead of shelling out to an untrusted binary.
- DOCX files are validated as ZIP archives containing the expected word-processing parts before
  being offered for download.
- Exports and uploads are stored outside the web root and served only through authenticated,
  short-lived signed download routes (`CP_EXPORT_LINK_TTL_SECONDS`, default 300).

## Network and deployment hardening

- `TrustedHostMiddleware` with an explicit allowlist (`CP_ALLOWED_HOSTS`). A `*` entry is dropped
  in development and raises at startup in production.
- CORS is restricted to `CP_FRONTEND_ORIGIN`.
- Request bodies are capped (`CP_MAX_REQUEST_BYTES`, 2 MB); uploads are capped separately.
- API docs and OpenAPI schema are disabled in production unless `CP_DEBUG=true`.
- API responses carry `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `Cache-Control: no-store` and a restrictive
  `default-src 'none'; frame-ancestors 'none'` CSP, plus HSTS in production. The Next.js app sets
  its own document headers.
- Errors return a stable envelope with a request ID; stack traces and SQL are never returned.
- Logs are structured and redact credentials, cookies and tokens. A repository secret scan
  (patterns for provider keys, private keys and tokens) found no committed secrets.

## Secrets

- `CP_SECRET_KEY` must be replaced; the default is clearly marked insecure and is rejected when
  too short.
- `CP_AI_ENCRYPTION_KEY` should be a dedicated Fernet key, backed up with the database. Losing it
  makes stored provider keys undecryptable (users re-enter them).
- Secrets are read from environment variables or `.env`; `.gitignore` excludes `.env*` except
  `.env.example` templates.
- Rotating `CP_SECRET_KEY` invalidates existing sessions; that is the intended behaviour.

## Known limitations

- **Rate limiting is per process and in-memory.** Multiple API instances do not share counters.
  Use a proxy-level limiter if you need global limits.
- **No MFA/SSO.** Accounts use email + password only.
- **No audit log for administrative actions.** There are no admin roles in this application.
- **Email delivery is unconfigured by default.** Without SMTP there is no verification or reset
  delivery; the UI states this rather than claiming a message was sent.
- **No automated dependency scanning or SAST in CI.** Run `pip-audit` / `npm audit` and a SAST
  tool in your own pipeline.
- **No penetration test.** The claims here rest on the test suite and code review only.
- **Backups are the operator's responsibility.** See `DEPLOYMENT.md` for the recommended backup
  and restore procedure.

## Reporting

If you deploy this application, replace this section with a security contact address. No contact
address is claimed here because none has been configured.

## Desktop shell boundaries

The Electron shell is deliberately split into trusted local UI and untrusted remote
content.

| Control | Implementation |
| --- | --- |
| Renderer isolation | Workspace window: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: false`, no preload. |
| IPC authorisation | `ipcMain.handle` wrappers reject senders whose frame is not a local `file://…/renderer/…` page. The remote app has no bridge. |
| Navigation | Same-origin navigations stay in the window; other origins are blocked and passed to `shell.openExternal` only after an `http`/`https`/`mailto` check. `window.open` is denied and handled the same way. |
| Local page CSP | `default-src 'none'`, `script-src 'self'`, `connect-src 'none'`; the pages reach the network only through validated IPC. |
| Permissions | All permission requests are denied except `clipboard-sanitized-write`. |
| Storage | Session cookies in an isolated Chromium partition; settings contain no secrets and are written atomically with mode `0600`; corrupt settings are preserved for debugging. |
| Downloads | Filename sanitisation strips both path separators, control characters and Windows-reserved characters; collisions get a numeric suffix. |
| Updates | GitHub Releases over https via `electron-updater`; update metadata is only trusted from the configured repository. |
| Telemetry | None. No analytics, crash reporter or third-party scripts are included in the shell. |

Honest limits: release builds are currently unsigned and unnotarized. That is a
distribution-integrity gap, documented in `apps/desktop/README.md`; checksums are attached
to each release so a user can verify a download out of band. Desktop-specific gaps (no real
OS-level end-to-end tests, no signing) are listed in the root README.
