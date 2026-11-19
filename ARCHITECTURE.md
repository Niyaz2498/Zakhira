# Zakhira — Architecture Guide

Welcome to the codebase. This document walks through how everything fits together so you can be productive quickly. Read it top-to-bottom once, then use it as a reference.

---

## What is Zakhira?

Zakhira is a personal task and time-tracking tool. It has:

- A **backend** hosted on Cloudflare (the server + database)
- A **desktop app** for macOS (built with Tauri — a native window wrapping a React web UI)
- A **mobile app** for Android (built with Expo/React Native)

All three talk to the same backend. The same data appears on every device.

---

## Monorepo Layout

```
Zakhira/
├── backend/                  Cloudflare Worker (API + database)
│   ├── src/
│   │   ├── index.ts          Entry point — registers all routes
│   │   ├── db/schema.ts      Database table definitions (Drizzle ORM)
│   │   ├── routes/           One file per resource group
│   │   │   ├── groups.ts
│   │   │   ├── tasks.ts
│   │   │   ├── reminders.ts
│   │   │   ├── keys.ts
│   │   │   ├── sync.ts
│   │   │   └── admin.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts       API key validation for every request
│   │   │   └── adminAuth.ts  Secret-based guard for /admin endpoints
│   │   └── utils/crypto.ts   Key generation and hashing
│   └── wrangler.toml         Cloudflare config (port, D1 database binding)
│
├── packages/
│   ├── core/src/             Shared TypeScript code used by all three apps
│   │   ├── types.ts          All domain interfaces (Task, Group, etc.)
│   │   ├── client.ts         ZakhiraClient — the HTTP API wrapper
│   │   └── rules.ts          Business logic (completion gating, cycle detection)
│   └── ui/src/
│       └── tokens.ts         Design tokens (colors, spacing) — both themes
│
├── apps/
│   ├── desktop/src/          Tauri + Vite + React
│   │   ├── App.tsx           Root — handles routing between screens
│   │   ├── store/index.ts    Client-side state (localStorage-backed)
│   │   ├── screens/          One file per page
│   │   └── components/       Shared UI pieces (TaskModal, FormControls)
│   │
│   └── mobile/               Expo SDK 54 + Expo Router
│       ├── app/              File-based routing (like Next.js pages)
│       │   ├── index.tsx     Entry — loads credentials, boots store
│       │   ├── setup.tsx     First-run screen (URL + API key entry)
│       │   └── (tabs)/       Tab navigation group
│       │       ├── index.tsx     Dashboard
│       │       ├── groups.tsx
│       │       ├── reminders.tsx
│       │       └── settings.tsx
│       └── src/
│           ├── store/index.ts    Client-side state (SecureStore-backed)
│           ├── components/       Shared components (TaskDetailModal)
│           └── theme/            Theme context (dark/light)
```

---

## The Three Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
│                                                                 │
│   ┌───────────────────┐         ┌──────────────────────────┐   │
│   │  Desktop (Tauri)  │         │   Mobile (Expo / Android) │   │
│   │  React + Vite     │         │   React Native            │   │
│   │  localStorage     │         │   SecureStore             │   │
│   └─────────┬─────────┘         └────────────┬─────────────┘   │
│             │                                │                  │
│             └─────────────┬──────────────────┘                  │
│                           │  HTTPS + Bearer token               │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                         BACKEND                               │
│                                                               │
│   Cloudflare Worker (Node-compatible edge runtime)            │
│   Hono (HTTP framework) + Drizzle ORM + D1 (SQLite)          │
│                                                               │
│   /groups       /tasks   /reminders   /keys   /sync          │
│   /admin   /bootstrap   /health                               │
└───────────────────────────────────────────────────────────────┘
```

---

## The Data Model

Everything belongs to a **User**. Each user can have many **Groups** (think: projects or campaigns). A group holds **Tasks** and, since it can nest, other **Groups** — a group's children are tasks and sub-groups side by side, to any depth.

```
User
 └── Group (project)
      ├── Group (sub-group, nests to any depth)
      │    └── Task
      └── Task
           ├── type: main | side | exploration
           ├── state: todo → in_progress → blocked → completed | scrapped
           ├── timeLogged (seconds)
           ├── prerequisites: Task[]   ← dependency graph
           └── Reminder (optional)

