#!/usr/bin/env node
// Writes one semver into every place Zakhira defines a version.
//
// The git tag (vX.Y.Z) is the source of truth; CI runs this immediately after
// checkout so that every build artifact agrees on the number. Run it locally the
// same way to preview what a release would change:
//
//   node scripts/set-version.mjs 1.4.0
//
// Android versionCode is derived, not stored — see versionCodeFor() below.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: node scripts/set-version.mjs <X.Y.Z>");
  process.exit(1);
}

const [major, minor, patch] = version.split(".").map(Number);

// Android requires versionCode to strictly increase, forever. Deriving it from
// the semver (rather than using the CI run number) keeps releases deterministic:
// re-running a failed release job rebuilds an identical APK instead of minting a
// new build number. The tradeoff is the ceiling asserted below.
function versionCodeFor(ma, mi, pa) {
  if (mi > 99 || pa > 99) {
    throw new Error(
      `minor and patch must stay below 100 for the versionCode scheme (got ${version})`,
    );
  }
  return ma * 10000 + mi * 100 + pa;
}

const versionCode = versionCodeFor(major, minor, patch);

const edits = [];

function editJson(relPath, mutate) {
  const abs = join(root, relPath);
  const json = JSON.parse(readFileSync(abs, "utf8"));
  mutate(json);
  writeFileSync(abs, JSON.stringify(json, null, 2) + "\n");
  edits.push(relPath);
}

function editText(relPath, mutate) {
  const abs = join(root, relPath);
  const before = readFileSync(abs, "utf8");
  const after = mutate(before);
  if (before === after) throw new Error(`no version field matched in ${relPath}`);
  writeFileSync(abs, after);
  edits.push(relPath);
}

// ── JS packages ─────────────────────────────────────────────────────────────
// packages/core and packages/ui are internal and consumed as `workspace:*`;
// they intentionally keep their own version and are not touched here.
for (const pkg of ["package.json", "apps/desktop/package.json", "apps/mobile/package.json"]) {
  editJson(pkg, (j) => {
    j.version = version;
  });
}

// ── Expo ────────────────────────────────────────────────────────────────────
// Written before `expo prebuild` runs, so the generated android/ picks both up
// and no generated Gradle file needs patching for versions.
editJson("apps/mobile/app.json", (j) => {
  j.expo.version = version;
  j.expo.android = { ...j.expo.android, versionCode };
});

// ── Tauri ───────────────────────────────────────────────────────────────────
editJson("apps/desktop/src-tauri/tauri.conf.json", (j) => {
  j.version = version;
});

// Only the [package] version at the top of the manifest, never a dependency's.
editText("apps/desktop/src-tauri/Cargo.toml", (s) =>
  s.replace(/^(\[package\][\s\S]*?^version\s*=\s*)"[^"]*"/m, `$1"${version}"`),
);

// Keep the lockfile in step so the build doesn't dirty the tree.
editText("apps/desktop/src-tauri/Cargo.lock", (s) =>
  s.replace(
    /(\[\[package\]\]\nname = "zakhira"\nversion = )"[^"]*"/,
    `$1"${version}"`,
  ),
);

console.log(`version ${version}  ·  android versionCode ${versionCode}`);
for (const e of edits) console.log(`  updated ${e}`);
