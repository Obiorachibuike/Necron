/**
 * Main-process smoke test.
 *
 * Electron itself cannot run in CI without a display or the downloaded binary, so this
 * test substitutes a small Electron stub and drives the real main.cjs through its
 * first-run flow: boot -> connect screen -> health check -> save workspace -> main
 * window. It also checks that IPC refuses a non-local sender.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "careerpilot-smoke-"));
const downloads = path.join(userData, "Downloads");
fs.mkdirSync(downloads, { recursive: true });

const handlers = new Map();
const windows = [];

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.url = "";
    this.sent = [];
    this.openHandler = null;
  }
  getURL() {
    return this.url;
  }
  setWindowOpenHandler(handler) {
    this.openHandler = handler;
  }
  send(channel, payload) {
    this.sent.push([channel, payload]);
  }
  reload() {
    this.reloaded = true;
  }
}

class FakeBrowserWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.webContents = new FakeWebContents();
    this.bounds = {
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width ?? 1200,
      height: options.height ?? 800,
    };
    this.destroyed = false;
    windows.push(this);
  }
  static getAllWindows() {
    return windows.filter((window) => !window.destroyed);
  }
  static fromWebContents() {
    return windows.find((window) => !window.destroyed) ?? null;
  }
  loadFile(file) {
    this.webContents.url = pathToFileURL(file).href;
    return Promise.resolve();
  }
  loadURL(url) {
    this.webContents.url = url;
    return Promise.resolve().then(() => {
      this.webContents.emit("did-finish-load");
    });
  }
  show() {
    this.visible = true;
  }
  focus() {}
  isDestroyed() {
    return this.destroyed;
  }
  isMinimized() {
    return false;
  }
  restore() {}
  maximize() {
    this.maximized = true;
  }
  isMaximized() {
    return false;
  }
  isFullScreen() {
    return false;
  }
  getNormalBounds() {
    return this.bounds;
  }
  getBounds() {
    return this.bounds;
  }
  close() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("closed");
  }
}

const fakeSession = new EventEmitter();
fakeSession.setPermissionRequestHandler = () => undefined;
fakeSession.setPermissionCheckHandler = () => undefined;
fakeSession.setSpellCheckerLanguages = () => undefined;
fakeSession.clearStorageData = async () => undefined;
fakeSession.fetch = (url, init) => fakeFetch(url, init);

async function fakeFetch(url) {
  const href = String(url);
  if (href.includes("/api/v1/health")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", app: "CareerPilot AI", environment: "development" }),
    };
  }
  if (href.includes("/api/v1/auth/me")) {
    return { ok: false, status: 401, json: async () => ({}) };
  }
  if (href.includes("/api/v1/notifications")) {
    return { ok: true, status: 200, json: async () => ({ items: [], unread: 0 }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
}

const app = new EventEmitter();
Object.assign(app, {
  isPackaged: false,
  getVersion: () => "1.0.0",
  getPath: (name) => (name === "downloads" ? downloads : userData),
  getAppPath: () => ROOT,
  requestSingleInstanceLock: () => true,
  whenReady: () => Promise.resolve(),
  isReady: () => true,
  quit: () => app.emit("before-quit"),
  relaunch: () => undefined,
  setName: () => undefined,
  setAppUserModelId: () => undefined,
  setBadgeCount: () => undefined,
  setLoginItemSettings: () => undefined,
  setAsDefaultProtocolClient: () => true,
  setAboutPanelOptions: () => undefined,
});

const electronStub = {
  app,
  BrowserWindow: FakeBrowserWindow,
  Menu: { buildFromTemplate: (template) => template, setApplicationMenu: () => undefined },
  Notification: class FakeNotification extends EventEmitter {
    static isSupported() {
      return true;
    }
    show() {}
  },
  Tray: class FakeTray extends EventEmitter {
    setToolTip() {}
    setContextMenu() {}
  },
  dialog: {
    showMessageBox: async () => ({ response: 1 }),
    showErrorBox: () => undefined,
  },
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => false, setTemplateImage: () => undefined }),
  },
  nativeTheme: { shouldUseDarkColors: false, themeSource: "system" },
  net: { fetch: fakeFetch },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
  },
  session: { fromPartition: () => fakeSession },
  shell: {
    openExternal: async () => undefined,
    showItemInFolder: () => undefined,
    openPath: async () => "",
  },
};

const autoUpdater = new EventEmitter();
Object.assign(autoUpdater, {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  logger: null,
  checkForUpdates: async () => null,
  quitAndInstall: () => undefined,
});

function waitFor(predicate, timeout = 2000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (predicate()) return resolve();
      } catch (error) {
        return reject(error);
      }
      if (Date.now() - started > timeout) return reject(new Error("Timed out waiting for condition"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") return electronStub;
  if (request === "electron-updater") return { autoUpdater };
  return originalLoad.call(this, request, parent, isMain);
};

require("../src/main.cjs");

test("first run connects a workspace and opens the main window", async (t) => {
  t.after(() => {
    app.emit("before-quit");
    for (const window of windows) window.close();
  });

  await waitFor(() => handlers.size > 0 && FakeBrowserWindow.getAllWindows().length > 0);
  const welcome = FakeBrowserWindow.getAllWindows()[0];
  assert.match(welcome.webContents.url, /renderer\/welcome\.html$/);

  const localEvent = {
    senderFrame: { url: pathToFileURL(path.join(ROOT, "src", "renderer", "welcome.html")).href },
  };

  const state = await handlers.get("cp:state")(localEvent);
  assert.equal(state.configured, false);
  assert.equal(state.packaged, false);

  const rejected = await handlers.get("cp:test-server")(localEvent, "file:///etc/passwd");
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /http/i);

  const tested = await handlers.get("cp:test-server")(localEvent, "http://localhost:3000");
  assert.equal(tested.ok, true);
  assert.equal(tested.serverUrl, "http://localhost:3000");
  assert.equal(tested.app, "CareerPilot AI");

  const saved = await handlers.get("cp:save-server")(localEvent, "http://localhost:3000");
  assert.equal(saved.ok, true);
  assert.equal(saved.opened, true);

  await waitFor(() =>
    FakeBrowserWindow.getAllWindows().some((window) =>
      window.webContents.url.startsWith("http://localhost:3000/sign-in")
    )
  );

  const settings = JSON.parse(
    fs.readFileSync(path.join(userData, "desktop-settings.json"), "utf8")
  );
  assert.equal(settings.serverUrl, "http://localhost:3000");

  const mainState = await handlers.get("cp:state")(localEvent);
  assert.equal(mainState.configured, true);
  assert.equal(mainState.serverUrl, "http://localhost:3000");

  const remoteEvent = { senderFrame: { url: "https://evil.example/renderer/page.html" } };
  await assert.rejects(
    () => handlers.get("cp:test-server")(remoteEvent, "http://localhost:3000"),
    /Not permitted/
  );

  const external = await handlers.get("cp:open-external")(localEvent, "javascript:alert(1)");
  assert.equal(external.ok, false);

  const current = await handlers.get("cp:state")(localEvent);
  assert.ok("electron" in current.versions);
  assert.equal(current.links.repo, "https://github.com/Obiorachibuike/Necron");
});

test("preferences round-trip through IPC", async () => {
  await waitFor(() => handlers.has("cp:set-preference"));
  const localEvent = {
    senderFrame: { url: pathToFileURL(path.join(ROOT, "src", "renderer", "settings.html")).href },
  };
  const updated = await handlers.get("cp:set-preference")(localEvent, "notificationsEnabled", false);
  assert.equal(updated.notificationsEnabled, false);
  const restored = await handlers.get("cp:set-preference")(localEvent, "notificationsEnabled", true);
  assert.equal(restored.notificationsEnabled, true);
  await assert.rejects(
    () => handlers.get("cp:set-preference")(localEvent, "unknownPreference", true),
    /Unknown preference/
  );
});
