# Website deployment

The marketing site and the desktop installer downloads are served by the existing Next.js
app in `apps/web`. **No site has been deployed from this repository.** This document is
the checklist; every step is meant to be executed and verified in your own account.

The site is not static: it uses Next.js route handlers (the download redirects and the
`/api/*` proxy), so GitHub Pages or a plain object store will not work. Use a Next.js
host such as Vercel, Netlify, Fly.io, Render or your own Node server.

---

## 1. What the site needs

| Variable | Required | Purpose |
| --- | --- | --- |
| `CP_BACKEND_URL` | Yes, for sign-in and the app routes | Server-side rewrite target for `/api/*`. The browser only talks to the site origin, so session cookies stay first-party. |
| `CP_GITHUB_TOKEN` | Optional | Raises the GitHub API rate limit for `/download/[platform]/[arch]`. The route works unauthenticated at 60 requests/hour per IP, cached for 30 minutes. |
| `NEXT_PUBLIC_*` | — | The site does not need a public API URL; all calls are relative. |

The download buttons do not hard-code release file URLs. `/download/windows/x64` calls
`api.github.com/repos/Obiorachibuike/Necron/releases`, finds the newest non-draft release
with a matching installer, and redirects to the asset. If nothing matches it sends the
visitor to `/download?missing=<platform>`, which explains that no build is published yet
instead of showing a GitHub 404.

## 2. Deploy on Vercel (recommended)

1. Import `Obiorachibuike/Necron` in Vercel.
2. Set **Root Directory** to `apps/web`.
3. Framework preset: Next.js. Install command `npm ci`; build command `npm run build`.
4. Add the environment variable `CP_BACKEND_URL` pointing at the public backend origin,
   for example `https://api.careerpilot.example`. Add `CP_GITHUB_TOKEN` if you have one.
5. Deploy, then open `/`, `/download` and a `/download/windows/x64` link.

The backend itself is deployed separately (see `DEPLOYMENT.md`). On the backend:

```dotenv
CP_FRONTEND_ORIGIN=https://careers.example.com     # the site origin, exactly
CP_ALLOWED_HOSTS=api.careerpilot.example,localhost # hosts the API accepts
```

`CP_FRONTEND_ORIGIN` matters because mutating API requests send an `Origin` header. If the
site works but every save returns `origin_rejected`, this value is wrong.

## 3. Deploy on any Node host

```bash
cd apps/web
npm ci
CP_BACKEND_URL=https://api.careerpilot.example npm run build
CP_BACKEND_URL=https://api.careerpilot.example npm start   # 0.0.0.0:3000
```

Terminate TLS at your proxy and forward the `Host` header. The Next.js rewrite keeps the
backend off the public internet if you prefer.

## 4. Publishing installers

The download page only offers real files. Publish them first:

1. Bump `apps/desktop/package.json` version and `apps/web/src/lib/desktop.ts`
   `DESKTOP_VERSION` together (a Vitest test enforces this).
2. Commit and push a semver tag, for example:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. `.github/workflows/desktop-release.yml` builds Windows, macOS and Linux installers on
   native runners, runs the desktop tests, verifies the tag, generates
   `SHA256SUMS.txt`, and publishes a GitHub Release with the installers and
   `latest*.yml` files.

No secrets are required for unsigned builds. Add signing secrets before presenting the
builds as trusted — see `apps/desktop/README.md` → *Signing and notarisation*.

Until a release exists, the download route redirects to the explanatory
`/download?missing=…` state. That is intentional: the site never links to a file that is
not there.

## 5. CI

`.github/workflows/ci.yml` runs on `main` and pull requests:

- desktop: `npm ci` + `npm test` (48 tests, no display needed)
- website: `npm ci` + `npm test` + `npm run typecheck` + `npm run build`

A Vercel Git integration will deploy previews independently of GitHub Actions; the
workflow does not attempt a deployment because no Vercel token is stored in the repository.

## 6. Verify before announcing

- [ ] `/` renders the desktop hero and three platform cards.
- [ ] `/download` renders platform sections, installation steps and the honest
      unsigned-build warnings.
- [ ] `/download/windows/x64`, `/download/macos/arm64`, `/download/linux/x64` and
      `/download/linux/x64?format=deb` redirect to real release assets.
- [ ] A release without a matching asset lands on `/download?missing=…` with an
      explanation.
- [ ] `/api/v1/health` through the site returns the backend status.
- [ ] Sign-up and sign-in work in a browser; `CP_FRONTEND_ORIGIN` matches the site.
- [ ] The desktop app can connect to the deployed site URL and sign in.
- [ ] Social preview metadata (`/icon.png`, title, description) looks right.

## 7. Honest limits

- Nothing in this repository is deployed, and the auto-update feed points at GitHub
  Releases from `Obiorachibuike/Necron`; a fork must change `apps/desktop/package.json`
  publish settings and `apps/web/src/lib/desktop.ts` repository constants.
- No analytics are collected by the site. There is also no consent banner to configure.
- The site is not a static export. If you need one, replace the download redirect and the
  API proxy with a different deployment architecture.
