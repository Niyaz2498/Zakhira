# Releasing Zakhira

Zakhira has **two** pipelines, because its two halves ship differently:

| | Trigger | Workflow |
|---|---|---|
| **Apps** (Android + macOS) | push a `vX.Y.Z` tag | [`release.yml`](../.github/workflows/release.yml) |
| **Backend** (Worker + D1) | merge to `main` | [`backend.yml`](../.github/workflows/backend.yml) |

The rest of this section covers the apps. For the backend, skip to
[The backend deploys from main](#the-backend-deploys-from-main).

---

## Releasing the apps

Pushing a git tag builds and publishes both apps. Nothing is built by hand.

```sh
node scripts/set-version.mjs 1.4.0   # optional: preview the version bump locally
git tag v1.4.0
git push origin v1.4.0
```

That triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml), which:

1. Creates a **draft** GitHub Release for the tag.
2. Builds and signs the Android APK on `ubuntu-latest`.
3. Builds the macOS app and updater artifacts on `macos-14` (Apple Silicon).
4. Publishes the release once **both** jobs succeed.

The release stays a draft until both platforms land, so Obtainium and the desktop
updater never see a half-finished release.

---

## The version is the tag

The tag is the single source of truth. `scripts/set-version.mjs` writes it into:

| File | Field |
|---|---|
| `package.json` | `version` |
| `apps/desktop/package.json` | `version` |
| `apps/mobile/package.json` | `version` |
| `apps/mobile/app.json` | `expo.version`, `expo.android.versionCode` |
| `apps/desktop/src-tauri/tauri.conf.json` | `version` |
| `apps/desktop/src-tauri/Cargo.toml` | `[package] version` |
| `apps/desktop/src-tauri/Cargo.lock` | the `zakhira` package entry |

`packages/core` and `packages/ui` are internal and consumed as `workspace:*`, so
they keep their own version and are deliberately left alone.

### Android versionCode

Android requires `versionCode` to strictly increase, forever. It is **derived**
from the semver rather than stored:

```
versionCode = major × 10000 + minor × 100 + patch

v1.4.0  →  10400
v1.4.1  →  10401
v2.0.0  →  20000
```

This was chosen over the CI run number because it is **deterministic** —
re-running a failed release job rebuilds a byte-identical APK instead of minting
a new build number, and the code reads back to a version at a glance. The
tradeoff is a ceiling: **minor and patch must each stay below 100.** The script
throws rather than silently producing a non-increasing code if you cross it.

---

## The backend deploys from main

There is no backend tag. The Worker is a single live deployment, so
[`backend.yml`](../.github/workflows/backend.yml) deploys it whenever `main`
changes under `backend/**` or `packages/core/**`:

1. **check** — typecheck, build the Worker bundle, and apply every migration to
   an empty database. Runs on PRs too, and gates the deploy.
2. **deploy** — apply pending migrations to production D1, `wrangler deploy`,
   then smoke-test `/health`.

Nothing deploys from a PR. Use **Actions → Backend → Run workflow** to
re-deploy the current `main` without an empty commit — useful after rotating a
Worker secret.

### The Worker can be ahead of every installed app

This is the one thing to keep in mind. Phones and desktops update on their own
schedule (or not at all), so a deployed backend must still answer the **last
released** APK and `.dmg`. Adding a column or an endpoint is safe. Renaming or
removing a field a shipped client reads is not — it breaks installed apps with
no way to roll them forward.

When you genuinely need a breaking change, split it across two deploys: ship a
backend that tolerates both shapes, release the apps, then remove the old shape
once the clients have moved.

### Migrations are append-only

D1 records migrations by **filename**. Editing a file that has already been
applied is a silent no-op — the change never runs, and local and production
schemas drift with nothing failing. CI fails a PR that modifies, renames or
deletes an existing migration; add a new `NNNN_*.sql` instead.

Migrations run **before** the deploy, so new code never meets an old schema.
That ordering assumes additive migrations — see the two-deploy split above for
anything destructive.

### Worker secrets are not in CI

`ADMIN_SECRET` and `JWT_SECRET` live in Cloudflare and survive a deploy, so the
workflow neither holds nor sets them. Set them once with `wrangler secret put`
(see [DEPLOY.md](../DEPLOY.md)). The `/health` smoke test is what catches a
missing one.

### If a backend deploy fails

Unlike a release, there is nothing to delete — just fix forward on `main`. Which
step failed tells you where you stand:

| Failed at | State | What to do |
|---|---|---|
| **check** | Nothing deployed | Fix and push. Production untouched. |
| **migrations** | Partly migrated; old code still live | Wrangler rolls back the failing migration and keeps the previous one applied. Fix the SQL in a **new** file and push. |
| **deploy** | Migrated, old code live | Push the fix; additive migrations leave the old code working meanwhile. |
| **smoke test** | New code live but not answering | Check Worker secrets and `wrangler tail`. Revert the commit if it's not a quick fix. |

---

## One-time setup

### 1. Generate the Android keystore

> ⚠️ **Uninstall Zakhira from your phone before installing the first CI build.**
> Previous APKs were built by EAS and signed with an EAS-managed key. Android
> refuses to update an app when the signing key changes, so the first install
> after this switch must be a clean one — local app state will be lost.

```sh
keytool -genkeypair -v \
  -keystore zakhira-release.jks \
  -alias zakhira \
  -keyalg RSA -keysize 4096 -validity 10000
```

