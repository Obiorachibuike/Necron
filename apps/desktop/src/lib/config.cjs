/**
 * Settings persistence for the desktop shell.
 *
 * The file lives in Electron's per-user data directory and contains no secrets:
 * session cookies stay in Chromium's cookie store, and API keys live on the
 * workspace server. Writes are atomic so a crash cannot truncate the file.
 */
const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_VERSION = 1;

const DEFAULTS = Object.freeze({
  version: SETTINGS_VERSION,
  serverUrl: "",
  windowBounds: null,
  notificationsEnabled: true,
  launchAtLogin: false,
  lastNotificationPollAt: null,
  seenNotificationIds: [],
});

function coerceBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * @param {unknown} raw
 * @returns {typeof DEFAULTS}
 */
function sanitizeSettings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const bounds = input.windowBounds;
  const validBounds =
    bounds &&
    typeof bounds === "object" &&
    ["x", "y", "width", "height"].every((key) => Number.isFinite(bounds[key])) &&
    bounds.width >= 600 &&
    bounds.height >= 480;

  const seen = Array.isArray(input.seenNotificationIds)
    ? input.seenNotificationIds.filter((id) => typeof id === "string").slice(0, 400)
    : [];

  return {
    version: SETTINGS_VERSION,
    serverUrl: typeof input.serverUrl === "string" ? input.serverUrl : "",
    windowBounds: validBounds
      ? {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          maximized: Boolean(bounds.maximized),
        }
      : null,
    notificationsEnabled: coerceBoolean(input.notificationsEnabled, true),
    launchAtLogin: coerceBoolean(input.launchAtLogin, false),
    lastNotificationPollAt:
      typeof input.lastNotificationPollAt === "string" ? input.lastNotificationPollAt : null,
    seenNotificationIds: seen,
  };
}

/**
 * @param {string} filePath
 * @returns {typeof DEFAULTS}
 */
function loadSettings(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return sanitizeSettings(JSON.parse(text));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      // Preserve unreadable settings for debugging instead of silently deleting them.
      try {
        fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
      } catch {
        /* ignore */
      }
    }
    return { ...DEFAULTS, seenNotificationIds: [] };
  }
}

/**
 * @param {string} filePath
 * @param {unknown} settings
 */
function saveSettings(filePath, settings) {
  const sanitized = sanitizeSettings(settings);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return sanitized;
}

module.exports = { DEFAULTS, SETTINGS_VERSION, loadSettings, sanitizeSettings, saveSettings };
