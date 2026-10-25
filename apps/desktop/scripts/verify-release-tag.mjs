#!/usr/bin/env node
/**
 * Fail a tagged release when the tag and the desktop package version disagree.
 * electron-updater derives the update channel from both, so a mismatch would ship
 * an installer that never sees its own updates.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tag = process.env.GITHUB_REF_NAME ?? process.argv[2] ?? "";
const packagePath = resolve(process.cwd(), "package.json");
const { version } = JSON.parse(readFileSync(packagePath, "utf8"));

if (!tag) {
  console.log(`No tag supplied; package version is ${version}. Nothing to verify.`);
  process.exit(0);
}

const expected = tag.startsWith("v") ? tag.slice(1) : tag;
if (expected !== version) {
  console.error(
    `Release tag ${tag} does not match apps/desktop/package.json (${version}).\n` +
      `Bump the desktop version (and apps/web/src/lib/desktop.ts) before tagging.`
  );
  process.exit(1);
}

console.log(`Tag ${tag} matches desktop version ${version}.`);