User
 └── ApiKey (how apps authenticate — stored as a hash, never in plaintext)
```

**Key rules enforced by `packages/core/src/rules.ts`:**

- A task can only be marked **Complete** if all its prerequisites are already complete or scrapped. (`canComplete`)
- Adding a prerequisite that would create a circular dependency is rejected. (`wouldCreateCycle`)
- A Group is considered "complete" when all the **Main Quest** tasks in it *and in every sub-group beneath it* are done — progress rolls up the tree. Side Quests and Exploration tasks are optional. (`computeGroupStats`; `computeDirectGroupStats` ignores sub-groups where only the group's own list is the subject.)
- A group cannot be moved inside itself or one of its own descendants. (`wouldCreateGroupCycle`)
- **General Tasks** stays a flat top-level inbox: it cannot be nested, and it cannot hold sub-groups.
- The tree is built client-side from flat rows with parent pointers (`buildGroupTree`), so both apps nest and order identically. Orphaned or cyclic rows are re-rooted rather than dropped — a bad row can't make tasks vanish from the UI.

These rules live in `packages/core` so they are enforced the same way on desktop and mobile, not just on the server.

---

## Authentication

There are no passwords. Authentication is done with **API keys**.

```
1. Admin creates a user:
   POST /admin/users  { email: "you@example.com" }
   → returns { id, email }

2. Admin creates a key for that user:
   POST /admin/users/:id/keys  { name: "My Phone" }
   → returns { plaintext: "zk_live_abc123..." }
      ↑ only shown once — save this!

3. Every API request:
   Authorization: Bearer zk_live_abc123...
```

On the server, the plaintext is never stored. It is hashed with SHA-256 and only the hash goes in the database (`api_keys.key_hash`). On each request, the middleware hashes the incoming token and looks up the hash.

The `/admin` endpoints are protected by a separate `ADMIN_SECRET` environment variable (not a user key). The admin secret is set via `wrangler secret put ADMIN_SECRET` and is never in the codebase.

---

## The HTTP Client (`packages/core/src/client.ts`)

Both apps use `ZakhiraClient` — a thin class that wraps every API endpoint. You never call `fetch` directly in the app code; you always go through the client.

```ts
const client = new ZakhiraClient("https://your-backend.workers.dev", "zk_live_...");

const res = await client.updateTask(taskId, { state: "in_progress" });

if (res.ok) {
  console.log(res.data); // Task
} else {
  console.error(res.error); // string message
}
```

Every response is typed as `ApiResponse<T>` — a discriminated union of `{ ok: true, data: T }` or `{ ok: false, error: string }`. You always check `res.ok` before using `res.data`.

---

## State Management (the Store pattern)

Both apps use the same pattern: a **module-level singleton** with a manual observer system. There is no Redux, no Zustand, no Context for data — just a plain object and a list of listener functions.

```
                  ┌──────────────────────────────────────┐
                  │            _store (object)           │
                  │  { apiKey, tasks, groups, ... }  │
                  └─────────────────┬────────────────────┘
                                    │
           subscribe(fn) ◄──────────┤──────────► notify()
                                    │
                  ┌─────────────────▼────────────────────┐
                  │   useStore() hook (React component)   │
                  │   calls setState on every notify()    │
                  └──────────────────────────────────────┘
