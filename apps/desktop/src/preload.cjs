/**
 * Preload for the desktop shell's own windows (welcome / settings / offline).
 *
 * Only a small, explicit API is exposed. Remote workspace pages never receive a
 * preload at all, so they cannot reach Node or these channels.
 */
const { contextBridge, ipcRenderer } = require("electron");

const stateListeners = new Set();

ipcRenderer.on("cp:state", (_event, state) => {
  for (const listener of stateListeners) {
    try {
      listener(state);
    } catch {
      /* a broken listener must not break the page */
    }
  }
});

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld("careerpilot", {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  getState: () => invoke("cp:state"),
  testServer: (url) => invoke("cp:test-server", url),
  saveServer: (url) => invoke("cp:save-server", url),
  openMain: () => invoke("cp:open-main"),
  openWelcome: () => invoke("cp:open-welcome"),
  openSettings: () => invoke("cp:open-settings"),
  retry: () => invoke("cp:retry"),
  openExternal: (url) => invoke("cp:open-external", url),
  openLogs: () => invoke("cp:open-logs"),
  setPreference: (key, value) => invoke("cp:set-preference", key, value),
  signOut: () => invoke("cp:sign-out"),
  checkUpdates: () => invoke("cp:check-updates"),
  quitAndInstall: () => invoke("cp:quit-and-install"),
  openWorkspaceRoute: (route) => invoke("cp:open-workspace-route", route),
  onState: (listener) => {
    if (typeof listener !== "function") return () => undefined;
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  },
});
