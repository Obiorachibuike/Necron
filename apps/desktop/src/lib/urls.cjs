/**
 * Pure URL helpers used by the desktop shell. Kept dependency-free so they can be
 * unit tested with `node --test` outside Electron.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** @typedef {{ ok: true, url: string } | { ok: false, error: string }} UrlResult */

/**
 * Normalise a workspace base URL. The workspace must be served from the site root:
 * CareerPilot's web app routes assume `/sign-in`, `/dashboard`, etc.
 *
 * @param {unknown} input
 * @returns {UrlResult}
 */
function parseServerUrl(input) {
  if (typeof input !== "string") {
    return { ok: false, error: "Enter your workspace URL." };
  }
  let raw = input.trim();
  if (!raw) return { ok: false, error: "Enter your workspace URL." };
  if (raw.length > 2048) return { ok: false, error: "That URL is too long." };

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    const host = raw.split(/[/?#]/, 1)[0].toLowerCase();
    const hostname = host.replace(/:\d+$/, "");
    const isLoopback = LOOPBACK_HOSTS.has(hostname);
    raw = `${isLoopback ? "http" : "https"}://${raw}`;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, error: "Use an http:// or https:// address." };
  }
  if (!url.hostname) {
    return { ok: false, error: "The URL is missing a hostname." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Don't put credentials in the URL; sign in inside the app." };
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return {
      ok: false,
      error: "Enter the workspace root, for example https://careers.example.com (no path).",
    };
  }
  if (url.search || url.hash) {
    return { ok: false, error: "Remove the query string and fragment from the URL." };
  }

  const normalised = `${url.origin}`;
  return { ok: true, url: normalised };
}

/**
 * @param {string} input
 * @returns {{ ok: true, url: string } | { ok: false, error: string }}
 */
function normalizeServerUrl(input) {
  return parseServerUrl(input);
}

/**
 * @param {string} serverUrl
 * @returns {string}
 */
function healthUrl(serverUrl) {
  return `${serverUrl.replace(/\/+$/, "")}/api/v1/health`;
}

/**
 * @param {string} serverUrl
 * @param {string} candidate
 * @returns {boolean}
 */
function isSameOrigin(serverUrl, candidate) {
  try {
    return new URL(serverUrl).origin === new URL(candidate).origin;
  } catch {
    return false;
  }
}

/**
 * @param {string} serverUrl
 * @param {string} path
 * @returns {string}
 */
function workspaceUrl(serverUrl, path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Workspace paths must be absolute and same-origin.");
  }
  return `${serverUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * Decide whether a link from the app is safe to hand to the OS browser.
 *
 * @param {unknown} input
 * @returns {{ ok: true, url: string } | { ok: false, error: string }}
 */
function parseExternalUrl(input) {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "Empty link." };
  }
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: "Invalid link." };
  }
  if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
    return { ok: false, error: "Only http(s) and mailto links can be opened externally." };
  }
  return { ok: true, url: url.toString() };
}

/**
 * Extract a `careerpilot://` deep link from a command line.
 *
 * @param {string[]} argv
 * @returns {string | null}
 */
function findProtocolArgument(argv) {
  if (!Array.isArray(argv)) return null;
  const match = argv.find((arg) => typeof arg === "string" && /^careerpilot:\/\//i.test(arg));
  return match ?? null;
}

/**
 * @param {string} raw
 * @returns {string | null} requested server URL, or null when absent
 */
function deepLinkServer(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "careerpilot:") return null;
    const server = url.searchParams.get("server");
    return server ? server : null;
  } catch {
    return null;
  }
}

/**
 * Router entry point after sign-in: completed onboarding goes to the dashboard,
 * otherwise the wizard. Kept here so it can be tested without Electron.
 *
 * @param {{ onboarding_completed?: boolean } | null | undefined} user
 * @returns {string}
 */
function startPathForUser(user) {
  return user && user.onboarding_completed ? "/dashboard" : "/onboarding";
}

module.exports = {
  ALLOWED_PROTOCOLS,
  LOOPBACK_HOSTS,
  deepLinkServer,
  findProtocolArgument,
  healthUrl,
  isSameOrigin,
  normalizeServerUrl,
  parseExternalUrl,
  parseServerUrl,
  startPathForUser,
  workspaceUrl,
};
