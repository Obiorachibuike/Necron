import {
  $,
  cleanError,
  desktop,
  platformClass,
  setBusy,
  setStatus,
  setText,
} from "./common.js";

platformClass();

const form = $("#connect-form");
const input = $("#server-url");
const testButton = $("#test-button");
const saveButton = $("#save-button");
const settingsButton = $("#settings-button");
const openCurrentButton = $("#open-current");
const localChip = $("#local-chip");
const docsButton = $("#docs-button");
const statusBox = $("#test-status");
const versionNote = $("#version-note");
const insecureNote = $("#insecure-note");

let verifiedUrl = "";
let state = null;
let busy = false;

if (!desktop) {
  setStatus(
    statusBox,
    "error",
    "Desktop bridge unavailable",
    "This page is part of the CareerPilot desktop app and cannot work in a plain browser."
  );
  if (form) form.querySelectorAll("input, button").forEach((element) => (element.disabled = true));
}

function resetVerification() {
  verifiedUrl = "";
  saveButton.disabled = true;
}

function setInsecureVisibility() {
  const value = input.value.trim().toLowerCase();
  const remoteHttp = /^http:\/\//.test(value) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(value);
  insecureNote.hidden = !remoteHttp;
}

async function testConnection() {
  if (!desktop || busy) return;
  const raw = input.value.trim();
  if (!raw) {
    resetVerification();
    input.setAttribute("aria-invalid", "true");
    setStatus(statusBox, "warning", "Enter an address first", "For example https://careers.example.com");
    input.focus();
    return;
  }
  busy = true;
  setBusy(testButton, true, "Testing…");
  setStatus(statusBox, "warning", "Contacting the workspace…", "Checking /api/v1/health on that origin.");
  try {
    const result = await desktop.testServer(raw);
    if (!result?.ok) {
      resetVerification();
      input.setAttribute("aria-invalid", "true");
      setStatus(statusBox, "error", "Could not connect", result?.error || "Unknown error.");
      return;
    }
    input.value = result.serverUrl;
    input.setAttribute("aria-invalid", "false");
    verifiedUrl = result.serverUrl;
    saveButton.disabled = false;
    setStatus(
      statusBox,
      "success",
      `Connected to ${result.app || "CareerPilot"}`,
      `${result.serverUrl} · ${result.environment || "unknown"} environment.` +
        (result.insecure ? " This address is plain http; use it only for local development." : "")
    );
    saveButton.focus();
  } catch (error) {
    resetVerification();
    setStatus(statusBox, "error", "Could not test the address", cleanError(error));
  } finally {
    busy = false;
    setBusy(testButton, false);
  }
}

async function saveWorkspace() {
  if (!desktop || busy || saveButton.disabled) return;
  busy = true;
  setBusy(saveButton, true, "Opening…");
  testButton.disabled = true;
  setStatus(statusBox, "success", "Opening your workspace…", "Loading the app from that server.");
  try {
    const result = await desktop.saveServer(input.value.trim());
    if (!result?.ok) {
      resetVerification();
      setStatus(statusBox, "error", "Could not connect", result?.error || "Unknown error.");
      return;
    }
    setStatus(
      statusBox,
      "success",
      "Workspace saved",
      "This window closes when the main window is ready."
    );
  } catch (error) {
    resetVerification();
    setStatus(statusBox, "error", "Could not save the workspace", cleanError(error));
  } finally {
    busy = false;
    setBusy(saveButton, false);
    testButton.disabled = false;
  }
}

function applyState(nextState) {
  state = nextState;
  setText(versionNote, `Version ${state.version ?? ""} · ${state.platform ?? ""}`);
  if (state.serverUrl && !input.value) input.value = state.serverUrl;
  openCurrentButton.hidden = !state.configured;
  setInsecureVisibility();
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (verifiedUrl && verifiedUrl === input.value.trim()) {
    void saveWorkspace();
  } else {
    void testConnection();
  }
});

input?.addEventListener("input", () => {
  input.setAttribute("aria-invalid", "false");
  if (input.value.trim() !== verifiedUrl) resetVerification();
  setInsecureVisibility();
  if (statusBox.classList.contains("error")) setStatus(statusBox, "", "");
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    input.value = "";
    resetVerification();
    setStatus(statusBox, "", "");
    setInsecureVisibility();
  }
});

saveButton?.addEventListener("click", () => void saveWorkspace());
settingsButton?.addEventListener("click", () => void desktop?.openSettings());
openCurrentButton?.addEventListener("click", () => void desktop?.openMain());
localChip?.addEventListener("click", () => {
  input.value = "http://localhost:3000";
  input.focus();
  resetVerification();
  setInsecureVisibility();
  setStatus(
    statusBox,
    "warning",
    "Local address filled in",
    "Start the backend and web app first, then test the connection."
  );
});
docsButton?.addEventListener("click", () => {
  if (!desktop) return;
  desktop.getState().then((current) => {
    void desktop.openExternal(current?.links?.docs ?? "https://github.com/Obiorachibuike/Necron");
  });
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === ",") {
    event.preventDefault();
    void desktop?.openSettings();
  }
});

void desktop?.getState().then(applyState).catch(() => undefined);
desktop?.onState(applyState);
input?.focus();
