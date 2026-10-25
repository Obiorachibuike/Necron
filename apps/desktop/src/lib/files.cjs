/**
 * Filename helpers for the download handler.
 */
const fs = require("node:fs");
const path = require("node:path");

/**
 * Strip paths and characters that are invalid on Windows/macOS/Linux.
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  // Treat both separators as separators regardless of platform, so a Windows-style
  // path cannot smuggle a directory component through on Linux (or vice versa).
  const segments = String(typeof name === "string" ? name : "")
    .split(/[\\/]/)
    .filter(Boolean);
  const base = (segments.pop() ?? "").replace(/[\u0000-\u001f<>:"|?*]/g, "_");
  const trimmed = base.trim().replace(/^\.+/, "").slice(0, 180);
  return trimmed || `careerpilot-download-${Date.now()}`;
}

/**
 * Return a path that does not exist yet, appending " (1)", " (2)", … before the extension.
 *
 * @param {string} directory
 * @param {string} filename
 * @returns {string}
 */
function uniquePath(directory, filename) {
  const safe = sanitizeFilename(filename);
  const extension = path.extname(safe);
  const stem = safe.slice(0, safe.length - extension.length);
  let candidate = path.join(directory, safe);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${stem} (${index})${extension}`);
    index += 1;
    if (index > 500) break;
  }
  return candidate;
}

module.exports = { sanitizeFilename, uniquePath };
