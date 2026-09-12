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
│   │   │   ├── operations.ts
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
│   │   ├── types.ts          All domain interfaces (Task, Operation, etc.)
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
│       │       ├── operations.tsx
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
│   /operations   /tasks   /reminders   /keys   /sync          │
│   /admin   /bootstrap   /health                               │
└───────────────────────────────────────────────────────────────┘
```

---

## The Data Model

Everything belongs to a **User**. Each user can have many **Operations** (think: projects or campaigns). Each Operation has many **Tasks**.

```
User
 └── Operation (project)
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
- An Operation is considered "complete" when all its **Main Quest** tasks are done — Side Quests and Exploration tasks are optional. (`computeOperationStats`)

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
                  │  { apiKey, tasks, operations, ... }  │
                  └─────────────────┬────────────────────┘
                                    │
           subscribe(fn) ◄──────────┤──────────► notify()
                                    │
                  ┌─────────────────▼────────────────────┐
                  │   useStore() hook (React component)   │
                  │   calls setState on every notify()    │
                  └──────────────────────────────────────┘
```

**Mobile** (`apps/mobile/src/store/index.ts`):
- Credentials are persisted in `expo-secure-store` (encrypted OS keychain)
- Data loads from the server on boot via the `sync()` function
- After every successful API call, the store is updated immediately with `updateTaskInStore()`, `addTaskToStore()`, etc. — so the UI reflects changes without waiting for the next sync

**Desktop** (`apps/desktop/src/store/index.ts`):
- Credentials + cached data are persisted in `localStorage`
- Store is initialized **synchronously** at module load (before first render), so there's no loading flash
- Full sync on every Refresh button click

---

## Sync Protocol

The backend has a `GET /sync?since=<ISO timestamp>` endpoint that returns all Operations, Tasks, and Reminders modified after a given timestamp. Clients pass their `lastSyncedAt` time and receive only what changed.

**Mobile** does delta sync — only fetches what changed since the last sync timestamp.

**Desktop** does a full sync on every refresh (passes no `since` parameter). This is a simpler approach that avoids edge cases when the in-memory cache gets out of sync.

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

**The desktop store hydrates synchronously.** `localStorage` is synchronous, so the desktop store reads all cached data before the first render. The mobile `SecureStore` is async, so the mobile app has a `loaded: false` initial state and shows a loading screen.

**Completed and scrapped tasks are read-only in the UI.** The `isDone` flag (`state === "completed" || state === "scrapped"`) hides the status picker and disables the timer. The API will still accept updates to these tasks if you call it directly.