Choose a strong store password, and use the **same** password for the key when
prompted (or record both separately). Then base64 it for GitHub:

```sh
base64 -i zakhira-release.jks | pbcopy
```

**Back this file up somewhere durable and offline.** If you lose it you cannot
ship an update to an installed app ever again — every user has to uninstall and
reinstall. It is ignored by git (`*.jks`); never commit it.

### 2. Generate the Tauri updater keypair

This signs the update payload so the installed app will only accept builds from
you. It is unrelated to Apple code signing.

```sh
pnpm --filter @zakhira/desktop exec tauri signer generate \
  -w ~/zakhira-keys/zakhira-updater.key
```

Keeping it next to the Android keystore means one folder to back up.

It prints a private key and a public key.

- The **private key** and its password become GitHub secrets.
- The **public key** goes into `apps/desktop/src-tauri/tauri.conf.json`, replacing
  the `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY` placeholder. Commit that change.

Back the private key up too — losing it breaks self-updates the same way losing
the keystore breaks Android updates.

### 3. Add the GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

For the **apps** (`release.yml`):

| Secret | What it is |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Output of `base64 -i zakhira-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Store password from `keytool` |
| `ANDROID_KEY_ALIAS` | `zakhira` (or whatever `-alias` you used) |
| `ANDROID_KEY_PASSWORD` | Key password (often the same as the store password) |
| `TAURI_SIGNING_PRIVATE_KEY` | The **raw contents** of `zakhira-updater.key` — see warning below |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you set for that key |

For the **backend** (`backend.yml`):

| Secret | What it is |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token scoped to Workers + D1 — see below |
| `CLOUDFLARE_ACCOUNT_ID` | `wrangler whoami` prints it |

And one repository **variable** (same page, *Variables* tab — not a secret, it
appears in logs):

| Variable | What it is |
|---|---|
| `BACKEND_URL` | `https://zakhira-backend.<your-subdomain>.workers.dev` |

`BACKEND_URL` is only used by the post-deploy `/health` smoke test. Leave it
unset and the deploy still runs — the step warns and skips, so you lose the
check that the Worker actually boots.

`GITHUB_TOKEN` is provided automatically — do not create it.

#### Creating the Cloudflare API token

Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create Custom
Token**. `wrangler login` credentials are user-interactive and won't work in CI.

Permissions:

| Type | Resource | Access |
|---|---|---|
| Account | Workers Scripts | Edit |
| Account | D1 | Edit |

Scope **Account Resources** to your account only. Nothing else is needed — in
particular do not grant Zone permissions.

> The token can deploy code and run migrations against your production
> database. If it leaks, revoke it in the same dashboard and create a new one;
> nothing in the repo pins its value.

> ⚠️ **Do not base64-encode the Tauri key.** The file `tauri signer generate`
> writes is *already* base64. Encoding it again — and picking up the trailing
> newline that `base64` appends — makes the build fail after a full successful
> compile with `failed to decode base64 secret key: Invalid symbol 10`.
> Set it straight from the file, which also avoids clipboard newline mangling:
>
> ```sh
> gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/zakhira-keys/zakhira-updater.key
> ```
>
> The Android keystore is the opposite case — a `.jks` is binary, so it *must*
> be base64-encoded.

---

## Installing on Android (Obtainium)

The repo is public, so Obtainium needs no token.

1. Install [Obtainium](https://github.com/ImranR98/Obtainium) on your phone.
2. **Add App** → URL: `https://github.com/Niyaz2498/Zakhira`
3. Under the app's settings, set **Filter APKs by Regular Expression** to:

   ```
   zakhira-v.*\.apk
   ```

4. Enable **Track only** off, so it installs rather than just notifying.

The workflow always names the asset `zakhira-vX.Y.Z.apk`, so that filter keeps
matching across releases. Obtainium will then offer each new tag automatically.

---

## Updating on macOS

The desktop app checks for updates on launch and shows a small
**"Update available — Restart to update"** banner. There is also a manual
**Check now** button under **Settings → Updates**.

The app reads
`https://github.com/Niyaz2498/Zakhira/releases/latest/download/latest.json`,
which `tauri-action` generates and uploads on every release.

### First install is unsigned

The macOS app is **not** code-signed or notarized (no Apple Developer ID). On the
very first install, Gatekeeper will block it:

```sh
# Right-click → Open also works. If macOS still refuses:
xattr -dr com.apple.quarantine /Applications/Zakhira.app
```

Subsequent self-updates are not re-quarantined, so this is a one-time step. To
remove it entirely, add the Apple signing secrets — the workflow has a commented
block showing exactly which ones and where.

---

## Troubleshooting

**The APK won't install on the phone.**
Almost always a signing-key mismatch. Uninstall the existing app and install
fresh. The workflow fails the build outright if the APK ends up signed with the
public React Native debug key, so that specific mistake can't ship.

**The desktop app never finds an update.**
Check the release is published, not still a draft — that happens when one of the
two build jobs failed. Confirm `latest.json` is attached to it. Errors are
swallowed by design; open the app's devtools console and look for `[updater]`.

**"minor and patch must stay below 100".**
You hit the versionCode ceiling. Bump the major version instead.

**A release job failed halfway.**
Delete the draft release and the tag, then re-push the tag:

```sh
git push --delete origin v1.4.0
git tag -d v1.4.0
```
