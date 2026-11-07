---
name: ship-feature
description: End-to-end loop for building a Zakhira feature — investigate, build shared logic in packages/core, verify on the Android emulator against a local backend, hand the running app over for sign-off, update the handbook, open a PR, then cut a release. Use when adding or changing app behaviour in apps/mobile, apps/desktop or packages/core, when testing anything on the emulator, when updating docs/handbook, or when cutting a vX.Y.Z release.
---

# Shipping a Zakhira feature

Seven phases. Don't skip phase 1, and never test against production.

The order of 3 → 4 → 5 is deliberate and easy to get wrong: **the user drives
the app before anything is torn down, and the handbook screenshots are taken
while that same stack is still up.** Tearing down early means booting the whole
thing a second time for pictures.

---

## 1. Investigate before building

Read the actual code before proposing anything. Report findings, then wait.

Worth checking every time:

- **Where does the state live?** `packages/core/src/types.ts` is the source of
  truth for `Task`, `Group`, `Reminder`. Fields often already exist for what
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
`@zakhira/core`. This is the established pattern — `buildGroupTree` and
`timerAlertTimes` both live there, consumed by desktop and mobile alike, so the
two screens cannot drift apart. Write it as a pure function taking an injectable
`now: Date = new Date()` so it's testable without mocking the clock.

`packages/core` and `packages/ui` resolve to **source** (`main: ./src/index.ts`),
so there is no build step to run before the apps see your change.

**Typecheck every workspace:**

```sh
pnpm --filter @zakhira/core --filter @zakhira/ui --filter @zakhira/backend \
     --filter @zakhira/desktop --filter @zakhira/mobile typecheck
```

All five pass on a clean tree, `@zakhira/backend` included, so treat any
failure as yours. (The backend used to have pre-existing drizzle failures in
`src/routes/sync.ts` and `src/routes/tasks.ts`; those are gone — re-verified
against `main` in Oct 2026.)

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

### Then stop — do not tear down

Screenshots confirm a thing renders; they don't confirm it feels right. Leave
the emulator, Metro and wrangler **running**, with the seed data in place, and
hand the app over:

> The app is running and it's yours to test. Sign in with `<user>` / `<pass>`.
> To reach it: `<the path through the UI>`.

Wait for the user to say it works. Expect a round or two of fixes here — a
`force-stop` plus relaunch picks up edits when fast refresh doesn't. Only once
they sign off do you move on.

---

## 4. Capture the handbook screenshots

**While the stack from phase 3 is still up.** This is the whole reason teardown
comes later.

`docs/handbook/` is the user-facing book — what the app does, in the second
person, for someone who will never read the code. It is *not* `ARCHITECTURE.md`
(how it is built) or `DECISIONS.md` (why). Keep mechanism out of it; if a
paragraph explains the sync protocol or a cycle check, it is in the wrong file.

Read `docs/handbook/README.md` before writing — it holds the conventions and
the chapter order.

**Shoot only where the visual is the point** — a grid, a layout, the themes.
A screenshot of a text form teaches less than a sentence and goes stale faster.
Screenshots are the highest-maintenance documentation there is; a single token
tweak silently invalidates every one of them.

```sh
adb exec-out screencap -p > /tmp/shot.png
# crop to the region that matters — full-screen chrome is noise
sips -c <h> <w> --cropOffset <top> <left> /tmp/shot.png --out docs/handbook/images/<name>.png
```

- **Dark theme by default.** Add a light shot only where the difference is the
  subject.
- **Same AVD, consistent crops.** Ragged widths page badly later.
- Name by what it shows, not by order: `calendar-sheet-dark.png`.
- Caption every image — the caption carries the meaning, the picture confirms it.

---

## 5. Clean up — always

```sh
curl -s -X DELETE "http://localhost:8788/admin/users/$ID" -H "Authorization: Bearer $ADMIN"
cp /tmp/env.dev.backup apps/mobile/.env.development.local
adb emu kill; pkill -f "qemu-system.*Pixel_10_Pro"   # -9 if it survives
# kill Metro (8081) and wrangler (8788)
```

`adb emu kill` has been seen to return OK while the process keeps running —
re-check with `pgrep -f "qemu-system.*Pixel"` rather than trusting it.

Then `git status` and confirm only intended files changed.

---

## 6. Open a PR

The user merges; you don't.

```sh
git checkout -b <short-kebab-branch>
git add <specific files>        # never -A blindly
git commit -m "..."
git push -u origin <branch>
gh pr create --base main --title "..." --body "..."
```

The handbook changes from phase 4 go in **this** PR, not a follow-up — the
prose, the screenshots and the code that produced them land together or the
book starts drifting on day one.

Commit messages end with the attribution line the session specifies. In the PR
body, state **design decisions and their reasons**, **judgement calls the user
should check**, and **what was actually verified versus assumed**. If testing
uncovered bugs, say so — that's the most useful part for the reviewer.

Confirm with `gh pr view <n> --json state,mergeable`.

---

## 7. Cut a release

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
