import {
  $,
  cleanError,
  desktop,
  formatDate,
  platformClass,
  platformLabel,
  setBusy,
  setStatus,
  setText,
  updateSummary,
} from "./common.js";

platformClass();

const elements = {
  headerVersion: $("#header-version"),
  workspacePill: $("#workspace-pill"),
  workspaceAddress: $("#workspace-address"),
  workspaceConnection: $("#workspace-connection"),
  openWorkspace: $("#open-workspace"),
  browser: $("#browser-button"),
  change: $("#change-button"),
  signout: $("#signout-button"),
  platformPill: $("#platform-pill"),
  notifications: $("#notifications-toggle"),
  login: $("#login-toggle"),
  loginHint: $("#login-hint"),
  updatePill: $("#update-pill"),
  updateStatus: $("#update-status"),
  installedVersion: $("#installed-version"),
  lastCheck: $("#last-check"),
  checkButton: $("#check-button"),
  installButton: $("#install-button"),
  logs: $("#logs-button"),
  buildPill: $("#build-pill"),
  aboutApp: $("#about-app"),
  aboutRuntime: $("#about-runtime"),
  aboutPlatform: $("#about-platform"),
  footerPlatform: $("#footer-platform"),
  close: $("#close-button"),
};

let state = null;

function renderWorkspace() {
  const configured = Boolean(state?.serverUrl);
  elements.workspaceAddress.textContent = configured ? state.serverUrl : "not connected";
  elements.workspacePill.textContent = configured ? "Configured" : "Not connected";
  elements.workspacePill.classList.toggle("brand", configured);
  elements.browser.disabled = !configured;
  elements.openWorkspace.disabled = !configured;
  elements.signout.disabled = !configured;

  if (!configured) {
    elements.workspaceConnection.textContent =
      "No workspace has been connected on this device yet.";
    return;
  }
  if (state.lastError) {
    elements.workspaceConnection.textContent = `Last load problem: ${state.lastError}`;
    return;
  }
  elements.workspaceConnection.textContent =
    "Configured. The app checks /api/v1/health each time it opens the window.";
}

function renderToggles() {
  elements.notifications.checked = Boolean(state?.notificationsEnabled);
  elements.login.checked = Boolean(state?.launchAtLogin);
  const supported = state?.launchAtLoginSupported !== false;
  elements.login.disabled = !supported;
  if (!supported) {
    elements.loginHint.textContent =
      "Not supported by every Linux desktop. Use your distribution's autostart settings instead.";
  }
}

function renderUpdates() {
  const update = state?.update ?? { status: "idle" };
  const summary = updateSummary(update, state?.version);
  setStatus(elements.updateStatus, summary.tone || "", summary.title, summary.body);
  elements.updatePill.textContent =
    update.status === "downloaded"
      ? "Ready to install"
      : update.status === "available" || update.status === "downloading"
        ? "Update in progress"
        : update.status === "current"
          ? "Up to date"
          : update.status === "error"
            ? "Check failed"
            : "Automatic";
  elements.updatePill.classList.toggle("brand", update.status === "current");
  elements.updatePill.classList.toggle("warn", ["available", "downloading", "downloaded"].includes(update.status));
  elements.installedVersion.textContent = `${state?.version ?? "—"}${state?.packaged ? "" : " (development)"}`;
  elements.lastCheck.textContent = update.checkedAt ? formatDate(update.checkedAt) : "not checked in this session";
  elements.installButton.hidden = update.status !== "downloaded";
  elements.checkButton.disabled = update.status === "checking" || !state?.packaged;
  elements.checkButton.title = state?.packaged
    ? "Check GitHub Releases for a newer version"
    : "Update checks run in installed builds";
}

function renderAbout() {
  elements.headerVersion.textContent = `Version ${state?.version ?? "—"}`;
  elements.platformPill.textContent = platformLabel(state?.platform);
  elements.buildPill.textContent = state?.packaged ? "Installed" : "Development";
  elements.aboutApp.textContent = `${state?.appName ?? "CareerPilot"} Desktop ${state?.version ?? ""}`.trim();
  elements.aboutRuntime.textContent =
    `Electron ${state?.versions?.electron ?? "?"} · Chromium ${state?.versions?.chromium ?? "?"} · Node ${state?.versions?.node ?? "?"}`;
  elements.aboutPlatform.textContent = `${platformLabel(state?.platform)} · ${state?.arch ?? ""}`;
  elements.footerPlatform.textContent =
    `${platformLabel(state?.platform)} · Electron ${state?.versions?.electron ?? "?"}`;
}

function applyState(next) {
  if (!next) return;
  state = next;
  renderWorkspace();
  renderToggles();
  renderUpdates();
  renderAbout();
}

async function setPreference(key, value) {
  try {
    const result = await desktop.setPreference(key, value);
    if (result) applyState(result);
  } catch (error) {
    setStatus(elements.updateStatus, "error", "Could not save the preference", cleanError(error));
  }
}

elements.notifications?.addEventListener("change", () => {
  void setPreference("notificationsEnabled", elements.notifications.checked);
});
elements.login?.addEventListener("change", () => {
  void setPreference("launchAtLogin", elements.login.checked);
});

elements.openWorkspace?.addEventListener("click", () => void desktop?.openMain());
elements.browser?.addEventListener("click", () => {
  if (state?.serverUrl) void desktop?.openExternal(state.serverUrl);
});
elements.change?.addEventListener("click", () => void desktop?.openWelcome());
elements.signout?.addEventListener("click", async () => {
  setBusy(elements.signout, true, "Signing out…");
  try {
    const result = await desktop.signOut();
    if (result) applyState(result);
  } catch (error) {
    setStatus(elements.updateStatus, "error", "Could not sign out", cleanError(error));
  } finally {
    setBusy(elements.signout, false);
  }
});

elements.checkButton?.addEventListener("click", async () => {
  setBusy(elements.checkButton, true, "Checking…");
  setStatus(elements.updateStatus, "warning", "Checking for updates…", "Contacting the release server.");
  try {
    const result = await desktop.checkUpdates();
    const current = await desktop.getState();
    applyState(current);
    if (result?.status === "unavailable") {
      setStatus(
        elements.updateStatus,
        "warning",
        "Updates need an installed build",
        result.message || "Development builds are updated from source."
      );
    }
  } catch (error) {
    setStatus(elements.updateStatus, "error", "Could not check for updates", cleanError(error));
  } finally {
    setBusy(elements.checkButton, false);
    if (state) renderUpdates();
  }
});

elements.installButton?.addEventListener("click", () => void desktop?.quitAndInstall());
elements.logs?.addEventListener("click", () => void desktop?.openLogs());
elements.close?.addEventListener("click", () => window.close());

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-external]");
  if (!target || !desktop) return;
  const current = state ?? (await desktop.getState());
  const key = target.dataset.external;
  const url = current?.links?.[key];
  if (url) void desktop.openExternal(url);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});

desktop
  ?.getState()
  .then(applyState)
  .catch(() => undefined);
desktop?.onState(applyState);
