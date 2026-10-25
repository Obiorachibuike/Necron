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
} from "./common.js";

platformClass();

const retryButton = $("#retry-button");
const browserButton = $("#browser-button");
const changeButton = $("#change-button");
const logsButton = $("#logs-button");
const settingsButton = $("#settings-button");
const docsButton = $("#docs-button");
const address = $("#offline-address");
const version = $("#offline-version");
const versionNote = $("#version-note");
const statusBox = $("#offline-status");
const errorTitle = $("#error-title");
const errorDetail = $("#error-detail");

let state = null;

function applyState(next) {
  state = next;
  const configured = Boolean(state?.serverUrl);
  setText(address, configured ? state.serverUrl : "not connected");
  setText(
    version,
    `${state?.version ?? "—"} on ${platformLabel(state?.platform)}` +
      (state?.packaged ? "" : " · development build")
  );
  setText(versionNote, state ? `Version ${state.version}` : "Version —");
  browserButton.disabled = !configured;
  setBusy(retryButton, false);
  if (state?.lastError) {
    setText(errorTitle, "The workspace did not respond");
    setText(errorDetail, state.lastError);
  } else {
    setText(errorTitle, "The workspace did not respond");
    setText(errorDetail, "Check the address and your connection, then retry.");
  }
}

retryButton?.addEventListener("click", async () => {
  if (!desktop) return;
  setBusy(retryButton, true, "Retrying…");
  setStatus(
    statusBox,
    "warning",
    "Contacting the workspace…",
    "Checking the health endpoint and reloading the app if it answers."
  );
  try {
    const result = await desktop.retry();
    if (!result?.ok) {
      setStatus(
        statusBox,
        "error",
        "Still unreachable",
        result?.error || "The server did not answer the health check."
      );
      setText(errorTitle, "Still unreachable");
      setText(errorDetail, result?.error || "The server did not answer the health check.");
    } else {
      setStatus(statusBox, "success", "Reconnected", "Loading your workspace…");
    }
  } catch (error) {
    setStatus(statusBox, "error", "Retry failed", cleanError(error));
  } finally {
    setBusy(retryButton, false);
  }
});

browserButton?.addEventListener("click", () => {
  if (!desktop || !state?.serverUrl) return;
  void desktop.openExternal(state.serverUrl);
});
changeButton?.addEventListener("click", () => void desktop?.openWelcome());
logsButton?.addEventListener("click", () => void desktop?.openLogs());
settingsButton?.addEventListener("click", () => void desktop?.openSettings());
docsButton?.addEventListener("click", async () => {
  if (!desktop) return;
  const current = await desktop.getState();
  void desktop.openExternal(current?.links?.docs ?? "https://github.com/Obiorachibuike/Necron");
});

desktop
  ?.getState()
  .then(applyState)
  .catch(() => undefined);
desktop?.onState(applyState);

// A timestamp helps support distinguish "just failed" from "failed an hour ago".
if (desktop) {
  const stamp = document.createElement("p");
  stamp.className = "hint";
  stamp.id = "offline-time";
  stamp.textContent = `This screen appeared ${formatDate(new Date().toISOString())}.`;
  $("#main")?.appendChild(stamp);
}
