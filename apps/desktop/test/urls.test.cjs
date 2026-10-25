const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deepLinkServer,
  findProtocolArgument,
  healthUrl,
  isSameOrigin,
  normalizeServerUrl,
  parseExternalUrl,
  startPathForUser,
  workspaceUrl,
} = require("../src/lib/urls.cjs");

test("accepts https workspace roots", () => {
  assert.deepEqual(normalizeServerUrl("https://careers.example.com"), {
    ok: true,
    url: "https://careers.example.com",
  });
});

test("normalises case and trailing slash", () => {
  assert.deepEqual(normalizeServerUrl("HTTPS://Careers.Example.COM/"), {
    ok: true,
    url: "https://careers.example.com",
  });
});

test("adds https to a bare hostname", () => {
  assert.deepEqual(normalizeServerUrl("careers.example.com"), {
    ok: true,
    url: "https://careers.example.com",
  });
});

test("defaults loopback hosts to http", () => {
  assert.deepEqual(normalizeServerUrl("localhost:3000"), {
    ok: true,
    url: "http://localhost:3000",
  });
  assert.deepEqual(normalizeServerUrl("127.0.0.1:3000"), {
    ok: true,
    url: "http://127.0.0.1:3000",
  });
});

test("rejects empty input", () => {
  assert.equal(normalizeServerUrl("   ").ok, false);
  assert.equal(normalizeServerUrl(null).ok, false);
});

test("rejects non-http protocols", () => {
  const result = normalizeServerUrl("file:///etc/passwd");
  assert.equal(result.ok, false);
  assert.match(result.error, /http/i);
});

test("rejects credentials in the URL", () => {
  const result = normalizeServerUrl("https://user:pass@example.com");
  assert.equal(result.ok, false);
  assert.match(result.error, /credentials/i);
});

test("rejects sub-paths so app routes resolve from the root", () => {
  const result = normalizeServerUrl("https://example.com/careerpilot");
  assert.equal(result.ok, false);
  assert.match(result.error, /root/i);
});

test("rejects query strings and fragments", () => {
  assert.equal(normalizeServerUrl("https://example.com/?x=1").ok, false);
  assert.equal(normalizeServerUrl("https://example.com/#top").ok, false);
});

test("rejects overlong input", () => {
  const result = normalizeServerUrl(`https://example.com/${"a".repeat(2100)}`);
  assert.equal(result.ok, false);
});

test("builds the health and workspace URLs", () => {
  assert.equal(healthUrl("https://example.com"), "https://example.com/api/v1/health");
  assert.equal(healthUrl("https://example.com/"), "https://example.com/api/v1/health");
  assert.equal(workspaceUrl("https://example.com/", "/dashboard"), "https://example.com/dashboard");
});

test("workspaceUrl refuses protocol-relative and relative paths", () => {
  assert.throws(() => workspaceUrl("https://example.com", "dashboard"));
  assert.throws(() => workspaceUrl("https://example.com", "//evil.example"));
});

test("same-origin checks are strict", () => {
  assert.equal(isSameOrigin("https://example.com", "https://example.com/dashboard"), true);
  assert.equal(isSameOrigin("https://example.com", "https://example.com.evil.test/"), false);
  assert.equal(isSameOrigin("https://example.com", "http://example.com/"), false);
  assert.equal(isSameOrigin("https://example.com", "not a url"), false);
});

test("external links allow http, https and mailto only", () => {
  assert.equal(parseExternalUrl("https://example.com/a").ok, true);
  assert.equal(parseExternalUrl("mailto:support@example.com").ok, true);
  assert.equal(parseExternalUrl("javascript:alert(1)").ok, false);
  assert.equal(parseExternalUrl("file:///etc/passwd").ok, false);
  assert.equal(parseExternalUrl("").ok, false);
});

test("deep links carry an optional server", () => {
  assert.equal(
    deepLinkServer("careerpilot://open?server=https%3A%2F%2Fcareers.example.com"),
    "https://careers.example.com"
  );
  assert.equal(deepLinkServer("careerpilot://open"), null);
  assert.equal(deepLinkServer("https://example.com"), null);
  assert.equal(deepLinkServer("not a url"), null);
});

test("finds the protocol argument on a command line", () => {
  const argv = ["/opt/CareerPilot/careerpilot", "--flag", "careerpilot://open?server=x"];
  assert.equal(findProtocolArgument(argv), "careerpilot://open?server=x");
  assert.equal(findProtocolArgument(["--no-sandbox"]), null);
  assert.equal(findProtocolArgument(undefined), null);
});

test("post-auth routing respects onboarding", () => {
  assert.equal(startPathForUser({ onboarding_completed: true }), "/dashboard");
  assert.equal(startPathForUser({ onboarding_completed: false }), "/onboarding");
  assert.equal(startPathForUser(null), "/onboarding");
});
