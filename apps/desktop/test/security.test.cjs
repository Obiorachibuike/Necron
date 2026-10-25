/**
 * Structural guarantees for the desktop shell. These are not a substitute for a code
 * review, but they fail loudly if a future edit weakens the isolation boundary by
 * accident (enabling Node in the remote page, dropping the sandbox, adding inline
 * scripts to shell windows, or shipping without installer metadata).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("main process never enables node integration or webviews", () => {
  const main = read("src/main.cjs");
  assert.doesNotMatch(main, /nodeIntegration:\s*true/);
  assert.doesNotMatch(main, /webSecurity:\s*false/);
  assert.doesNotMatch(main, /contextIsolation:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webviewTag:\s*false/);
  assert.match(main, /app\.enableSandbox\(\)/);
});

test("remote workspace windows have no preload bridge", () => {
  const main = read("src/main.cjs");
  const remoteBlock = main.slice(main.indexOf("const window = new BrowserWindow"), main.indexOf("mainWindow = window"));
  assert.doesNotMatch(remoteBlock, /preload:/);
  assert.match(remoteBlock, /partition: SESSION_PARTITION/);
});

test("IPC handlers reject senders that are not shell pages", () => {
  const main = read("src/main.cjs");
  assert.match(main, /function isLocalSender/);
  assert.match(main, /url\.startsWith\("file:\/\/"\) && url\.includes\("\/renderer\/"\)/);
});

test("external navigation is filtered through the allowlist", () => {
  const main = read("src/main.cjs");
  assert.match(main, /webContents\.setWindowOpenHandler/);
  assert.match(main, /webContents\.on\("will-navigate"/);
  assert.match(main, /webContents\.on\("will-redirect"/);
  assert.match(main, /isSameOrigin\(settings\.serverUrl, url\)/);
});

test("permission requests default to denied", () => {
  const main = read("src/main.cjs");
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /allowed\.has\(permission\)/);
  assert.doesNotMatch(main, /callback\(true\)/);
});

test("preload exposes only the documented API", () => {
  const preload = read("src/preload.cjs");
  const exposed = preload.match(/contextBridge\.exposeInMainWorld\("careerpilot",\s*\{([\s\S]*?)\n\}\);/);
  assert.ok(exposed, "contextBridge exposure found");
  assert.doesNotMatch(exposed[1], /require|process\.binding|ipcRenderer\.send/);
  assert.match(preload, /onState/);
});

test("every shell page ships a restrictive CSP and no inline scripts", () => {
  for (const file of ["welcome.html", "settings.html", "offline.html", "loading.html"]) {
    const html = read(path.join("src/renderer", file));
    assert.match(html, /Content-Security-Policy/, `${file} has a CSP`);
    assert.match(html, /default-src 'none'/, `${file} denies by default`);
    assert.match(html, /connect-src 'none'/, `${file} makes no direct network calls`);
    assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/, `${file} has no inline scripts`);
    assert.doesNotMatch(html, /on(?:click|load|error)=/i, `${file} has no inline handlers`);
  }
});

test("installer metadata covers all three desktop platforms", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(pkg.build.linux.target, ["AppImage", "deb"]);
  assert.ok(pkg.build.win.target.some((entry) => entry.target === "nsis"));
  assert.ok(pkg.build.mac.target.some((entry) => entry.target === "dmg"));
  assert.equal(pkg.build.publish[0].provider, "github");
  assert.equal(pkg.build.publish[0].owner, "Obiorachibuike");
  assert.equal(pkg.build.publish[0].repo, "Necron");
  assert.deepEqual(pkg.build.protocols[0].schemes, ["careerpilot"]);
});

test("generated icon assets exist for every platform", () => {
  for (const file of ["build/icon.png", "build/icon.ico", "build/icon.icns",
                      "build/tray.png", "build/trayTemplate.png"]) {
    const stats = fs.statSync(path.join(ROOT, file));
    assert.ok(stats.size > 0, `${file} is not empty`);
  }
  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    assert.ok(fs.existsSync(path.join(ROOT, "build/icons", `${size}x${size}.png`)));
  }
});
