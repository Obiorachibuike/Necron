# CareerPilot Desktop

A native Electron shell for a CareerPilot workspace. The desktop app does **not** bundle
the backend or host an account: it opens the CareerPilot web app you already run (or the
one your organisation operates) inside a real window and adds the things a browser tab
cannot provide — tray, native notifications, menu shortcuts, deep links, a downloads
folder and update checks.

```
apps/desktop
├── src/
│   ├── main.cjs              app lifecycle, windows, tray, menus, IPC, updates, downloads
│   ├── preload.cjs           small contextBridge API for the shell's own local windows
│   ├── lib/                  pure, unit-tested helpers (URLs, settings, files, notifications)
│   └── renderer/             welcome, desktop settings, offline and loading pages
├── build/                    generated icons (PNG/ICO/ICNS/tray) + macOS entitlements
├── scripts/
│   ├── generate-icons.py     rebuilds the icon set from the brand mark (Pillow)
│   └── verify-release-tag.mjs
├── test/                     node:test suites (48 tests)
└── package.json              electron-builder configuration + targets
```

## Architecture and trust boundaries

| Surface | What it is | Isolation |
| --- | --- | --- |
| Main process (`src/main.cjs`) | Owns windows, tray, menus, filesystem downloads, notifications, updates and deep links | Node access by design |
| Workspace window | A `BrowserWindow` loading the **remote** CareerPilot URL | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webviewTag: false`, **no preload** |
| Shell windows | Local HTML for connect / settings / offline / loading | Sandboxed, preload exposing a fixed API, strict CSP (`default-src 'none'`, `connect-src 'none'`) |

Additional rules enforced in code:

- Every same-origin navigation stays in the window; anything else is rejected and handed
  to the OS browser only after an `http`/`https`/`mailto` check.
- All IPC channels validate that the sender frame is one of the local `renderer/` pages;
  the remote workspace cannot reach IPC at all.
- Permission requests (camera, microphone, geolocation, MIDI, …) are denied by default;
  only `clipboard-sanitized-write` is allowed.
- Settings contain no secrets. Sessions live in the `persist:careerpilot` Chromium
  partition; API keys never leave the server.
- Downloads are sanitised and never overwrite an existing file.
- No analytics, crash reporting or third-party scripts exist in the shell.

The renderer-facing API is deliberately small: `getState`, `testServer`, `saveServer`,
window-open helpers, `openExternal`, `setPreference`, `signOut`, `checkUpdates`,
`quitAndInstall`, `openWorkspaceRoute` and `onState`.

## Development

Node.js 22+ and npm are required. The first `npm install` runs Electron's installer, which
downloads the platform binary.

```bash
cd apps/desktop
npm install
npm test              # 48 node:test cases; no display required
npm start             # development run (unpackaged)
npm run dev           # adds --devtools so the DevTools entry is always available
```

You need a running workspace. For the repository's local stack:

```bash
# terminal 1
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
# terminal 2
cd apps/web && CP_BACKEND_URL=http://127.0.0.1:8000 npm run dev
```

Then connect `http://localhost:3000` in the desktop window.

`npm run icons` regenerates `build/icon.png`, `icon.ico`, `icon.icns`, the `icons/` size
set and the tray images. It needs Pillow (`pip install pillow`) but is not part of a build.

## Build installers

```bash
npm run dist:linux    # AppImage + deb
npm run dist:win      # NSIS installer (x64, ARM64)
npm run dist:mac      # DMG + ZIP (Apple silicon and Intel)
```

Artifacts land in `apps/desktop/release/` and follow
`CareerPilot-${version}-${os}-${arch}.${ext}`. Because electron-builder expands
architecture macros per target, the final names are:

| Platform | Files |
| --- | --- |
| Windows | `CareerPilot-1.0.0-win-x64.exe`, `CareerPilot-1.0.0-win-arm64.exe` |
| macOS | `CareerPilot-1.0.0-mac-arm64.dmg`, `CareerPilot-1.0.0-mac-x64.dmg`, matching `.zip` archives |
| Linux | `CareerPilot-1.0.0-linux-x86_64.AppImage`, `CareerPilot-1.0.0-linux-amd64.deb` |

The website reads these names from `apps/web/src/lib/desktop.ts`; a Vitest test fails if
the site and desktop versions drift. The website download buttons resolve the current
GitHub Release asset at request time, so a version bump does not leave dead links.

Cross-building has limits: macOS DMGs must be built on macOS (the workflow uses
`macos-latest`), and Windows installers are best built on Windows. The release workflow
builds each platform natively.

## Releases and automatic updates

`.github/workflows/desktop-release.yml` builds all three platforms on a `v*` tag (or a
manual run) and publishes a GitHub Release containing installers, `latest*.yml` update
metadata and `SHA256SUMS.txt`.

