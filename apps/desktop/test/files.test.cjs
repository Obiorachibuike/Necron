const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { sanitizeFilename, uniquePath } = require("../src/lib/files.cjs");

test("strips directory traversal from download names", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("/tmp/report.pdf"), "report.pdf");
  assert.equal(sanitizeFilename("..\\..\\windows\\system32\\evil.exe"), "evil.exe");
});

test("replaces characters that are invalid on Windows", () => {
  assert.equal(sanitizeFilename('cv<>:"|?*.pdf'), "cv_______.pdf");
});

test("falls back to a generated name", () => {
  assert.match(sanitizeFilename(""), /^careerpilot-download-\d+$/);
  assert.match(sanitizeFilename("..."), /^careerpilot-download-\d+$/);
});

test("keeps names under a sane length", () => {
  const name = sanitizeFilename(`${"a".repeat(500)}.pdf`);
  assert.ok(name.length <= 180);
});

test("avoids overwriting an existing download", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "careerpilot-dl-"));
  const first = path.join(directory, "cv.pdf");
  fs.writeFileSync(first, "one");
  assert.equal(uniquePath(directory, "cv.pdf"), path.join(directory, "cv (1).pdf"));
  fs.writeFileSync(path.join(directory, "cv (1).pdf"), "two");
  assert.equal(uniquePath(directory, "cv.pdf"), path.join(directory, "cv (2).pdf"));
});

test("sanitises while resolving a unique path", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "careerpilot-dl-"));
  const resolved = uniquePath(directory, "../../evil.pdf");
  assert.equal(path.dirname(resolved), directory);
  assert.equal(path.basename(resolved), "evil.pdf");
});
