# Zakhira — Design & Product Spec

A personal task + reminder system with an RPG-flavored "quest" framing. Cross-platform (Android + macOS), shared backend, API-key auth, built to be self-hosted and free. This document is the source of truth for product behavior and UI. Hand it to Claude Code alongside the screen mockups.

---

## 1. Product concept

Zakhira ("repository" / store of knowledge) is a single-user task manager organized around **operations** (groupings) that contain **tasks** (quests), plus standalone **reminders**. The distinguishing features versus off-the-shelf tools are: enforced task **dependencies** (prerequisites), an **operation-completion rule**, and **API-key-only auth with per-operation scoping** (so machine clients like Home Assistant / MCP can be granted isolated access).

The app is built primarily for the author's own use, with the code released publicly under the MIT license.

---

## 2. Core domain model

### Operations
- A grouping of tasks (e.g. "Computer Vision", "Deep RL", "Immigration").
- **Rich object**: has name, optional description/notes, optional start/end dates, optional importance.
- **General Tasks** is an implicit default operation. Any task created without choosing an operation lands here. It always exists, cannot be deleted, and has no main-quest progress (it shows a task count only, no progress bar).
- An operation is considered **complete when all its Main quest tasks are complete**. Side quests and Exploration tasks do NOT gate operation completion.

### Tasks
- Belong to exactly one operation (General Tasks if unspecified).
- **States**: To-Do, In-Progress, Blocked, Completed, Scrapped ("won't do").
- **Types**: Main quest, Side quest, Exploration (research).
- **Optional fields**: start date, end date, importance, notes, reminder time.
- All fields and type/state are **editable at any time** before the task is Completed or Scrapped.

### Dependencies (prerequisites)
- A task can be **blocked by** one or more other tasks ("prerequisites").
- Set at **task level**, via a "blocked by" multi-select picker in the create/edit task form.
- The picker is **scoped to the same operation** — a task can only be blocked by other tasks in its own operation. No cross-operation prerequisites.
- A task **cannot be marked Complete while any prerequisite is still open** (not Completed/Scrapped).
- The dependency graph **must remain acyclic**. The UI hides the task itself and any choice that would create a cycle; the backend MUST also reject any edit that introduces a cycle (because API clients bypass the UI).
- If a task is moved to a different operation, its existing prerequisites become invalid → **clear prerequisites on operation change, with a warning**.

