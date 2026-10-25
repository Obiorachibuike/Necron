/**
 * Notification helpers. The shell polls the workspace notification feed and raises
 * native toasts only for genuinely new, unread items. Pure selection logic lives here
 * so it can be unit tested.
 */

/**
 * @param {Array<{id: string, title?: string, body?: string, link?: string,
 *                read_at?: string | null, created_at?: string}>} items
 * @param {string | null} since ISO timestamp of the previous poll baseline
 * @param {string[]} seen previously delivered notification ids
 * @returns {Array<object>} items to surface now (oldest first)
 */
function pickFreshNotifications(items, since, seen = []) {
  if (!Array.isArray(items) || !since) return [];
  const baseline = Date.parse(since);
  if (!Number.isFinite(baseline)) return [];
  const seenSet = new Set(Array.isArray(seen) ? seen : []);

  return items
    .filter((item) => {
      if (!item || typeof item.id !== "string") return false;
      if (item.read_at) return false;
      if (seenSet.has(item.id)) return false;
      const created = Date.parse(item.created_at ?? "");
      return Number.isFinite(created) && created > baseline;
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(0, 3);
}

/**
 * @param {number} unread
 * @returns {string}
 */
function trayTooltip(unread) {
  if (!Number.isFinite(unread) || unread <= 0) return "CareerPilot";
  return `CareerPilot — ${unread} unread notification${unread === 1 ? "" : "s"}`;
}

/**
 * @param {number} percent
 * @returns {string}
 */
function describeDownload(percent) {
  if (!Number.isFinite(percent) || percent <= 0) return "Downloading update…";
  return `Downloading update — ${Math.round(percent)}%`;
}

module.exports = { describeDownload, pickFreshNotifications, trayTooltip };
