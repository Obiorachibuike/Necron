/** Shared helpers for the desktop shell's local windows. */

export const desktop = window.careerpilot ?? null;

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function setText(selector, value) {
  const element = typeof selector === "string" ? $(selector) : selector;
  if (element) element.textContent = value ?? "";
}

export function setStatus(element, tone, title, message) {
  if (!element) return;
  element.classList.remove("success", "error", "warning");
  if (!tone) {
    element.classList.remove("visible");
    return;
  }
  element.classList.add("visible", tone);
  const titleNode = element.querySelector("strong");
  const messageNode = element.querySelector("p");
  if (titleNode) titleNode.textContent = title ?? "";
  if (messageNode) messageNode.textContent = message ?? "";
}

/** Electron prefixes rejected invokes with "Error invoking remote method…". */
export function cleanError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "").trim();
}

export function setBusy(button, busy, labelWhenBusy = "Working…") {
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent.trim();
  button.disabled = Boolean(busy);
  button.textContent = busy ? labelWhenBusy : button.dataset.label;
}

export function platformClass() {
  if (!desktop) return;
  document.documentElement.dataset.platform = desktop.platform;
  if (desktop.platform === "darwin") document.body.classList.add("mac");
}

export function platformLabel(platform) {
  switch (platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform || "this computer";
  }
}

/** "Command" / "Ctrl" hint that matches the platform. */
export function modifierLabel() {
  return desktop?.platform === "darwin" ? "⌘" : "Ctrl";
}

export function formatDate(iso) {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function updateSummary(update, currentVersion) {
  if (!update) return { tone: "", title: "Not checked", body: "Update checks run automatically." };
  switch (update.status) {
    case "checking":
      return { tone: "warning", title: "Checking for updates…", body: "Contacting the release server." };
    case "available":
      return {
        tone: "warning",
        title: `Version ${update.version ?? "new"} found`,
        body: update.message || "Downloading in the background.",
      };
    case "downloading":
      return {
        tone: "warning",
        title: "Downloading update",
        body: update.message || "This can take a minute on slow connections.",
      };
    case "downloaded":
      return {
        tone: "success",
        title: `Version ${update.version ?? "new"} is ready`,
        body: "Restart the app to install it. Your work is saved on the server.",
      };
    case "current":
      return {
        tone: "success",
        title: `Up to date (${currentVersion ?? ""})`,
        body: `Checked ${formatDate(update.checkedAt)}.`,
      };
    case "unavailable":
      return { tone: "warning", title: "Updates unavailable here", body: update.message || "" };
    case "error":
      return {
        tone: "error",
        title: "Could not check for updates",
        body: update.message || "Try again later.",
      };
    default:
      return {
        tone: "",
        title: "Not checked yet",
        body: `You're running ${currentVersion ?? "an installed build"}. Checks happen automatically.`,
      };
  }
}

/** Keep focus ring behaviour consistent inside native windows. */
export function trapTabKey(root) {
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = $$(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      root
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