### Reminders
- Two sources: **standalone** reminders (e.g. a birthday) and **task reminders** (a task's reminder time).
- **Recurrence**: `once` | `daily` | `yearly` (daily = "every day"; yearly = date-anchored like birthdays).
- **Hour precision only** — no minutes/seconds. Truncate to the hour on write. Store `fire_hour` (0–23) and, where relevant, `fire_date`.
- **Snoozable**: snooze reschedules the local OS notification on the current device and writes the new fire time to the backend on next sync. Cross-device sync of a snooze is NOT immediate — eventual on next sync.
- **Timezone rule**: store local wall-clock hour; the device fires at that hour in whatever zone it is currently in. (Simplest model; revisit only if travel handling becomes a real problem.)

---

## 3. Reminder firing architecture (important)

Reminders fire **client-side as local OS notifications**, not via server push.

- On app open / periodic sync, the device pulls tasks + reminders, then **reconciles**: schedules local OS notifications for the upcoming window, cancels ones that were deleted/changed.
- Repeating reminders use the OS's native repeating-notification trigger (one repeating notification, not N scheduled ones) to stay under the OS pending-notification cap (~64 on iOS/macOS).
- Schedule a **rolling window** (e.g. next 7 days) and refresh on each sync — resilient to missed background syncs.
- **No FCM, no server cron, no server push.** The backend is a plain (sleep-tolerant) CRUD API. The only server-authoritative thing about reminders is the *data* (so devices agree on what exists); the *firing* is per-device.
- Consequence accepted: a same-day reminder created on device A may be missed by device B until B's next sync. Mitigate by syncing on foreground, not just once daily.

---

## 4. Auth & security model

**API-key-only. No user accounts, no server-side passwords, no sessions.**

- Every request authenticates with `Authorization: Bearer <key>`. Backend: resolve key → resolve allowed operations → authorize against the target resource's operation.
- **Keys are generated on the backend only** (cryptographically random). Returned to the client **once** at creation; the server stores only a **hash** of the key (never plaintext). On each request, hash the presented key and compare.
- **Key scope**: a key maps to either *all operations* (full-access) or a specific **set of operations**. Many-to-many: one key → many operations, one operation → many keys.
- **No per-action scopes** (no read/write/complete/scrap distinction) for now. Trust is expressed purely by *which operations a key can see*. (A permissions column can be added later if a genuinely untrusted client appears — design the join table so it's addable, but don't build it now.)
- **First key bootstrap (LOCKED — first-run-open)**: the create-key endpoint requires no auth **only while the database has zero keys**. The moment the first key exists, the endpoint permanently rejects unauthenticated requests. Use it once on first deploy to mint the first full-access key. All subsequent keys (e.g. a scoped Home Assistant key) are minted from Settings while authed with an existing full-access key.

### Device-local lock (separate from backend auth)
- The API key lives in the **OS secure store** (Expo SecureStore / macOS Keychain) — encrypted at rest, device-bound.
- An **optional local passcode** gates app access on launch and after backgrounding. It is **opt-in per device** (off by default; toggled in Settings). Purely on-device; never touches the server. Defends the "someone picks up my unlocked phone" case. No biometrics.
- A fresh install on someone else's device has no key → shows the empty setup screen → they see nothing. (Handled by the key model itself.)
- **Optional hardening (later)**: encrypt the stored key with a passcode-derived key (PBKDF2/Argon2) so a rooted-device storage dump is useless without the passcode.

### Example key setup
- **Full-access key** → all operations. Lives in the Mac app and the phone.
- **Scoped key** → only "Home" operation. Lives in Home Assistant. Can create/edit within that operation; can't see anything else.

---

## 5. Navigation & screens

### Menu panel (desktop sidebar / mobile drawer)
- Header: app name + "Welcome back, {name}".
- Items: **Dashboard** (default), **Operations**, **Reminders**, **Settings**.

### Dashboard
- **Group by** toggle: **Task Type** or **Operation**.
  - By Task Type → three sections: Main quests, Side quests, Exploration.
  - By Operation → one section per operation, section header = operation name.
- **Bento grid** of task tiles. Each tile: task name, due date (if present), priority, and a state dot.
- **Metal-tier borders** by type: Main = **gold**, Side = **silver**, Exploration = **bronze**.
- Completed/Scrapped tasks are **hidden** from the dashboard (it answers "what do I do now"). They are viewable inside each operation via a "Show completed/scrapped" toggle (see section 9).

### Task modal (on tile click)
- Opens on a dimmed backdrop, capped to viewport height.
- **Fixed** regions: header (title + type icon + close), badge row (state, type, priority, operation), meta strip (dates, reminder), prerequisites block, footer actions.
- **Scrollable** region: Notes only.
- Footer actions: **Complete**, **Block**, **Edit** on the left; **Scrap** pushed to the right (separated from Complete to avoid misclicks).
- **Complete is disabled** when any prerequisite is still open, with a hint ("finish prerequisites first").
- Modal outer border = task's tier color (optional; can be neutral instead).
- **Scrap requires confirmation** (hard to undo).

### Operations
- **List view**: cards. General Tasks pinned at top (default tag, lock icon, task count, no progress bar). Real operations show importance badge, end date, and "X of Y main quests done" progress bar. "New" creates an operation (rich form: name, description, dates, importance).
- **Drill-in**: a single operation's task list (three-pane on desktop, drill-down on mobile per the anchor set).

### Task create/edit form
- Fields: Title, Operation (select), Type (Main/Side/Exploration), **Blocked by** (prerequisite multi-select picker), Dates (optional), Importance, Reminder (optional, hour precision), Notes (optional).
- Blocked-by picker: selected items shown as removable chips; remaining same-operation tasks listed below; the task itself and cycle-creating tasks are disabled and labeled ("this task" / "would loop").
- Editing is allowed any time before Completed/Scrapped.
- **Edit interaction: inline** — the task modal switches to an in-place edit mode; fields (including the blocked-by picker) become editable where they sit. No separate edit form. Validation and cycle-prevention apply in edit mode too.

### Reminders [to be mocked]
- List of standalone + task-linked reminders. Create/edit with recurrence (once/daily/yearly), hour-precision time, snooze.

### Settings / API keys
- Manage API keys (list, create scoped/full, revoke). **Optional passcode** toggle (per device, off by default — no biometrics). Profile name. **Theme switch** (see below). Sync status.

### Setup / Unlock flow
1. **First-run setup** — paste an existing key OR generate a new one; optional "set a passcode" step.
2. **Unlock screen** — shown on each launch only if a passcode is set on this device (passcode entry). This is what "sign in" means day-to-day. If no passcode is set, the app opens straight to the Dashboard.
3. **Empty state** — device with no key.

---

## 6. Visual design system

- **Both light and dark modes**, user-switchable. They are **two distinct palettes** (different accent families and base tints), not one palette with inverted lightness — so every token below is defined per mode.
  - **Dark = "Ink & Amber"** — warm-neutral near-black base, amber-gold accent. "Old library / repository" feel; fits the name *Zakhira*.
  - **Light = "Sage & Brass"** — soft green-tinted white base, brass accent. Gentle, easy on the eyes.
- **Theme switch**: sun/moon icon. Desktop = at the **top-right of the top/menu bar** (`ti-moon` in light mode → switch to dark; `ti-sun` in dark mode → switch to light). Mobile = a setting in **Settings** (no top-bar icon).
- **RPG aesthetic**: subtle. Type shown via small icons (Main = sword, Side = map-pin, Exploration = flask), not cartoonish. No XP bars, levels, or avatars.
- **No gradients/shadows/glow** — flat surfaces. No metallic gradients on tiers.
- **Tier identity is stronger in dark mode** (gold/silver glow on the ink base); on light backgrounds the tiers are inherently quieter — accept this. Use the slightly deeper light-mode tier hexes below so they don't wash out.
- Components (task row, state dot, badges, progress bar, tier border, tile) are defined once and **composed differently per platform**: desktop = multi-pane + sidebar; mobile = drill-down + bottom tab bar / drawer, single/double-column bento, modals become bottom sheets.

### Dark theme — "Ink & Amber"
| Token | Hex | Use |
|-------|-----|-----|
| `bg-page` | `#101115` | app background / deepest layer |
| `bg-surface` | `#16171c` | main surface (panels, sidebar) |
| `bg-card` | `#1e2026` | cards, tiles, inputs-raised |
| `bg-input` | `#181a1f` | input fields |
| `border` | `#26282f` | default borders/dividers |
| `border-strong` | `#3a3e48` | emphasized borders |
| `accent` | `#d9a441` | primary accent (amber-gold), buttons, active nav |
| `accent-on` | `#16171c` | text/icon on accent fills |
| `text-primary` | `#e8e6e2` | primary text |
| `text-secondary` | `#a4a8b0` | secondary text |
| `text-tertiary` | `#86837c` | hints, muted labels |
| `tier-main` | `#d9a441` | gold border — Main quest |
| `tier-side` | `#b8bcc0` | silver border — Side quest |
| `tier-explore` | `#bd7d4a` | bronze border — Exploration |

### Light theme — "Sage & Brass"
| Token | Hex | Use |
|-------|-----|-----|
| `bg-page` | `#e8ede6` | app background / deepest layer |
| `bg-surface` | `#f1f4ef` | main surface (panels, sidebar) |
| `bg-card` | `#fbfcfa` | cards, tiles |
| `bg-input` | `#ffffff` | input fields |
| `border` | `#dde4da` | default borders/dividers |
| `border-strong` | `#c3ccc0` | emphasized borders |
| `accent` | `#a48a36` | primary accent (brass); darker than dark-mode amber so it passes contrast on light |
| `accent-on` | `#ffffff` | text/icon on accent fills |
| `text-primary` | `#272d28` | primary text |
| `text-secondary` | `#5c635c` | secondary text |
| `text-tertiary` | `#7d857d` | hints, muted labels |
| `tier-main` | `#9c6f45`→ use `#a48a36` (brass) | gold/brass border — Main quest |
| `tier-side` | `#98a098` | silver border — Side quest (quiet on light, expected) |
| `tier-explore` | `#9c6f45` | bronze border — Exploration |

### State colors (dots/badges) — shared semantic, tune per mode for contrast
| State | Dark | Light |
|-------|------|-------|
| To-Do | `#86837c` (grey) | `#8a8a84` |
| In-Progress | `#5aa9f0` (blue) | `#2f7fd6` |
| Blocked | `#e3a857` (amber) | `#b9791a` |
| Completed | `#7ac77a` (green) | `#3f8a3f` |
| Scrapped | `#6a6e74` (muted grey) | `#9a9a94` |

Lock these as shared tokens used app-wide (dashboard dots, modal badges, list rows).

---

## 7. Tech stack

- **Monorepo** (pnpm workspaces + Turborepo). One git repo; apps and packages as folders.
  - `apps/mobile` — Expo (Android). Needs Metro config to follow symlinks into `packages/`.
  - `apps/desktop` — Tauri (macOS). Rust/Tauri build toolchain; uses shared TS core.
  - `packages/core` — shared TS: types, API client, business rules (completion gating, cycle checks).
  - `packages/ui` — shared components.
  - `backend` — serverless CRUD API + DB schema/migrations.
- **Application ID** (Android applicationId / macOS bundle identifier): **`site.niyaz.zakhira`** (reverse-domain of the author's `niyaz.site`). Stable and permanent — changing it makes the OS treat the app as a different install and orphans secure-store data (the saved API key). Same ID across both platforms.
- **Repo**: `Niyaz2498/Zakhira` (GitHub), MIT license.
- **Language**: TypeScript end-to-end (priority: minimize languages to maintain).
- **Backend (LOCKED)**: **Cloudflare Workers + D1 (SQLite)**, TypeScript, **Drizzle ORM**, **Hono** router. Perpetually free, relational, no 12-month cliff. "Never sleep" is NOT a requirement — reminders fire client-side.
- **Secure storage**: Expo SecureStore (Android Keystore) / macOS Keychain (Tauri).
- **Future**: MCP server wrapping the REST API for Home Assistant / agent integration — keep the REST surface clean and the API-key middleware the single auth path.

### Backend detail (Cloudflare Workers + D1 + Drizzle + Hono)
- **Router**: Hono inside the Worker. Auth is one `app.use()` middleware running before every route: read `Authorization: Bearer`, hash, look up in `api_keys`, resolve allowed operations, authorize against the target resource's operation.
- **ORM**: Drizzle (SQLite dialect) with `drizzle-kit` for migrations; apply via Wrangler to both local (Miniflare) and remote D1.
- **Key hashing**: API keys are high-entropy random strings → hash with **SHA-256** (fast; Workers have per-request CPU limits, bcrypt/Argon2 would be wrong here). The optional **device passcode** is low-entropy/human → if ever hashed, use a slow KDF, and it's client-side anyway. Do not conflate the two.
- **IDs**: generate in the Worker with `crypto.randomUUID()` (no Postgres `gen_random_uuid()` in SQLite).
- **Types/quirks (SQLite)**: booleans stored as integers; timestamps stored consistently (ISO string or epoch int) — `updated_at` drives delta sync. Enable `PRAGMA foreign_keys=ON`.
- **Cycle detection**: implemented as a pure TS depth-first check in `packages/core`, shared by client (picker greying) and Worker (reject bad writes). Preferred over recursive SQL for these small per-operation graphs.
- **Business logic** (completion gating, "all main quests done", cycle check) lives in `packages/core` and is enforced authoritatively in the Worker; clients reuse it for optimistic UI.

### Sync model
- **Pull-based delta sync**: every row has `updated_at`; a device requests "everything changed since `<last sync>`", merges the delta, reschedules local notifications.
- **Conflict rule**: last-write-wins (single user across own devices; genuine conflicts rare).
- Keeps D1 row-reads tiny (avoids re-reading all rows each poll) — important for staying within free-tier read limits.

### Schema (tables)
- `operations` — id, name, description, start_date?, end_date?, importance?, is_default (General Tasks), timestamps.
- `tasks` — id, operation_id (FK), title, type (main|side|exploration), state (todo|in_progress|blocked|completed|scrapped), start_date?, end_date?, importance?, notes?, reminder_id?, timestamps.
- `task_dependencies` — task_id (FK tasks), prerequisite_id (FK tasks). Both in same operation; graph must stay acyclic.
- `reminders` — id, task_id? (FK, null = standalone), title, fire_hour (0–23), fire_date?, recurrence (once|daily|yearly), snoozed_until?, timestamps.
- `api_keys` — id, key_hash (SHA-256), name, scope (all|scoped), last_used_at?, timestamps.
- `api_key_operations` — api_key_id (FK), operation_id (FK). Join used only by scoped keys; full-access keys skip it.

### Additional invariants (backend)
- **Deleting a task** unlinks its dependency edges only — never deletes other tasks. Remove all `task_dependencies` rows where the task is either `task_id` or `prerequisite_id`, then delete the task. Dependents survive with one fewer prerequisite (and may become completable).
- **Deleting an operation** is a user choice, not an automatic cascade. Offer at delete time: (a) **Move tasks to General Tasks** (unlink — tasks survive; their prerequisites are cleared, since prereqs are same-operation-scoped and the move invalidates them), or (b) **Delete operation and all its tasks** (full cascade, with a confirmation showing the task count). Optionally also allow (c) block-if-not-empty. General Tasks itself is undeletable.
- Moving a task to a different operation clears its prerequisites (same rule as the operation-move case).
- Foreign-key integrity enforced in code (D1 cascades are not relied upon).

### Local development & testing
- The whole stack runs **locally with no Cloudflare account**: `wrangler dev` runs the Worker in the real `workerd` runtime on `localhost:8787` with a **local D1** (SQLite file under `.wrangler/state/`). Drizzle queries hit local SQLite. Offline, free, fast.
- Migrations: `drizzle-kit` generates SQL; `wrangler d1 migrations apply <db> --local` applies to local SQLite. Swap `--local` for `--remote` to push to real D1 at deploy time.
- Clients point their API base URL at `http://localhost:8787` for dev (or the laptop's LAN IP, e.g. `http://192.168.x.x:8787`, to test a second physical device against the local backend).
- **Real Cloudflare (deployed Worker + remote D1) is needed only for** (1) cross-device sync over the internet and (2) final deployment. Defer until the app works locally. Real D1 is also free-tier.

---

## 8. Invariants (enforce server-side, not just UI)

1. A task cannot be Completed while any prerequisite is open (not Completed/Scrapped).
2. An operation is complete only when all its Main quest tasks are complete.
3. The dependency graph must remain acyclic — reject any prerequisite edit that introduces a cycle.
4. Prerequisites are same-operation only; moving a task's operation clears its prerequisites.
5. Every request authorizes via API key → allowed operations → target's operation. No unauthenticated data access. The sole exception is the create-key endpoint, which is unauthenticated **only while zero keys exist** (first-run-open), then permanently sealed.
6. API keys are stored hashed; plaintext is shown to the client only once at creation.
7. General Tasks always exists and cannot be deleted.

---

## 9. Resolved decisions (locked)

- **Fonts (LOCKED)**: **Inter** for all UI/body text; **JetBrains Mono** for API keys and code-like strings (clear 0/O, 1/l/I). No separate display font for now (a wordmark face like Space Grotesk can be added later).
- **Task edit (LOCKED — inline)**: the task modal has a **read mode and an inline edit mode** — fields become editable in place (title, type, operation, dates, importance, reminder, notes, and the **blocked-by prerequisite picker**). No separate edit form. The prerequisite picker, cycle-prevention, and validation must work in the inline edit state, not only at create time.
- **Snooze (LOCKED — custom picker)**: snoozing opens a **custom "defer until" picker** where the user selects a **day + hour** (hour precision only — no minutes, consistent with the rest of the reminder model). Reschedules the local notification on this device and writes `snoozed_until` to the backend on next sync.
- **Completed/Scrapped tasks (default)**: hidden from the Dashboard (which answers "what do I do now"). Visible inside each **operation view via a "Show completed/scrapped" toggle**. No separate global archive screen. Un-scrapping / re-opening is possible from there.
- **Empty dashboard sections (default)**: hide a section if it has zero tiles (no empty "Exploration" header). Operations with no active tasks are still discoverable via the Operations list screen.
- **Modal border (default — neutral)**: the task modal uses a neutral border. Metal-tier (gold/silver/bronze) borders are used on **dashboard tiles only**, where they do real work; the modal already shows type via badge + icon.

### Two sub-flows — text spec (not separately mocked; follow existing patterns)

**API key creation + one-time reveal:**
1. From Settings → "New key": form with **name** (e.g. "Home Assistant"), **scope** = Full access | Scoped. If Scoped, a multi-select of operations appears.
2. On create, the Worker generates the key, stores only its SHA-256 hash, and returns the **plaintext once**.
3. A **reveal screen** shows the plaintext key in a JetBrains Mono field with a **Copy** button and a clear warning: "This is the only time you'll see this key. Copy it now." A "Done" button dismisses; the key is never retrievable again.
4. Revoking a key (from the key list overflow menu) deletes it; any device using it must reconnect with a new key.

**Reminder create/edit:** same shape as the task form. Fields: **title**, **time** (hour precision), **recurrence** (once | daily | yearly; yearly shows a date anchor), **link to task** (optional — standalone if none), and standalone reminders may be created directly from the Reminders screen. Edit reuses the same form pre-filled.
