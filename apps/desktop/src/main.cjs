/**
 * CareerPilot Desktop — Electron main process.
 *
 * The desktop app is a native shell around your CareerPilot workspace. It owns the
 * window, tray, menus, deep links, downloads, notifications and auto-updates; the
 * workspace itself (auth, matching, studio, tracker) runs on the server you connect
 * to, so every feature available on the web is available here without a second
 * implementation drifting out of date.
 */
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  screen,
  session,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");

const {
  deepLinkServer,
  findProtocolArgument,
  healthUrl,
  isSameOrigin,
  normalizeServerUrl,
  parseExternalUrl,
  startPathForUser,
  workspaceUrl,
} = require("./lib/urls.cjs");
const { loadSettings, saveSettings } = require("./lib/config.cjs");
const { pickFreshNotifications, trayTooltip, describeDownload } = require("./lib/notifications.cjs");
const { uniquePath } = require("./lib/files.cjs");

const APP_NAME = "CareerPilot";
const APP_ID = "ai.careerpilot.desktop";
const PROTOCOL = "careerpilot";
const REPO_URL = "https://github.com/Obiorachibuike/Necron";
const DOCS_URL = `${REPO_URL}#local-development`;
const ISSUES_URL = `${REPO_URL}/issues`;
const SESSION_PARTITION = "persist:careerpilot";
const RENDERER_DIR = path.join(__dirname, "renderer");
const BUILD_DIR = path.join(__dirname, "..", "build");
const IS_DEV = !app.isPackaged;
const POLL_INTERVAL_MS = 60_000;
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