```

**Mobile** (`apps/mobile/src/store/index.ts`) — offline-first:
- Credentials are persisted in `expo-secure-store` (encrypted OS keychain)
- Rows **and the unsent write queue** are persisted as one JSON file in the app's document directory (`src/store/cache.ts`, via `expo-file-system`). SecureStore is wrong for this — Android caps values at ~2KB
- The store is populated from that file before the first render, so the app opens with data and `sync()` is a reconciliation rather than the thing that fills it in
- Writes are **local-first**: `createTaskLocally()`, `updateTaskLocally()` and friends apply the change, persist it and queue it, then return. Nothing waits on the network
- `flushQueue()` sends queued writes oldest-first and stops at the first network failure, so writes that depend on earlier ones keep their order

**Desktop** (`apps/desktop/src/store/index.ts`):
- Credentials + cached data are persisted in `localStorage`
- Store is initialized **synchronously** at module load (before first render), so there's no loading flash
- Full sync on every Refresh button click

---

## Sync Protocol

The backend has a `GET /sync?since=<ISO timestamp>` endpoint that returns all Groups, Tasks, and Reminders modified after a given timestamp. Clients pass their `lastSyncedAt` time and receive only what changed.

**Mobile** does a **full sync on cold start and on every foreground or pull-to-refresh**, and delta syncs in between. The full sync is not belt-and-braces: deletions are never reported by `/sync` — a deleted row simply stops being mentioned — so a persisted cache that is only ever merged into would hold deleted rows forever. `reconcileFullSync()` takes the server's complete list verbatim, which is the only thing that prunes them, while carrying over rows that have unsent local writes.

**Desktop** does a full sync on every refresh (passes no `since` parameter). This is a simpler approach that avoids edge cases when the in-memory cache gets out of sync.

### Conflict resolution

One rule: **the newer `updatedAt` wins**. It is applied in two places that cannot disagree, because both compare the same two timestamps:

- `mergeByUpdatedAt()` folds a sync response into the cache, per row
- `resolvePendingAgainstServer()` drops a queued write when the server's copy of that row was updated *after* the user made the edit

A queued write carries `queuedAt` — when the user made the change — and the optimistic row it produced carries that same value as its `updatedAt`. So when another device wins, the optimistic row is replaced by the merge *and* the now-pointless write is dropped from the queue, in the same pass.

The two timestamps come from different clocks (the device's and the server's). A device with a badly wrong clock will win or lose conflicts it should not. Resolving server-side instead would mean writing a client-supplied `updatedAt`, which would hide the row from other devices' delta windows — that needs a separate server-assigned sync cursor column, which this does not have.

All of this lives in `packages/core/src/offline.ts`: pure, clock-injectable, and shared so a second offline client cannot drift from the first.

### Client-supplied row ids

`POST /tasks` and `POST /groups` accept an optional `id` (validated as a UUID; see `backend/src/utils/ids.ts`). An offline client mints the id before the row can be sent, so the row keeps one identity for its whole life — nothing is re-keyed when the write lands, and a task filed in a group that is *itself* still queued needs no fix-up.

It also makes creates **idempotent**: a replay after a lost response returns the stored row rather than filing a second one. A row whose id exists but is not reachable by the caller returns 409 `ID_TAKEN` rather than 403, so the response cannot be used to probe for another account's ids.

Omitting `id` behaves exactly as before, which is what keeps installed app versions working.

---

## Timer Feature

The timer is **client-side only** during a session. Here's the lifecycle:

```
User presses Start
  → record startedAt = Date.now() in memory (sessionStartRef)
  → mobile only: also write { taskId, startedAt } to SecureStore
  → setInterval fires every second to update the displayed time

User presses Stop
  → clear the interval
  → calculate elapsed = Date.now() - startedAt
  → PATCH /tasks/:id { timeLogged: existing + elapsed }
  → mobile only: delete timer session from SecureStore

App is killed and reopened (mobile)
  → on TaskDetailModal mount, read SecureStore
  → if stored taskId === current task id:
      → elapsed = Date.now() - storedStartedAt
      → resume the interval from that elapsed point
```

The database is only written to on **Stop**. The in-flight session is purely local.

Desktop doesn't need SecureStore persistence because the Tauri process stays alive while the window is open.

---

## The `packages/ui` Package — Design Tokens

Rather than hardcoding colors everywhere, both apps import color tokens from `packages/ui/src/tokens.ts`. There is a `dark` and `light` theme object. The app wraps everything in a `ThemeContext` that provides the active token set.

```ts
// In any component:
const { tokens } = useTheme();

