const test = require("node:test");
const assert = require("node:assert/strict");

const {
  describeDownload,
  pickFreshNotifications,
  trayTooltip,
} = require("../src/lib/notifications.cjs");

const baseline = "2026-05-01T10:00:00.000Z";

test("selects only unread notifications newer than the baseline", () => {
  const items = [
    { id: "old", created_at: "2026-05-01T09:00:00.000Z", read_at: null },
    { id: "fresh", created_at: "2026-05-01T10:05:00.000Z", read_at: null },
    { id: "read", created_at: "2026-05-01T10:06:00.000Z", read_at: "2026-05-01T10:07:00.000Z" },
  ];
  const picked = pickFreshNotifications(items, baseline, []);
  assert.deepEqual(picked.map((item) => item.id), ["fresh"]);
});

test("never repeats an id the user has already been told about", () => {
  const items = [{ id: "seen", created_at: "2026-05-01T10:05:00.000Z", read_at: null }];
  assert.deepEqual(pickFreshNotifications(items, baseline, ["seen"]), []);
});

test("returns oldest first and caps the burst", () => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    id: `n${index}`,
    created_at: `2026-05-01T10:0${index}:00.000Z`,
    read_at: null,
  }));
  const picked = pickFreshNotifications(items, baseline, []);
  assert.deepEqual(picked.map((item) => item.id), ["n1", "n2", "n3"]);
});

test("does nothing without a baseline poll", () => {
  const items = [{ id: "n", created_at: "2026-05-01T10:05:00.000Z", read_at: null }];
  assert.deepEqual(pickFreshNotifications(items, null, []), []);
  assert.deepEqual(pickFreshNotifications(items, "not-a-date", []), []);
  assert.deepEqual(pickFreshNotifications(null, baseline, []), []);
});

test("ignores malformed entries", () => {
  const items = [
    { id: 7, created_at: "2026-05-01T10:05:00.000Z", read_at: null },
    { id: "bad-date", created_at: "yesterday", read_at: null },
    { id: "good", created_at: "2026-05-01T10:05:00.000Z", read_at: null },
  ];
  assert.deepEqual(pickFreshNotifications(items, baseline, []).map((item) => item.id), ["good"]);
});

test("tray tooltip is honest about the count", () => {
  assert.equal(trayTooltip(0), "CareerPilot");
  assert.equal(trayTooltip(1), "CareerPilot — 1 unread notification");
  assert.equal(trayTooltip(4), "CareerPilot — 4 unread notifications");
});

test("download progress text has a calm fallback", () => {
  assert.equal(describeDownload(0), "Downloading update…");
  assert.equal(describeDownload(NaN), "Downloading update…");
  assert.equal(describeDownload(42.6), "Downloading update — 43%");
});
