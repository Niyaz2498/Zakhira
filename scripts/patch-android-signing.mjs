#!/usr/bin/env node
// Injects a release signing config into the Gradle project that `expo prebuild`
// generates.
//
// apps/mobile/android/ is generated, not committed (CNG), so the stock template
// comes back on every prebuild with `release { signingConfig signingConfigs.debug }`
// — i.e. signed with the public React Native debug key. CI runs this right after
// prebuild to point release builds at the real keystore instead.
//
//   node scripts/patch-android-signing.mjs
//
// Credentials are read from Gradle properties, never hardcoded here. When those
// properties are absent (a plain local build) the release type falls back to the
// debug key exactly as before, so this is safe to run on a dev machine.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gradlePath = join(root, "apps/mobile/android/app/build.gradle");

if (!existsSync(gradlePath)) {
  console.error(`${gradlePath} not found — run \`expo prebuild\` first`);
  process.exit(1);
}

let gradle = readFileSync(gradlePath, "utf8");

const MARKER = "ZAKHIRA_UPLOAD_STORE_FILE";
if (gradle.includes(MARKER)) {
  console.log("build.gradle already carries the release signing config — nothing to do");
  process.exit(0);
}

// 1. Add a `release` entry alongside the generated `debug` one.
const releaseSigningConfig = `    signingConfigs {
        release {
            if (project.hasProperty('${MARKER}')) {
                storeFile file(${MARKER})
                storePassword ZAKHIRA_UPLOAD_STORE_PASSWORD
                keyAlias ZAKHIRA_UPLOAD_KEY_ALIAS
                keyPassword ZAKHIRA_UPLOAD_KEY_PASSWORD
            }
        }
`;

const signingConfigsHead = /^\s*signingConfigs \{\n/m;
if (!signingConfigsHead.test(gradle)) {
  console.error("could not find the signingConfigs block — the Expo template changed");
  process.exit(1);
}
gradle = gradle.replace(signingConfigsHead, releaseSigningConfig);

// 2. Point the release build type at it, keeping the debug key as the fallback
//    so `./gradlew assembleRelease` still works with no credentials present.
const debugSigningInRelease =
  /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/m;
if (!debugSigningInRelease.test(gradle)) {
  console.error("could not find the release buildType's signingConfig — the Expo template changed");
  process.exit(1);
}
gradle = gradle.replace(
  debugSigningInRelease,
  `$1signingConfig project.hasProperty('${MARKER}') ? signingConfigs.release : signingConfigs.debug`,
);

writeFileSync(gradlePath, gradle);
console.log("patched apps/mobile/android/app/build.gradle with the release signing config");