let settings = null;
let settingsFile = "";
let logFile = "";
let mainWindow = null;
let welcomeWindow = null;
let settingsWindow = null;
let tray = null;
let mainSession = null;
let pollTimer = null;
let updateTimer = null;
let startupUpdateTimer = null;
let notificationTimer = null;
let unreadCount = 0;
let isQuitting = false;
let mainOpening = false;
let lastError = "";
let loadTimeout = null;
let boundsSaveTimer = null;
let pendingDeepLink = null;
let manualUpdateCheck = false;
let updateState = {
  status: "idle",
  version: null,
  message: "",
  percent: null,
  checkedAt: null,
};
const liveNotifications = [];

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level, message, error) {
  const suffix = error instanceof Error ? ` — ${error.message}` : error ? ` — ${String(error)}` : "";
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}\n`;
  try {
    if (logFile) fs.appendFileSync(logFile, line);
  } catch {
    /* logging must never take the app down */
  }
  const output = level === "error" ? console.error : console.log;
  output(`[careerpilot] ${message}${suffix}`);
}

function openExternalSafe(url) {
  return shell.openExternal(url).catch((error) => log("warn", `Could not open ${url}`, error));
}

function loadWindow(window, url) {
  if (!window || window.isDestroyed()) return Promise.resolve();
  return window.loadURL(url).catch((error) => {
    if (error && String(error.message || "").includes("ERR_ABORTED")) return;
    log("warn", `Navigation failed: ${url}`, error);
    if (window === mainWindow) showOffline(describeLoadError({ errorDescription: error.message }));
  });
}

function initLogger() {
  const directory = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(directory, { recursive: true });
  logFile = path.join(directory, "desktop.log");
  try {
    const stat = fs.statSync(logFile);
    if (stat.size > 1_500_000) {
      fs.renameSync(logFile, path.join(directory, "desktop.previous.log"));
    }
  } catch {
    /* no log yet */
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function persistSettings() {
  try {
    settings = saveSettings(settingsFile, settings);
  } catch (error) {
    log("error", "Could not save desktop settings", error);
  }
}

function applyLoginItem() {
  if (process.platform === "linux") return;
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(settings.launchAtLogin) });
  } catch (error) {
    log("warn", "Could not update launch-at-login setting", error);
  }
}

function publicState() {
  return {
    appName: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    serverUrl: settings?.serverUrl ?? "",
    configured: Boolean(settings?.serverUrl),
    notificationsEnabled: settings?.notificationsEnabled ?? true,
    launchAtLogin: settings?.launchAtLogin ?? false,
    launchAtLoginSupported: process.platform !== "linux",
    lastError,
    unread: unreadCount,
    update: updateState,
    versions: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
    },
    links: {
      repo: REPO_URL,
      docs: DOCS_URL,
      issues: ISSUES_URL,
    },
    logFile,
  };
}

function broadcastState() {
  const state = publicState();
  for (const window of BrowserWindow.getAllWindows()) {
    const url = window.webContents.getURL();
    if (url.startsWith("file://")) window.webContents.send("cp:state", state);
  }
}

// ---------------------------------------------------------------------------
// Server probing
// ---------------------------------------------------------------------------

/**
 * Fetch through the workspace session, not Electron's default session. Cookies from
 * the signed-in window live in the persist:careerpilot partition, so a plain
 * net.fetch() would always look signed out.
 */
async function sessionFetch(url, init = {}) {
  if (mainSession) return mainSession.fetch(url, init);
  return net.fetch(url, init);
}

/**
 * @param {string} serverUrl normalized base URL
 * @returns {Promise<{ok: true, app: string, environment: string} | {ok: false, error: string}>}
 */
async function probeServer(serverUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await net.fetch(healthUrl(serverUrl), {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error:
          `The server answered HTTP ${response.status}. ` +
          "Check that this is the CareerPilot web address and that the API is running.",
      };
    }
    const data = await response.json().catch(() => null);
    if (!data || data.status !== "ok") {
      return {
        ok: false,
        error: "That address responded, but not as a CareerPilot server (no health check).",
      };
    }
    return {
      ok: true,
      app: typeof data.app === "string" ? data.app : APP_NAME,
      environment: typeof data.environment === "string" ? data.environment : "unknown",
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return { ok: false, error: "The server took too long to respond. Check the address and try again." };
    }
    log("warn", `Health check failed for ${serverUrl}`, error);
    return {
      ok: false,
      error:
        "Could not reach that address. Check the URL, your connection, and the server's " +
        "CP_ALLOWED_HOSTS setting.",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkServerInput(raw) {
  const parsed = normalizeServerUrl(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error, serverUrl: "" };
  const result = await probeServer(parsed.url);
  if (!result.ok) return { ok: false, error: result.error, serverUrl: parsed.url };
  return {
    ok: true,
    serverUrl: parsed.url,
    app: result.app,
    environment: result.environment,
    insecure: parsed.url.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(parsed.url),
  };
}

async function resolveStartUrl() {
  const server = settings.serverUrl;
  try {
    const response = await sessionFetch(workspaceUrl(server, "/api/v1/auth/me"), {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      const user = await response.json().catch(() => null);
      return workspaceUrl(server, startPathForUser(user));
    }
  } catch {
    /* signed out or offline — the caller already probed health */
  }
  return workspaceUrl(server, "/sign-in");
}

// ---------------------------------------------------------------------------
// Window utilities
// ---------------------------------------------------------------------------

function windowBoundsForDisplay() {
  const saved = settings.windowBounds;
  if (saved) {
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      const overlapX = Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x);
      const overlapY = Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y);
      return overlapX > 120 && overlapY > 80;
    });
    if (visible) {
      return {
        x: saved.x,
        y: saved.y,
        width: Math.max(900, saved.width),
        height: Math.max(600, saved.height),
        maximized: saved.maximized,
      };
    }
  }
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1380, Math.max(900, area.width - 120));
  const height = Math.min(920, Math.max(640, area.height - 100));
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
    maximized: false,
  };
}

function persistBounds(window) {
  if (!window || window.isDestroyed() || window.isFullScreen()) return;
  const normal = window.getNormalBounds();
  settings.windowBounds = { ...normal, maximized: window.isMaximized() };
  persistSettings();
}

function trackBounds(window) {
  const schedule = () => {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(() => persistBounds(window), 700);
  };
  window.on("resize", schedule);
  window.on("move", schedule);
  window.on("maximize", schedule);
  window.on("unmaximize", schedule);
  window.on("close", () => persistBounds(window));
}

function localWindowOptions(extra = {}) {
  return {
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#080b09" : "#f7f9f6",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: IS_DEV,
    },
    ...extra,
  };
}

function openWelcome() {
  if (!settings) return;
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.show();
    welcomeWindow.focus();
    broadcastState();
    return;
  }
  const bounds = windowBoundsForDisplay();
  welcomeWindow = new BrowserWindow(
    localWindowOptions({
      width: 960,
      height: 700,
      minWidth: 780,
      minHeight: 620,
      x: bounds.x + 40,
      y: bounds.y + 30,
      title: `Connect workspace — ${APP_NAME}`,
      maximizable: false,
      center: true,
    })
  );
  welcomeWindow.loadFile(path.join(RENDERER_DIR, "welcome.html"));
  welcomeWindow.once("ready-to-show", () => welcomeWindow?.show());
  welcomeWindow.on("closed", () => {
    welcomeWindow = null;
  });
  log("info", "Opened connect-workspace window");
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    broadcastState();
    return;
  }
  const bounds = windowBoundsForDisplay();
  settingsWindow = new BrowserWindow(
    localWindowOptions({
      width: 880,
      height: 760,
      minWidth: 720,
      minHeight: 600,
      x: bounds.x + 60,
      y: bounds.y + 40,
      title: `Desktop settings — ${APP_NAME}`,
      center: true,
    })
  );
  settingsWindow.loadFile(path.join(RENDERER_DIR, "settings.html"));
  settingsWindow.once("ready-to-show", () => settingsWindow?.show());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  broadcastState();
}

function closeWelcome() {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close();
  welcomeWindow = null;
}

function focusMain() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return true;
  }
  return false;
}

function navigateWorkspace(pathname) {
  if (!settings.serverUrl) {
    openWelcome();
    return;
  }
  if (!focusMain() || !mainWindow) {
    void openMain({ path: pathname });
    return;
  }
  void loadWindow(mainWindow, workspaceUrl(settings.serverUrl, pathname));
}

function openInBrowser() {
  if (!settings.serverUrl) return;
  void openExternalSafe(settings.serverUrl);
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function clearLoadTimeout() {
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = null;
}

function showOffline(message) {
  clearLoadTimeout();
  lastError = message || "The workspace could not be reached.";
  if (!mainWindow || mainWindow.isDestroyed()) return;
  log("warn", "Showing offline screen", lastError);
  mainWindow.loadFile(path.join(RENDERER_DIR, "offline.html"));
  broadcastState();
}

function describeLoadError(event) {
  if (event.errorDescription) return event.errorDescription;
  const messages = {
    "-105": "The server name could not be resolved. Check the address and your connection.",
    "-106": "This device appears to be offline.",
    "-102": "The connection was refused. Is the server running?",
    "-118": "The connection timed out.",
    "-201": "The server's certificate could not be verified.",
    "-202": "The server's certificate is not trusted.",
    "-301": "The server redirected too many times.",
  };
  return messages[String(event.errorCode)] || `The page failed to load (error ${event.errorCode}).`;
}

async function loadRemote(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearLoadTimeout();
  loadTimeout = setTimeout(() => {
    log("warn", `Page load timed out: ${url}`);
    showOffline("The workspace took too long to load. Check the server and retry.");
  }, 30_000);
  try {
    await mainWindow.loadURL(url);
  } catch (error) {
    // did-fail-load normally handles this; keep a fallback for aborted loads.
    if (error && !String(error.message || "").includes("ERR_ABORTED")) {
      log("warn", "loadURL rejected", error);
      showOffline(describeLoadError({ errorDescription: error.message }));
    }
  }
}

function attachMainWindowHandlers(window) {
  const webContents = window.webContents;

  webContents.setWindowOpenHandler(({ url }) => {
    if (settings.serverUrl && isSameOrigin(settings.serverUrl, url)) {
      void loadWindow(window, url);
      return { action: "deny" };
    }
    const external = parseExternalUrl(url);
    if (external.ok) void openExternalSafe(external.url);
    return { action: "deny" };
  });

  webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return;
    if (settings.serverUrl && isSameOrigin(settings.serverUrl, url)) return;
    event.preventDefault();
    const external = parseExternalUrl(url);
    if (external.ok) void openExternalSafe(external.url);
  });

  webContents.on("will-redirect", (event, url) => {
    if (url.startsWith("file://")) return;
    if (settings.serverUrl && isSameOrigin(settings.serverUrl, url)) return;
    event.preventDefault();
    const external = parseExternalUrl(url);
    if (external.ok) void openExternalSafe(external.url);
  });

  webContents.on("will-attach-webview", (event) => event.preventDefault());

  webContents.on("did-finish-load", () => {
    clearLoadTimeout();
    if (webContents.getURL().startsWith("file://")) return;
    lastError = "";
    broadcastState();
    void refreshNotifications({ silent: true });
  });

  webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3 || validatedURL.startsWith("file://")) return;
    showOffline(describeLoadError({ errorCode, errorDescription }));
  });

  webContents.on("render-process-gone", async (event, details) => {
    log("error", `Renderer gone: ${details.reason}`);
    if (details.reason === "clean-exit") return;
    clearLoadTimeout();
    lastError = "The workspace window stopped unexpectedly.";
    const choice = await dialog.showMessageBox({
      type: "error",
      title: `${APP_NAME} needs to reload`,
      message: "The workspace window stopped unexpectedly.",
      detail: "Your work is saved on the server. Reloading opens it again.",
      buttons: ["Reload", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0 && mainWindow && !mainWindow.isDestroyed()) {
      await openMain({ path: "/dashboard" });
    }
  });

  webContents.on("unresponsive", () => {
    dialog
      .showMessageBox({
        type: "warning",
        title: `${APP_NAME} is not responding`,
        message: "The workspace is taking a long time to respond.",
        detail: "You can wait, or reload the window. Server-side work is not affected.",
        buttons: ["Wait", "Reload"],
        defaultId: 0,
        cancelId: 0,
      })
      .then((result) => {
        if (result.response === 1) webContents.reload();
      });
  });

  webContents.on("before-input-event", (event, input) => {
    // Keep typing shortcuts out of the way; menu accelerators cover reload/zoom.
    if (input.type === "keyDown" && input.key === "F5" && !input.control && !input.meta) {
      event.preventDefault();
      webContents.reload();
    }
  });

  window.on("close", () => persistBounds(window));
  window.on("closed", () => {
    clearLoadTimeout();
    if (mainWindow === window) mainWindow = null;
    // A window closed during startup must not leave a replacement window blocked.
    mainOpening = false;
  });
  trackBounds(window);
}

async function openMain(options = {}) {
  if (!settings.serverUrl) {
    openWelcome();
    return;
  }
  if (mainOpening) return;

  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMain();
    if (options.path) {
      await loadWindow(mainWindow, workspaceUrl(settings.serverUrl, options.path));
    } else if (options.reload || mainWindow.webContents.getURL().startsWith("file://")) {
      const probe = await probeServer(settings.serverUrl);
      if (probe.ok) {
        await loadRemote(await resolveStartUrl());
      } else {
        showOffline(probe.error);
      }
    }
    closeWelcome();
    return;
  }

  mainOpening = true;
  clearLoadTimeout();
  const bounds = windowBoundsForDisplay();
  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: APP_NAME,
    icon: process.platform === "darwin" ? undefined : path.join(BUILD_DIR, "icon.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#080b09" : "#f7f9f6",
    autoHideMenuBar: false,
    webPreferences: {
      partition: SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
      devTools: IS_DEV || process.argv.includes("--devtools"),
      navigateOnDragDrop: false,
    },
  });
  mainWindow = window;
  attachMainWindowHandlers(window);

  try {
    await window.loadFile(path.join(RENDERER_DIR, "loading.html"));
    if (bounds.maximized) window.maximize();
    window.show();
    window.focus();
  } catch (error) {
    log("error", "Could not show loading screen", error);
  }
  closeWelcome();

  const probe = await probeServer(settings.serverUrl);
  if (!probe.ok) {
    showOffline(probe.error);
    mainOpening = false;
    return;
  }

  const target = options.path
    ? workspaceUrl(settings.serverUrl, options.path)
    : await resolveStartUrl();
  await loadRemote(target);
  mainOpening = false;
}
// Ensure the login window closes only after the main window exists.
// ---------------------------------------------------------------------------
// Session (cookies, permissions, downloads)
// ---------------------------------------------------------------------------

function configureSession(ses) {
  const allowed = new Set(["clipboard-sanitized-write"]);
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_webContents, permission) => allowed.has(permission));

  try {
    ses.setSpellCheckerLanguages(["en-US"]);
  } catch {
    /* optional */
  }

  ses.on("will-download", (event, item) => {
    let savePath;
    try {
      savePath = uniquePath(app.getPath("downloads"), item.getFilename() || "careerpilot-download");
    } catch (error) {
      log("error", "Could not resolve downloads folder", error);
      return;
    }
    item.setSavePath(savePath);
    item.once("done", (_event, state) => {
      if (state === "completed") {
        log("info", `Downloaded ${savePath}`);
        if (Notification.isSupported()) {
          const notice = new Notification({
            title: "Download complete",
            body: path.basename(savePath),
            silent: true,
          });
          notice.on("click", () => shell.showItemInFolder(savePath));
          liveNotifications.push(notice);
          notice.show();
        }
      } else if (state === "interrupted") {
        log("warn", `Download interrupted: ${savePath}`);
        dialog.showMessageBox({
          type: "warning",
          title: "Download interrupted",
          message: "The file could not be downloaded completely.",
          detail: path.basename(savePath),
          buttons: ["OK"],
        });
      }
    });
  });
}

async function clearWorkspaceSession(origin = settings.serverUrl) {
  if (!mainSession || !origin) return;
  try {
    await mainSession.clearStorageData({
      origin,
      storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage"],
    });
  } catch (error) {
    log("warn", `Origin-scoped session clear failed for ${origin}`, error);
    try {
      await mainSession.clearStorageData({ storages: ["cookies"] });
    } catch (inner) {
      log("error", "Could not clear session cookies", inner);
    }
  }
  unreadCount = 0;
  app.setBadgeCount(0);
  updateTray();
  settings.lastNotificationPollAt = null;
  settings.seenNotificationIds = [];
  persistSettings();
}

async function signOut() {
  if (!settings.serverUrl) return;
  const parent = focusMain() ? mainWindow : settingsWindow || welcomeWindow;
  const result = await dialog.showMessageBox(parent ?? undefined, {
    type: "question",
    title: "Sign out",
    message: "Sign out of this workspace?",
    detail: "The session is removed from this device. Documents and data stay on the server.",
    buttons: ["Sign out", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (result.response !== 0) return;

  await clearWorkspaceSession();
  log("info", "Signed out of the workspace");
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  if (mainWindow && !mainWindow.isDestroyed()) {
    await loadWindow(mainWindow, workspaceUrl(settings.serverUrl, "/sign-in"));
    lastError = "";
    broadcastState();
  } else {
    await openMain();
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function showNativeNotification(item) {
  if (!Notification.isSupported()) return;
  const notice = new Notification({
    title: item.title || APP_NAME,
    body: item.body || "",
    silent: false,
  });
  notice.on("click", async () => {
    if (!settings.serverUrl) return;
    if (!focusMain()) await openMain();
    const link = typeof item.link === "string" ? item.link : "";
    if (!link || !mainWindow) return;
    if (link.startsWith("/") && !link.startsWith("//")) {
      await loadWindow(mainWindow, workspaceUrl(settings.serverUrl, link));
    } else if (isSameOrigin(settings.serverUrl, link)) {
      await loadWindow(mainWindow, link);
    }
  });
  liveNotifications.push(notice);
  if (liveNotifications.length > 30) liveNotifications.splice(0, liveNotifications.length - 30);
  notice.show();
}

async function refreshNotifications({ silent = false } = {}) {
  if (!settings?.serverUrl || !mainSession) return;
  try {
    const response = await sessionFetch(
      workspaceUrl(settings.serverUrl, "/api/v1/notifications?limit=15"),
      {
        headers: { accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!response.ok) return;
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    unreadCount = Number.isFinite(payload.unread) ? Number(payload.unread) : 0;
    app.setBadgeCount(unreadCount);
    updateTray();

    const shouldToast =
      !silent &&
      settings.notificationsEnabled &&
      Notification.isSupported() &&
      !(mainWindow && mainWindow.isFocused() && !mainWindow.isMinimized());
    if (shouldToast) {
      const fresh = pickFreshNotifications(
        items,
        settings.lastNotificationPollAt,
        settings.seenNotificationIds
      );
      for (const item of fresh) showNativeNotification(item);
    }

    const nowIso = new Date().toISOString();
    settings.lastNotificationPollAt = nowIso;
    const ids = items.map((item) => item && item.id).filter((id) => typeof id === "string");
    settings.seenNotificationIds = [
      ...new Set([...ids, ...settings.seenNotificationIds]),
    ].slice(0, 300);
    persistSettings();
  } catch {
    /* network hiccups are expected; the next poll retries */
  }
}

function startNotificationPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => void refreshNotifications(), POLL_INTERVAL_MS);
  notificationTimer = setTimeout(() => void refreshNotifications(), 12_000);
}

// ---------------------------------------------------------------------------
// Tray and menus
// ---------------------------------------------------------------------------

function trayIcon() {
  try {
    const file = process.platform === "darwin" ? "trayTemplate.png" : "tray.png";
    const image = nativeImage.createFromPath(path.join(BUILD_DIR, file));
    if (image.isEmpty()) return null;
    if (process.platform === "darwin") image.setTemplateImage(true);
    return image;
  } catch (error) {
    log("warn", "Tray icon unavailable", error);
    return null;
  }
}

function trayTemplate() {
  const workspaceItems = settings?.serverUrl
    ? [
        { label: "Dashboard", click: () => navigateWorkspace("/dashboard") },
        { label: "Discover jobs", click: () => navigateWorkspace("/discover") },
        { label: "Applications", click: () => navigateWorkspace("/tracker") },
        { label: "Documents", click: () => navigateWorkspace("/documents") },
        { type: "separator" },
        { label: "Open in browser", click: openInBrowser },
      ]
    : [{ label: "Connect a workspace…", click: openWelcome }];

  return [
    {
      label: unreadCount > 0 ? `Open ${APP_NAME} (${unreadCount} unread)` : `Open ${APP_NAME}`,
      click: () => {
        if (!focusMain()) void openMain();
      },
    },
    ...workspaceItems,
    { type: "separator" },
    { label: "Desktop settings…", click: openSettingsWindow },
    { label: "Check for updates…", click: () => void requestManualUpdateCheck() },
    { type: "separator" },
    { label: `Quit ${APP_NAME}`, click: () => app.quit() },
  ];
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(trayTooltip(unreadCount));
  if (settings) tray.setContextMenu(Menu.buildFromTemplate(trayTemplate()));
}

function createTray() {
  if (tray) return;
  const icon = trayIcon();
  if (!icon) return;
  try {
    tray = new Tray(icon);
    tray.setToolTip(APP_NAME);
    tray.on("click", () => {
      if (!focusMain()) void openMain();
    });
    tray.on("double-click", () => {
      if (!focusMain()) void openMain();
    });
    updateTray();
  } catch (error) {
    log("warn", "System tray is not available on this desktop", error);
  }
}

function workspaceSubmenu() {
  return [
    { label: "Dashboard", accelerator: "CmdOrCtrl+1", click: () => navigateWorkspace("/dashboard") },
    { label: "Discover jobs", accelerator: "CmdOrCtrl+2", click: () => navigateWorkspace("/discover") },
    { label: "Application tracker", accelerator: "CmdOrCtrl+3", click: () => navigateWorkspace("/tracker") },
    { label: "Documents", accelerator: "CmdOrCtrl+4", click: () => navigateWorkspace("/documents") },
    { label: "Career profile", accelerator: "CmdOrCtrl+5", click: () => navigateWorkspace("/profile") },
    { label: "Workspace settings", accelerator: "CmdOrCtrl+6", click: () => navigateWorkspace("/settings") },
    { type: "separator" },
    { label: "Open in browser", click: openInBrowser },
    { type: "separator" },
    { label: "Sign out…", click: () => void signOut() },
  ];
}

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [];

  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Desktop settings…", accelerator: "Cmd+,", click: openSettingsWindow },
        { label: "Check for updates…", click: () => void requestManualUpdateCheck() },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  } else {
    template.push({
      label: "File",
      submenu: [
        { label: "Open workspace", accelerator: "CmdOrCtrl+O", click: () => (focusMain() ? undefined : void openMain()) },
        { type: "separator" },
        { label: "Desktop settings…", accelerator: "CmdOrCtrl+,", click: openSettingsWindow },
        { label: "Connect a different workspace…", click: openWelcome },
        { type: "separator" },
        { label: "Sign out…", click: () => void signOut() },
        { type: "separator" },
        { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    });
  }

  template.push({ role: "editMenu" });

  template.push({
    label: "View",
    submenu: [
      {
        label: "Reload workspace",
        accelerator: "CmdOrCtrl+R",
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
          else void openMain();
        },
      },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      ...(IS_DEV || process.argv.includes("--devtools")
        ? [{ type: "separator" }, { role: "toggleDevTools" }]
        : []),
    ],
  });

  template.push({ label: "Workspace", submenu: workspaceSubmenu() });

  template.push({
    label: "Help",
    submenu: [
      { label: "Desktop guide", click: () => void openExternalSafe(DOCS_URL) },
      { label: "Report an issue", click: () => void openExternalSafe(ISSUES_URL) },
      { label: "Open downloads folder", click: () => void shell.openPath(app.getPath("downloads")) },
      { label: "Show log file", click: () => (logFile ? shell.showItemInFolder(logFile) : undefined) },
      { type: "separator" },
      { label: "Check for updates…", click: () => void requestManualUpdateCheck() },
      ...(isMac ? [] : [{ label: `About ${APP_NAME}`, click: showAbout }]),
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout() {
  dialog.showMessageBox({
    type: "info",
    title: `About ${APP_NAME}`,
    message: `${APP_NAME} Desktop ${app.getVersion()}`,
    detail:
      `A native shell for your CareerPilot workspace.\n\n` +
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}\n\n` +
      `Workspace: ${settings?.serverUrl || "not connected"}`,
    buttons: ["OK"],
  });
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  broadcastState();
}