<View style={{ backgroundColor: tokens.bgPage }}>
  <Text style={{ color: tokens.textPrimary }}>Hello</Text>
</View>
```

If you add a new color, add it to both `dark` and `light` in `tokens.ts`.

---

## Environment Variables

| App | Variable | Where to set |
|---|---|---|
| Backend | `ADMIN_SECRET` | `wrangler secret put ADMIN_SECRET` (Cloudflare) |
| Desktop | `VITE_API_URL` | `.env.local` in `apps/desktop/` |
| Mobile | `EXPO_PUBLIC_API_URL` | `.env.local` in `apps/mobile/` |

The production backend URL is hardcoded as the default in the store files. `.env.local` overrides it for local development. `.env.local` is gitignored — never commit it.

---

## Running Locally

You need three terminals:

```sh
# Terminal 1 — Backend (runs on http://localhost:8788)
cd backend
pnpm dev

# Terminal 2 — Desktop app (opens native macOS window)
cd apps/desktop
pnpm tauri:dev

# Terminal 3 — Mobile (Expo dev server)
cd apps/mobile
npx expo start
```

First time only — create a local user and key:

```sh
# Run migrations against local SQLite
cd backend && pnpm db:migrate:local

# Create a user (copy the id from the response)
curl -X POST http://localhost:8788/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_LOCAL_ADMIN_SECRET" \
  -d '{"email": "you@example.com"}'

# Create a key
curl -X POST http://localhost:8788/admin/users/USER_ID/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_LOCAL_ADMIN_SECRET" \
  -d '{"name": "Dev Key"}'
```

The `ADMIN_SECRET` for local dev comes from `backend/.dev.vars` (gitignored). Ask the owner for it.

---

## Adding a New Feature — Checklist

1. **Backend**: Add a route in `backend/src/routes/`. Register it in `backend/src/index.ts`.
2. **Types**: Add the new input/response types to `packages/core/src/types.ts`.
3. **Client**: Add a method to `ZakhiraClient` in `packages/core/src/client.ts`.
4. **Store**: After a successful API call, update the in-memory store immediately (`updateTaskInStore`, `addTaskToStore`, etc.) so the UI updates without a full refresh.
5. **UI**: Both apps reuse the same `ZakhiraClient` and the same types — the feature is available to both.

---

## Things That Might Surprise You

**No `null` in API responses for optional fields.** Optional strings come back as `null` (not `undefined`) because JSON doesn't have `undefined`. The TypeScript types reflect this: `notes: string | null`.

**`timeLogged` is in seconds.** The UI formats it to hours/minutes for display using `formatTime()` helpers in each app.

**`updatedAt` is used as a proxy for "when was this task last worked on"** in the time stats (Today/Week/Month). This is an approximation — if you edit a task's title at 11pm, it counts as time worked that day even if you didn't log any time. A proper solution would require per-session time entries.

**The desktop store hydrates synchronously.** `localStorage` is synchronous, so the desktop store reads all cached data before the first render. The mobile store is async (SecureStore for credentials, a file read for the cache), so the mobile app keeps a `loaded: false` initial state — but by the time it flips, the rows are already there, so the loading screen is only ever seen on the first launch after signing in.

**Mobile has no connectivity listener.** `store.online` is inferred from whether requests actually succeed, not from the radio. A reachable network with an unreachable backend is the same thing to the user, and the retry loop in `app/_layout.tsx` only runs while something is queued — so the cost of asking is lower than the cost of a native module that reports an opinion about the next request.

**Group delete, group reorder and comments are not queueable.** The first two are server-side rearrangements of a whole subtree whose result a device cannot predict; comments are fetched per task and never synced, so there is no local copy to append to. All three say they need a connection rather than failing obscurely.

**Completed and scrapped tasks are read-only in the UI.** The `isDone` flag (`state === "completed" || state === "scrapped"`) hides the status picker and disables the timer. The API will still accept updates to these tasks if you call it directly.
