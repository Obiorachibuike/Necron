const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { DEFAULTS, loadSettings, sanitizeSettings, saveSettings } = require("../src/lib/config.cjs");

function temporaryFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "careerpilot-test-"));
  return path.join(directory, "desktop-settings.json");
}

test("missing settings file yields defaults", () => {
  const file = temporaryFile();
  const loaded = loadSettings(file);
  assert.equal(loaded.serverUrl, "");
  assert.equal(loaded.notificationsEnabled, true);
  assert.deepEqual(loaded.seenNotificationIds, []);
});

test("round-trips saved settings", () => {
  const file = temporaryFile();
  saveSettings(file, {
    serverUrl: "https://careers.example.com",
    notificationsEnabled: false,
    launchAtLogin: true,
    windowBounds: { x: 10, y: 20, width: 1200, height: 800, maximized: true },
    seenNotificationIds: ["a", "b"],
  });
  const loaded = loadSettings(file);
  assert.equal(loaded.serverUrl, "https://careers.example.com");
  assert.equal(loaded.notificationsEnabled, false);
  assert.equal(loaded.launchAtLogin, true);
  assert.equal(loaded.windowBounds.width, 1200);
  assert.equal(loaded.windowBounds.maximized, true);
  assert.deepEqual(loaded.seenNotificationIds, ["a", "b"]);
});

test("sanitises untrusted settings input", () => {
  const sanitized = sanitizeSettings({
    serverUrl: 42,
    notificationsEnabled: "yes",
    launchAtLogin: null,
    windowBounds: { x: 0, y: 0, width: 10, height: 10 },
    seenNotificationIds: [1, "ok", null, "ok"],
  });
  assert.equal(sanitized.serverUrl, "");
  assert.equal(sanitized.notificationsEnabled, true);
  assert.equal(sanitized.launchAtLogin, false);
  assert.equal(sanitized.windowBounds, null);
  assert.deepEqual(sanitized.seenNotificationIds, ["ok", "ok"]);
});

test("keeps only well-formed window bounds", () => {
  assert.equal(sanitizeSettings({ windowBounds: "nope" }).windowBounds, null);
  assert.equal(
    sanitizeSettings({ windowBounds: { x: 1, y: 2, width: 800, height: 600 } }).windowBounds.width,
    800
  );
  assert.equal(
    sanitizeSettings({ windowBounds: { x: 1, y: 2, width: 100, height: 100 } }).windowBounds,
    null
  );
});

test("corrupt settings are preserved instead of silently deleted", () => {
  const file = temporaryFile();
  fs.writeFileSync(file, "{ this is not json");
  const loaded = loadSettings(file);
  assert.deepEqual(loaded.seenNotificationIds, []);
  const siblings = fs.readdirSync(path.dirname(file));
  assert.ok(siblings.some((name) => name.includes("corrupt-")), "corrupt file kept for debugging");
});

test("saved files are not world readable", () => {
  const file = temporaryFile();
  saveSettings(file, { ...DEFAULTS, serverUrl: "https://example.com" });
  const mode = fs.statSync(file).mode & 0o777;
  if (process.platform !== "win32") {
    assert.equal(mode, 0o600);
  }
});

test("default version is current", () => {
  assert.equal(DEFAULTS.version, 1);
});
