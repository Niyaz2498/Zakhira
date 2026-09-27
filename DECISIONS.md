# Decisions

Architectural choices worth remembering, newest first. Each entry records what
was chosen, what it was chosen over, and what would make us revisit it.

---

## 2026-09-26 — Tag-driven releases with self-updating apps

**Decision.** Pushing a `vX.Y.Z` tag builds and publishes both apps to a single
GitHub Release. The Android APK is sideloaded via Obtainium; the macOS app
self-updates via `tauri-plugin-updater`. See [docs/RELEASING.md](docs/RELEASING.md).

### The git tag is the only version

`scripts/set-version.mjs` stamps the tag into all seven places a version lives
(both apps' `package.json`, `app.json`, `tauri.conf.json`, `Cargo.toml`,
`Cargo.lock`, root `package.json`). Nothing is hand-edited, so the artifacts
cannot disagree about what version they are.

Android's `versionCode` is derived as `major*10000 + minor*100 + patch` rather
than taken from the CI run number. Deterministic beats monotonic-by-accident:
re-running a failed job reproduces the same APK instead of burning a build
number. Accepted cost — minor and patch are capped at 99 each, enforced by a
thrown error rather than silent wraparound.

### Artifacts live on the main repo's Releases

The repo is public, so `releases/latest/download/…` resolves anonymously. Both a
separate `zakhira-releases` repo and Cloudflare R2 were considered and rejected:
each solves an access-control problem that does not exist here, while adding a
second publish target to keep in sync.

**Revisit if:** the repo goes private (both updaters break silently — nothing
warns you), or we want update channels / staged rollouts, which GitHub Releases
can't express. R2 plus a hand-written manifest is the fallback in either case.

### Android builds on Gradle, not EAS

CI runs `expo prebuild` then `./gradlew assembleRelease` on `ubuntu-latest`,
avoiding EAS Build quota entirely. `android/` stays generated and gitignored
(CNG), so `scripts/patch-android-signing.mjs` re-injects the release signing
config after every prebuild — the Expo template otherwise signs release builds
with the *public* React Native debug key. The workflow asserts the shipped APK
is not signed with that key and fails if it is.

**Consequence:** the signing key changed. Builds up to 2026-09-20 were signed by
an EAS-managed keystore; releases from here use a self-generated one we hold.
Android refuses cross-key updates, so the first install after this switch
requires uninstalling the old app. Losing the new keystore is unrecoverable —
back it up.

### macOS is Apple Silicon only and unsigned

`--target aarch64-apple-darwin`. A universal build doubles Rust compile time and
bundle size to serve Intel Macs we don't use. There is no Apple Developer ID, so
the app is unsigned and needs one `xattr -dr com.apple.quarantine` (or
right-click → Open) on first install; self-updates after that are unaffected.
The workflow carries a commented block naming the exact secrets to add if we
ever buy a Developer ID.

The updater's own signing keypair is separate from Apple's and **is** in use —
the app rejects any update payload not signed with our private key.
