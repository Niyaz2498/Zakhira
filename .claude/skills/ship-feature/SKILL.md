---
name: ship-feature
description: End-to-end loop for building a Zakhira feature — investigate, build shared logic in packages/core, verify on the Android emulator against a local backend, open a PR, then cut a release. Use when adding or changing app behaviour in apps/mobile, apps/desktop or packages/core, and when testing anything on the emulator or cutting a vX.Y.Z release.
---

# Shipping a Zakhira feature

Five phases. Don't skip phase 1, and never test against production.

---

## 1. Investigate before building

Read the actual code before proposing anything. Report findings, then wait.

Worth checking every time:

- **Where does the state live?** `packages/core/src/types.ts` is the source of
  truth for `Task`, `Operation`, `Reminder`. Fields often already exist for what
  you need — e.g. `timerStartedAt` was already the exact session anchor an
  hourly-alert feature needed, so the backend needed no change at all.
- **Is the dependency already installed but unused?** `expo-notifications` sat in
  `package.json` and `app.json` with zero usage for months. Check before adding.
- **Do both apps need it?** If yes, the logic goes in `packages/core` (see below).

State your assumptions and the judgement calls you made. Users can correct a
stated assumption; they can't correct a silent one.

---

## 2. Build

**Shared logic goes in `packages/core/src/rules.ts`.** Both apps import from
`@zakhira/core`. This is the established pattern — `groupTasksForDisplay` and
`timerAlertTimes` both live there, consumed by desktop and mobile alike, so the
two screens cannot drift apart. Write it as a pure function taking an injectable
`now: Date = new Date()` so it's testable without mocking the clock.

`packages/core` and `packages/ui` resolve to **source** (`main: ./src/index.ts`),
so there is no build step to run before the apps see your change.

**Typecheck the four workspaces that pass:**

```sh
pnpm --filter @zakhira/core --filter @zakhira/ui \
     --filter @zakhira/desktop --filter @zakhira/mobile typecheck
```

`@zakhira/backend` has **pre-existing** drizzle typing failures in
`src/routes/sync.ts` and `src/routes/tasks.ts`. Not yours, don't fix them
mid-feature, don't let them block you. Plain `pnpm typecheck` will look broken.

**Verify pure logic before wiring UI to it:**

```sh
npx tsx -e 'const { yourFn } = require("./packages/core/src/rules.ts"); ...'
```

Cheaper than a 6-minute emulator cycle, and it catches ordering and
edge-case bugs before they're buried under a UI.

---

## 3. Verify on the emulator

**Against a local backend. Never production.** Seeding fake data into the real
D1 is not acceptable.

### Start the pieces

```sh
# 1. Emulator (run in background; ~60s to boot)
"$HOME/Library/Android/sdk/emulator/emulator" -avd Pixel_10_Pro -no-boot-anim

# 2. Local backend
cd backend && npx wrangler dev --port 8788 --ip 0.0.0.0

# 3. Point the app at the emulator's host alias, BACKING UP FIRST
cd apps/mobile
cp .env.development.local /tmp/env.dev.backup
echo "EXPO_PUBLIC_API_URL=http://10.0.2.2:8788" > .env.development.local

# 4. Metro — --clear is required after an env change
export ANDROID_HOME="$HOME/Library/Android/sdk"
npx expo start --port 8081 --clear
```

`ANDROID_HOME` is **not** set in the shell profile. Without it Gradle fails with
"SDK location not found".

`10.0.2.2` is the emulator's alias for the host loopback. `adb reverse tcp:8081
tcp:8081` handles Metro.

### Traps that have actually cost time here

- **Stale Metro on 8081.** Old Expo **SDK 51** servers have been found still
  running from before the SDK 54 upgrade, serving HTTP 500 for every bundle
  request. Symptom: a black screen with no JS logs. Always
  `lsof -tiTCP:8081 -sTCP:LISTEN` and kill before starting.
- **`.env.development.local` beats the shell env.** Setting
  `EXPO_PUBLIC_API_URL=... npx expo start` does *not* win. Edit the file, back it
  up, restore it afterwards. It has also been found holding a **stale LAN IP**.
- **Signing-key install failures.** `INSTALL_FAILED_UPDATE_INCOMPATIBLE` means a
  differently-signed Zakhira is installed. `adb uninstall site.niyaz.zakhira`
  first. This is the same rule that governs real updates.
- **Verify the bundle before blaming the app:**
  ```sh
  curl -s -o /dev/null -w "%{http_code}\n" \
    "http://localhost:8081/.expo/.virtual-metro-entry.bundle?platform=android&dev=true"
  ```
  `/index.bundle` 404s legitimately — expo-router uses a virtual entry.

### Seed test data

`.dev.vars` holds a local `ADMIN_SECRET`. Create a throwaway user and drive the
rest through the normal API so you exercise real code paths:

```sh
ADMIN=$(grep '^ADMIN_SECRET=' backend/.dev.vars | cut -d= -f2-)
curl -s -X POST http://localhost:8788/admin/users \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN" \
  -d '{"username":"testuser","password":"testpass123","email":"test@local"}'