async function requestManualUpdateCheck() {
  manualUpdateCheck = true;
  if (!app.isPackaged) {
    setUpdateState({
      status: "unavailable",
      message: "Update checks run in installed builds. Development builds are updated from source.",
      checkedAt: new Date().toISOString(),
    });
    await dialog.showMessageBox({
      type: "info",
      title: "Updates",
      message: "You're running a development build.",
      detail: "Install a packaged release to receive automatic updates.",
      buttons: ["OK"],
    });
    manualUpdateCheck = false;
    return updateState;
  }
  setUpdateState({ status: "checking", message: "Checking for updates…", percent: null });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log("warn", "Manual update check failed", error);
    setUpdateState({
      status: "error",
      message: friendlyUpdateError(error),
      checkedAt: new Date().toISOString(),
    });
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      await dialog.showMessageBox({
        type: "error",
        title: "Update check failed",
        message: "Could not check for updates.",
        detail: friendlyUpdateError(error),
        buttons: ["OK"],
      });
    }
  }
  return updateState;
}

function friendlyUpdateError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/latest\.yml|404|Not Found/i.test(message)) {
    return "No published release was found for this version yet.";
  }
  if (/net::|ENOTFOUND|EAI_AGAIN|network/i.test(message)) {
    return "The update server could not be reached. Check your connection.";
  }
  return "The update check failed. Try again later.";
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (message) => log("info", `[updater] ${message}`),
    warn: (message) => log("warn", `[updater] ${message}`),
    error: (message) => log("error", `[updater] ${message}`),
    debug: (message) => log("info", `[updater] ${message}`),
  };

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({ status: "checking", message: "Checking for updates…", percent: null });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateState({
      status: "available",
      version: info?.version ?? null,
      message: `Version ${info?.version ?? ""} is available. Downloading in the background…`,
      checkedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on("update-not-available", async (info) => {
    setUpdateState({
      status: "current",
      version: info?.version ?? app.getVersion(),
      message: "You're on the latest version.",
      checkedAt: new Date().toISOString(),
      percent: null,
    });
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      await dialog.showMessageBox({
        type: "info",
        title: "You're up to date",
        message: `${APP_NAME} Desktop ${app.getVersion()} is the latest version.`,
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    setUpdateState({
      status: "downloading",
      percent: Number(progress?.percent ?? 0),
      message: describeDownload(progress?.percent),
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    setUpdateState({
      status: "downloaded",
      version: info?.version ?? null,
      message: `Version ${info?.version ?? ""} is ready. Restart to install.`,
      percent: 100,
      checkedAt: new Date().toISOString(),
    });
    const wasManual = manualUpdateCheck;
    manualUpdateCheck = false;
    if (wasManual) {
      const result = await dialog.showMessageBox({
        type: "info",
        title: "Update ready",
        message: `${APP_NAME} ${info?.version ?? ""} is ready to install.`,
        detail: "Restart now to finish installing. Open work is saved on the server.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) quitAndInstall();
      return;
    }
    if (Notification.isSupported()) {
      const notice = new Notification({
        title: `${APP_NAME} update ready`,
        body: `Version ${info?.version ?? ""} installs when you restart.`,
      });
      notice.on("click", () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.show();
      });
      liveNotifications.push(notice);
      notice.show();
    }
  });

  autoUpdater.on("error", (error) => {
    log("warn", "Auto-update error", error);
    setUpdateState({
      status: "error",
      message: friendlyUpdateError(error),
      checkedAt: new Date().toISOString(),
    });
  });

  const checkSilently = () => {
    if (!app.isPackaged) return;
    autoUpdater.checkForUpdates().catch((error) => {
      log("info", "Background update check skipped", error);
    });
  };
  startupUpdateTimer = setTimeout(checkSilently, 20_000);
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(checkSilently, UPDATE_INTERVAL_MS);
}

function quitAndInstall() {
  isQuitting = true;
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    log("error", "Could not install update", error);
    app.relaunch();
    app.quit();
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function isLocalSender(event) {
  const url = event.senderFrame?.url ?? "";
  return url.startsWith("file://") && url.includes("/renderer/");
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isLocalSender(event)) {
      log("warn", `Blocked IPC from non-local sender on ${channel}`);
      throw new Error("Not permitted.");
    }
    return fn(event, ...args);
  });
}

function registerIpc() {
  handle("cp:state", () => publicState());

  handle("cp:test-server", async (_event, raw) => checkServerInput(raw));

  handle("cp:save-server", async (_event, raw) => {
    const result = await checkServerInput(raw);
    if (!result.ok) return result;
    const previous = settings.serverUrl;
    const changed = previous !== result.serverUrl;
    // Clear the old origin's cookies before the new address is used, so a session is
    // never replayed against a different workspace.
    if (changed && previous) {
      await clearWorkspaceSession(previous).catch(() => undefined);
      unreadCount = 0;
      try {
        app.setBadgeCount(0);
      } catch {
        /* unsupported platform */
      }
    }
    settings.serverUrl = result.serverUrl;
    settings.lastNotificationPollAt = null;
    settings.seenNotificationIds = [];
    lastError = "";
    persistSettings();
    buildApplicationMenu();
    updateTray();
    broadcastState();
    log("info", `Workspace set to ${result.serverUrl}`);
    await openMain({ reload: changed });
    closeWelcome();
    return { ...result, opened: true };
  });

  handle("cp:open-main", async () => {
    await openMain();
    return publicState();
  });

  handle("cp:open-welcome", () => {
    openWelcome();
    return publicState();
  });

  handle("cp:open-settings", () => {
    openSettingsWindow();
    return publicState();
  });

  handle("cp:retry", async () => {
    if (!settings.serverUrl) {
      openWelcome();
      return { ok: false, error: "No workspace is configured yet." };
    }
    const probe = await probeServer(settings.serverUrl);
    if (!probe.ok) {
      lastError = probe.error;
      broadcastState();
      return { ok: false, error: probe.error };
    }
    lastError = "";
    await loadRemote(await resolveStartUrl());
    return { ok: true };
  });

  handle("cp:open-external", async (_event, raw) => {
    const external = parseExternalUrl(raw);
    if (!external.ok) return { ok: false, error: external.error };
    await openExternalSafe(external.url);
    return { ok: true };
  });

  handle("cp:open-logs", () => {
    if (!logFile) return { ok: false };
    shell.showItemInFolder(logFile);
    return { ok: true };
  });

  handle("cp:set-preference", (_event, key, value) => {
    if (key === "notificationsEnabled" && typeof value === "boolean") {
      settings.notificationsEnabled = value;
      if (!value) app.setBadgeCount(0);
      persistSettings();
      broadcastState();
      return publicState();
    }
    if (key === "launchAtLogin" && typeof value === "boolean") {
      settings.launchAtLogin = value;
      persistSettings();
      applyLoginItem();
      broadcastState();
      return publicState();
    }
    throw new Error("Unknown preference.");
  });

  handle("cp:sign-out", async () => {
    await signOut();
    return publicState();
  });

  handle("cp:check-updates", async () => await requestManualUpdateCheck());

  handle("cp:quit-and-install", () => {
    quitAndInstall();
    return { ok: true };
  });

  handle("cp:open-workspace-route", (_event, route) => {
    if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
      throw new Error("Invalid route.");
    }
    navigateWorkspace(route);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------

async function promptSwitchWorkspace(rawServer) {
  const parsed = normalizeServerUrl(rawServer);
  if (!parsed.ok) return;
  if (!settings.serverUrl) {
    settings.serverUrl = parsed.url;
    persistSettings();
    buildApplicationMenu();
    updateTray();
    await openMain();
    return;
  }
  if (settings.serverUrl === parsed.url) {
    await openMain();
    return;
  }
  const result = await dialog.showMessageBox({
    type: "question",
    title: "Switch workspace",
    message: "Open a different workspace?",
    detail: `This window will connect to ${parsed.url}. Your current server is unchanged.`,
    buttons: ["Switch workspace", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (result.response !== 0) return;
  await clearWorkspaceSession();
  settings.serverUrl = parsed.url;
  settings.lastNotificationPollAt = null;
  settings.seenNotificationIds = [];
  persistSettings();
  buildApplicationMenu();
  updateTray();
  await openMain();
}

async function handleProtocolUrl(raw) {
  if (typeof raw !== "string" || !raw.startsWith(`${PROTOCOL}://`)) return;
  const requested = deepLinkServer(raw);
  if (!requested) {
    focusMain();
    return;
  }
  await promptSwitchWorkspace(requested);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const protocolUrl = findProtocolArgument(argv);
    if (protocolUrl) {
      if (app.isReady()) void handleProtocolUrl(protocolUrl);
      else pendingDeepLink = protocolUrl;
    }
    if (!focusMain()) {
      if (settings?.serverUrl) void openMain();
      else if (app.isReady()) openWelcome();
    }
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (app.isReady()) void handleProtocolUrl(url);
  else pendingDeepLink = url;
});

app.on("before-quit", () => {
  isQuitting = true;
  clearLoadTimeout();
  if (pollTimer) clearInterval(pollTimer);
  if (notificationTimer) clearTimeout(notificationTimer);
  if (updateTimer) clearInterval(updateTimer);
  if (startupUpdateTimer) clearTimeout(startupUpdateTimer);
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  if (settings) persistSettings();
});

app.on("window-all-closed", () => {
  if (isQuitting) return;
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length > 0) {
    focusMain();
    return;
  }
  if (settings?.serverUrl) void openMain();
  else openWelcome();
});

async function bootstrap() {
  initLogger();
  settingsFile = path.join(app.getPath("userData"), "desktop-settings.json");
  settings = loadSettings(settingsFile);
  log("info", `Starting ${APP_NAME} Desktop ${app.getVersion()} on ${process.platform}/${process.arch}`);

  nativeTheme.themeSource = "system";
  mainSession = session.fromPartition(SESSION_PARTITION);
  configureSession(mainSession);

  registerIpc();
  buildApplicationMenu();
  createTray();
  startNotificationPolling();
  setupAutoUpdater();
  applyLoginItem();

  if (process.platform === "darwin") {
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: `© ${new Date().getFullYear()} ${APP_NAME}`,
      website: REPO_URL,
    });
  }

  if (app.isPackaged) {
    try {
      app.setAsDefaultProtocolClient(PROTOCOL);
    } catch (error) {
      log("warn", "Could not register careerpilot:// protocol", error);
    }
  }

  const startupProtocol =
    pendingDeepLink || findProtocolArgument(process.argv) || findProtocolArgument(process.execArgv);
  pendingDeepLink = null;

  if (startupProtocol) {
    await handleProtocolUrl(startupProtocol);
    if (!BrowserWindow.getAllWindows().length) openWelcome();
    return;
  }

  if (settings.serverUrl) await openMain();
  else openWelcome();
}

app.whenReady().then(bootstrap).catch((error) => {
  log("error", "Failed to start", error);
  dialog.showErrorBox(`${APP_NAME} could not start`, String(error?.message ?? error));
  app.quit();
});