1. Bump `version` in `apps/desktop/package.json` and `DESKTOP_VERSION` in
   `apps/web/src/lib/desktop.ts` (and the website's `package.json` if you want them equal).
2. Commit, then tag `v1.2.3` and push the tag.
3. The workflow verifies the tag matches the desktop version, builds, tests and publishes.

The updater uses `electron-updater`'s GitHub provider configured in `package.json`
(`publish.owner = Obiorachibuike`, `repo = Necron`). Behaviours worth knowing:

- **Windows NSIS** — in-place update works for unsigned builds; the user clicks
  *Restart & install* in Desktop settings or the notification.
- **Linux AppImage** — updates in place when launched as an AppImage (the updater needs
  the `APPIMAGE` environment variable, which is present in that mode).
- **Linux deb** — no self-update; the package manager owns it.
- **macOS** — `electron-updater` requires a **code-signed** app to install an update.
  Unsigned builds must be replaced manually and should not be advertised as auto-updating.

### Signing and notarisation (not configured yet)

The repository currently ships **unsigned, unnotarized** builds. This is a real
distribution gap, not a hidden feature: Windows SmartScreen and macOS Gatekeeper will ask
for confirmation, and macOS auto-update cannot work.

To sign:

1. Add `CSC_LINK` (base64 certificate or path) and `CSC_KEY_PASSWORD` repository secrets
   for Windows and macOS.
2. For macOS notarisation add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
   `APPLE_TEAM_ID`, and set `build.mac.notarize` / hardened-runtime options as documented
   by electron-builder.
3. Remove `CSC_IDENTITY_AUTO_DISCOVERY: "false"` from the workflow — it exists only to
   keep unsigned CI builds deterministic.

## Deep links

Packaged builds register the `careerpilot://` scheme:

```
careerpilot://open?server=https%3A%2F%2Fcareers.example.com
```

The app asks before switching away from the currently connected workspace. Development
builds do not register the scheme; pass the URL as an argument instead
(`npm start -- "careerpilot://open?server=..."`).

## Server configuration notes

The desktop window is just another first-party browser for your deployment, so the server
configuration does not change for it:

- `CP_FRONTEND_ORIGIN` must match the site origin the desktop window loads
  (for example `https://careers.example.com`). Mutating requests send that `Origin`.
- `CP_ALLOWED_HOSTS` must include the host the **web app** uses to reach the backend
  (`CP_BACKEND_URL`). The desktop app never talks to the API host directly.
- Cookies stay first-party because Next.js proxies `/api/*`; the desktop partition keeps
  them separate from your everyday browser.
- Plain `http://` is accepted for loopback only in the connect screen's UI; a remote
  `http://` address shows a warning. Use https for anything reachable from the internet.

## Local desktop settings

Stored at `<userData>/desktop-settings.json` (mode `0600`):

```json
{
  "version": 1,
  "serverUrl": "https://careers.example.com",
  "windowBounds": { "x": 120, "y": 80, "width": 1280, "height": 860, "maximized": false },
  "notificationsEnabled": true,
  "launchAtLogin": false,
  "lastNotificationPollAt": "2026-05-01T10:00:00.000Z",
  "seenNotificationIds": ["…"]
}
```

Unreadable settings are renamed with a `.corrupt-<timestamp>` suffix rather than deleted.
Logs are written to `<userData>/logs/desktop.log` (rotated once at ~1.5 MB) and can be
opened from Desktop settings, the Help menu or the offline screen.

## Tests

`npm test` runs 48 tests with Node's built-in runner:

- URL normalisation, origin checks, external-link protocol allowlist, deep-link parsing
  and post-auth routing.
- Settings sanitisation, atomic writes, corrupt-file preservation and file permissions.
- Download filename sanitisation, traversal defence and collision handling.
- Notification selection (unread, newer than baseline, deduplicated, oldest first).
- Structural guarantees: remote window has no preload, sandbox/context isolation remain
  on, IPC rejects non-local senders, every shell page carries a restrictive CSP, installers
  and icons exist for all targets.
- A main-process smoke test with an Electron stub that drives the real flow: boot →
  connect screen → health check → save workspace → main window at `/sign-in`, plus IPC
  sender rejection and preference round-trips.

**Not covered:** OS-level window rendering, tray appearance, real notification delivery,
actual installer execution, code signing, and end-to-end auth inside a real Electron
window. Those need a machine with a display and are listed here rather than claimed.

## Known gaps

- Builds are unsigned and unnotarized; macOS auto-update is therefore unavailable.
- The app has no default hosted workspace. That is intentional — it never invents an
  account or silently points at a third-party server.
- No Linux ARM64 build is published; the installer matrix covers x64.
- No Microsoft Store / Mac App Store packaging.
- The `.deb` does not self-update.
- Notifications depend on the OS notification service; a minimal Linux desktop without a
  notification daemon may show none.