```

Build a dataset that would **fail if the feature were broken** — for ordering
work that means deliberately interleaved states, not already-sorted input.

### Drive the UI

```sh
adb shell pm clear site.niyaz.zakhira     # reset to signed-out
adb shell monkey -p site.niyaz.zakhira -c android.intent.category.LAUNCHER 1
adb shell input tap X Y
adb shell input text "..."
adb shell input keyevent 111              # dismiss keyboard
adb exec-out screencap -p > /tmp/s.png    # then read the image
```

**Coordinates:** screenshots come back at the AVD's native resolution but are
displayed scaled. The read tool states the factor — multiply displayed
coordinates by it to get tap coordinates. Derive it per session; don't hardcode.

**Re-screenshot between taps.** Opening or dismissing the keyboard shifts the
whole layout vertically — a Sign In button moves by hundreds of pixels. Tapping
blind puts the password into the username field.

**Confirm effects, don't assume them.** `adb shell cmd notification list`,
`adb shell dumpsys notification --noredact`, `adb logcat -d | grep ReactNativeJS`.
Check timestamps to tell a fresh event from a stale one.

### Testing time-delayed behaviour

Temporarily shorten the interval constant, mark it `// TEMP-TEST`, and **grep for
that marker before committing**. Shortened intervals have exposed real bugs that
reading the code did not — including a helper that divided by the alert interval
instead of an hour, and an Android `channelId` placed on `content` where it is
*silently ignored* rather than erroring.

### Clean up — always

```sh
curl -s -X DELETE "http://localhost:8788/admin/users/$ID" -H "Authorization: Bearer $ADMIN"
cp /tmp/env.dev.backup apps/mobile/.env.development.local
adb emu kill; pkill -f "qemu-system.*Pixel_10_Pro"
# kill Metro (8081) and wrangler (8788)
```

Then `git status` and confirm only intended files changed.

---

## 4. Open a PR

The user merges; you don't.

```sh
git checkout -b <short-kebab-branch>
git add <specific files>        # never -A blindly
git commit -m "..."
git push -u origin <branch>
gh pr create --base main --title "..." --body "..."
```

Commit messages end with the attribution line the session specifies. In the PR
body, state **design decisions and their reasons**, **judgement calls the user
should check**, and **what was actually verified versus assumed**. If testing
uncovered bugs, say so — that's the most useful part for the reviewer.

Confirm with `gh pr view <n> --json state,mergeable`.

---

## 5. Cut a release

Full detail in [docs/RELEASING.md](../../../docs/RELEASING.md). The loop:

```sh
git checkout main && git pull --ff-only origin main
git tag vX.Y.Z && git push origin vX.Y.Z
gh run watch <id> --interval 30 --exit-status
```

**Verify the artifacts — a green build is not proof:**

```sh
gh release download vX.Y.Z --pattern "zakhira-vX.Y.Z.apk" --dir /tmp
apksigner verify --print-certs /tmp/zakhira-vX.Y.Z.apk   # cert MUST match prior release
aapt2 dump badging /tmp/zakhira-vX.Y.Z.apk | head -1     # versionCode increased
```

For macOS, confirm `latest.json` reports the new version and that its signature's
minisign key id matches the `pubkey` in `tauri.conf.json` — that pairing is what
makes the installed app accept the update.

**If a job fails:** fix forward on main, then delete and re-cut the tag —
`gh release delete vX.Y.Z --yes --cleanup-tag`. A failed release leaves an empty
**draft**; the workflow only publishes when both platforms succeed.

`versionCode` is `major*10000 + minor*100 + patch`, so minor and patch must stay
under 100.

---

## Never

- Seed, mutate or test against **production D1**. Local backend only.
- Commit keystores, `.jks`, `.key`, or anything from `~/zakhira-keys/`.
- Commit a `// TEMP-TEST` constant.
- Report a feature as working without having seen it work.
