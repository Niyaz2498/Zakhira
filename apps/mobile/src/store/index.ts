import * as SecureStore from "expo-secure-store";

declare const process: { env: Record<string, string | undefined> };
import { ZakhiraClient } from "@zakhira/core";
import {
  applyGroupPatch,
  applyTaskPatch,
  mergeByUpdatedAt,
  newLocalId,
  optimisticGroup,
  optimisticTask,
  pendingTargetIds,
  reconcileFullSync,
  resolvePendingAgainstServer,
  sortPendingMutations,
} from "@zakhira/core";
import type {
  CreateGroupInput,
  CreateTaskInput,
  Group,
  PendingMutation,
  Reminder,
  Task,
  UpdateGroupInput,
  UpdateTaskInput,
} from "@zakhira/core";
import { cancelAllTimerAlerts } from "../notifications";
import { clearCache, loadCache, saveCache } from "./cache";

// ─── The store ───────────────────────────────────────────────────────────────
//
// The app reads from the device and writes to the device. The server is
// something the device reconciles with afterwards, when it can — so opening the
// app shows last night's tasks instantly, and creating one on a train creates
// it rather than failing.
//
// Two pieces of state carry that: the cached rows, and a queue of writes the
// server has not accepted yet. `@zakhira/core`'s offline helpers hold every
// rule about how the two combine, including the one that settles conflicts —
// the newer `updatedAt` wins, whichever device produced it.

const TOKEN_STORE = "zakhira_token";
const API_URL_STORE = "zakhira_api_url";
/**
 * Where the sync cursor used to live. It belongs with the data it describes —
 * a cursor without the rows it was issued against would make the next delta
 * sync skip everything that is missing — so it moved into the cache file. The
 * key is still cleared on sign-out to tidy up after older versions.
 */
const LEGACY_LAST_SYNC_STORE = "zakhira_last_sync";

const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://zakhira-backend.zakhira.workers.dev";

export interface AppStore {
  loaded: boolean;
  syncing: boolean;
  /**
   * Whether the last attempt reached the server. Inferred from whether
   * requests succeed rather than from the radio: a reachable network with an
   * unreachable backend is the same thing to the user, and it saves a native
   * dependency whose only job would be to tell us what the next fetch does.
   */
  online: boolean;
  token: string | null;
  apiUrl: string;
  groups: Group[];
  tasks: Task[];
  reminders: Reminder[];
  lastSyncedAt: string | null;
  /** Writes the server has not accepted yet, oldest first. */
  pending: PendingMutation[];
  /**
   * The last write the server refused outright, phrased for the user. A
   * rejection is not a retry — the queue drops it and the row goes back to
   * whatever the server holds — so it has to be said out loud or the change
   * would just vanish.
   */
  rejection: string | null;
}

let _store: AppStore = {
  loaded: false,
  syncing: false,
  online: true,
  token: null,
  apiUrl: DEFAULT_API_URL,
  groups: [],
  tasks: [],
  reminders: [],
  lastSyncedAt: null,
  pending: [],
  rejection: null,
};

let _listeners: Array<(store: AppStore) => void> = [];

/**
 * A full sync prunes; a delta sync cannot. Deletions are not reported by the
 * sync endpoint — a row deleted on another device simply stops being
 * mentioned — so the complete list the server returns for a full sync is the
 * only thing that can tell the cache a row is gone. One is taken per launch,
 * and on every pull-to-refresh.
 */
let _fullSyncDone = false;

export function getStore(): AppStore {
  return _store;
}

function notify() {
  for (const l of _listeners) l(_store);
}

export function subscribe(listener: (store: AppStore) => void) {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

/** Apply a change to the store, write the data half to disk, and redraw. */
function commit(patch: Partial<AppStore>): void {
  _store = { ..._store, ...patch };
  saveCache({
    groups: _store.groups,
    tasks: _store.tasks,
    reminders: _store.reminders,
    lastSyncedAt: _store.lastSyncedAt,
    pending: _store.pending,
  });
  notify();
}

/** Change the store without touching the cache file — status flags only. */
function setFlags(patch: Partial<AppStore>): void {
  _store = { ..._store, ...patch };
  notify();
}

// ─── Startup ─────────────────────────────────────────────────────────────────

/**
 * Bring back everything the last session left: credentials from SecureStore,
 * rows and queued writes from the cache file.
 *
 * Nothing renders until this resolves, and after it the screen is already
 * populated — the first sync is a reconciliation, not the thing that fills the
 * app in.
 */
export async function loadPersistedState(): Promise<void> {
  const [token, url] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_STORE),
    SecureStore.getItemAsync(API_URL_STORE),
  ]);
  const cached = loadCache();
  _store = {
    ..._store,
    loaded: true,
    // Only claim to be syncing if there is a session to sync, and only while
    // there is nothing to show yet; with cached rows on screen the spinner
    // would be reporting work the user is not waiting on.
    syncing: !!token && cached.tasks.length === 0 && cached.groups.length === 0,
    token,
    apiUrl: url ?? DEFAULT_API_URL,
    groups: cached.groups,
    tasks: cached.tasks,
    reminders: cached.reminders,
    lastSyncedAt: cached.lastSyncedAt,
    pending: cached.pending,
  };
  notify();
}

export async function saveToken(token: string, url: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_STORE, token);
  await SecureStore.setItemAsync(API_URL_STORE, url);
  setFlags({ token, apiUrl: url });
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Record that the server could not be reached.
 *
 * Every failure that arrives as a thrown error is one of these: `fetch` rejects
 * for DNS, connection and timeout failures, and a reply too broken to parse is
 * no more usable than no reply at all. Anything the server actually answered —
 * including a refusal — comes back as a value, not an exception.
 */
function markUnreachable(e: unknown): void {
  console.warn("[sync] could not reach the server:", e);
  setFlags({ online: false });
}

/**
 * Reconcile with the server: pull what changed, then push what is queued.
 *
 * The order is deliberate. Pulling first is what makes the conflict rule work —
 * a queued write is only worth sending if nobody has updated that row since the
 * user made it, and the pull is how we find out. Pushing second means the
 * responses, which are the server's own version of each row, land last and
 * settle the cache.
 *
 * Safe to call at any time, including from several places at once: overlapping
 * runs are dropped rather than queued, since every caller wants the same thing.
 */
export async function sync(options: { full?: boolean } = {}): Promise<void> {
  if (!_store.token) return;
  if (_store.syncing) return;

  const full = options.full ?? !_fullSyncDone;
  setFlags({ syncing: true });
  try {
    const client = new ZakhiraClient(_store.apiUrl, _store.token);
    const res = await client.sync(full ? undefined : (_store.lastSyncedAt ?? undefined));
    setFlags({ online: true });
    if (!res.ok) {
      console.warn("[sync] server error:", res.error);
      return;
    }

    const { groups, tasks, reminders, syncedAt } = res.data;

    // Settle conflicts before merging, so the queue and the cache agree about
    // which side won: a write the server has overtaken is dropped here, and
    // the merge below replaces the optimistic row it produced.
    const resolved = resolvePendingAgainstServer(_store.pending, [...groups, ...tasks]);
    if (resolved.superseded.length > 0) {
      console.log(
        `[sync] ${resolved.superseded.length} local change(s) superseded by newer server updates`
      );
    }

    const protectedIds = pendingTargetIds(resolved.keep);
    commit({
      groups: full
        ? reconcileFullSync(groups, _store.groups, protectedIds)
        : mergeByUpdatedAt(_store.groups, groups),
      tasks: full
        ? reconcileFullSync(tasks, _store.tasks, protectedIds)
        : mergeByUpdatedAt(_store.tasks, tasks),
      // Reminders are read-only on mobile, so there is never a local version to
      // weigh against the server's.
      reminders: full ? reminders : mergeByUpdatedAt(_store.reminders, reminders),
      lastSyncedAt: syncedAt,
      pending: resolved.keep,
    });
    if (full) _fullSyncDone = true;
  } catch (e) {
    markUnreachable(e);
  } finally {
    setFlags({ syncing: false });
  }

  await flushQueue();
}

// ─── The write queue ─────────────────────────────────────────────────────────

let _flushing = false;

/**
 * Send queued writes, oldest first, until one cannot be sent.
 *
 * Stopping at the first network failure is the point, not an optimisation:
 * later writes can depend on earlier ones — a task filed in a group that is
 * itself still queued — and sending them out of order would have the server
 * reject work that is perfectly valid in sequence.
 *
 * A write the server *answers* with a refusal is a different matter. It will be
 * refused every time, so it is dropped rather than left to block the queue
 * forever, and the row is reloaded from the server so the screen stops showing
 * a change that did not happen.
 */
export async function flushQueue(): Promise<void> {
  if (_flushing || !_store.token || _store.pending.length === 0) return;
  _flushing = true;
  try {
    const client = new ZakhiraClient(_store.apiUrl, _store.token);

    for (const mutation of sortPendingMutations(_store.pending)) {
      try {
        const res = await send(client, mutation);
        setFlags({ online: true });

        if (res.ok) {
          applyServerRow(mutation, res.row);
          dropMutation(mutation.id);
          continue;
        }

        console.warn(`[sync] server refused ${mutation.kind}:`, res.error);
        dropMutation(mutation.id);
        setFlags({ rejection: res.error });
        await restoreFromServer(client, mutation);
      } catch (e) {
        // Unreachable: keep the write, keep its order, try again later.
        markUnreachable(e);
        bumpAttempt(mutation.id, e);
        break;
      }
    }
  } finally {
    _flushing = false;
  }
}

type SendResult =
  | { ok: true; row: Task | Group }
  | { ok: false; error: string };

/** Put one queued write on the wire. */
async function send(
  client: ZakhiraClient,
  mutation: PendingMutation
): Promise<SendResult> {
  switch (mutation.kind) {
    case "createTask": {
      // The id travels with the create, so the row the server stores is the
      // one already on screen and a replay is recognised rather than repeated.
      const res = await client.createTask({ ...mutation.input, id: mutation.targetId });
      return res.ok ? { ok: true, row: res.data } : { ok: false, error: res.error };
    }
    case "updateTask": {
      const res = await client.updateTask(mutation.targetId, mutation.input);
      return res.ok ? { ok: true, row: res.data } : { ok: false, error: res.error };
    }
    case "createGroup": {
      const res = await client.createGroup({ ...mutation.input, id: mutation.targetId });
      return res.ok ? { ok: true, row: res.data } : { ok: false, error: res.error };
    }
    case "updateGroup": {
      const res = await client.updateGroup(mutation.targetId, mutation.input);
      return res.ok ? { ok: true, row: res.data } : { ok: false, error: res.error };
    }
  }
}

/** Replace the optimistic row with the server's version of it. */
function applyServerRow(mutation: PendingMutation, row: Task | Group): void {
  if (mutation.kind === "createTask" || mutation.kind === "updateTask") {
    const task = row as Task;
    commit({ tasks: _store.tasks.map((t) => (t.id === task.id ? task : t)) });
  } else {
    const group = row as Group;
    commit({ groups: _store.groups.map((g) => (g.id === group.id ? group : g)) });
  }
}

/**
 * Put the row back the way the server has it, after the server refused the
 * change the screen is currently showing.
 *
 * Refetching rather than remembering a previous value: the server is the only
 * thing that knows what the row looks like now, and the alternative — keeping
 * an undo copy per queued write — would be a second source of truth to keep
 * correct. A row that is gone, or was never accepted in the first place, is
 * removed locally.
 */
async function restoreFromServer(
  client: ZakhiraClient,
  mutation: PendingMutation
): Promise<void> {
  const isTask = mutation.kind === "createTask" || mutation.kind === "updateTask";
  try {
    const res = isTask
      ? await client.getTask(mutation.targetId)
      : await client.getGroup(mutation.targetId);
    if (res.ok) {
      applyServerRow(mutation, res.data);
      return;
    }
  } catch (e) {
    // Offline again. The row stays as it is; the next full sync prunes it.
    markUnreachable(e);
    return;
  }
  // The server has no such row: the create was refused, so neither should we.
  if (isTask) {
    commit({ tasks: _store.tasks.filter((t) => t.id !== mutation.targetId) });
  } else {
    commit({ groups: _store.groups.filter((g) => g.id !== mutation.targetId) });
  }
}

function dropMutation(id: string): void {
  commit({ pending: _store.pending.filter((m) => m.id !== id) });
}

function bumpAttempt(id: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  commit({
    pending: _store.pending.map((m) =>
      m.id === id ? { ...m, attempts: m.attempts + 1, lastError: message } : m
    ),
  });
}

function enqueue(mutation: PendingMutation): void {
  commit({ pending: [..._store.pending, mutation] });
  // Try immediately: online, this is indistinguishable from the old
  // write-then-update behaviour, just without the user waiting on it.
  void flushQueue();
}

/** Dismiss the notice about a refused write. */
export function clearRejection(): void {
  setFlags({ rejection: null });
}

// ─── Local-first writes ──────────────────────────────────────────────────────
//
// Each of these puts the change on screen, writes it to disk and queues it, in
// that order, and returns without waiting for a server. The row it returns is
// the optimistic one — good enough to open a detail view on, and replaced by
// the server's copy the moment the write lands.

export function createTaskLocally(input: CreateTaskInput): Task {
  const now = new Date().toISOString();
  const id = newLocalId();
  const task = optimisticTask(id, input, now);
  commit({ tasks: [..._store.tasks, task] });
  enqueue({
    id: newLocalId(),
    kind: "createTask",
    targetId: id,
    input,
    queuedAt: now,
    attempts: 0,
  });
  return task;
}

export function createGroupLocally(input: CreateGroupInput): Group {
  const now = new Date().toISOString();
  const id = newLocalId();
  const group = optimisticGroup(id, input, now);
  commit({ groups: [..._store.groups, group] });
  enqueue({
    id: newLocalId(),
    kind: "createGroup",
    targetId: id,
    input,
    queuedAt: now,
    attempts: 0,
  });
  return group;
}

/**
 * Edit a task now, send it later. Returns the task as it will look, or `null`
 * if the id is not one this device is holding.
 */
export function updateTaskLocally(id: string, input: UpdateTaskInput): Task | null {
  const existing = _store.tasks.find((t) => t.id === id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const updated = applyTaskPatch(existing, input, now);
  commit({ tasks: _store.tasks.map((t) => (t.id === id ? updated : t)) });
  enqueue({
    id: newLocalId(),
    kind: "updateTask",
    targetId: id,
    input,
    queuedAt: now,
    attempts: 0,
  });
  return updated;
}

export function updateGroupLocally(id: string, input: UpdateGroupInput): Group | null {
  const existing = _store.groups.find((g) => g.id === id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const updated = applyGroupPatch(existing, input, now);
  commit({ groups: _store.groups.map((g) => (g.id === id ? updated : g)) });
  enqueue({
    id: newLocalId(),
    kind: "updateGroup",
    targetId: id,
    input,
    queuedAt: now,
    attempts: 0,
  });
  return updated;
}

// ─── Sign out ────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  // Pending timer alerts are scheduled with the OS and would otherwise keep
  // firing about tasks this device can no longer see.
  await cancelAllTimerAlerts();
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_STORE),
    SecureStore.deleteItemAsync(API_URL_STORE),
    SecureStore.deleteItemAsync(LEGACY_LAST_SYNC_STORE),
  ]);
  // Unsent writes go too. They are addressed to a session that no longer
  // exists, and replaying them under the next sign-in would file one person's
  // tasks into another's account.
  clearCache();
  _fullSyncDone = false;
  _store = {
    loaded: true,
    syncing: false,
    online: _store.online,
    token: null,
    apiUrl: DEFAULT_API_URL,
    groups: [],
    tasks: [],
    reminders: [],
    lastSyncedAt: null,
    pending: [],
    rejection: null,
  };
  notify();
}

export function getClient(): ZakhiraClient | null {
  if (!_store.token) return null;
  return new ZakhiraClient(_store.apiUrl, _store.token);
}

// ─── Writes that still need the server ───────────────────────────────────────
//
// Deleting a group and reordering groups are not queued. Both are server-side
// rearrangements rather than edits to one row — a delete re-parents or removes
// a whole subtree, a reorder renumbers a set of siblings — and a device cannot
// work out the result on its own, let alone replay it correctly against a tree
// that may have changed in the meantime. They report that they need a
// connection instead of pretending to work. The helpers below keep the cache
// honest once the server has answered.

export function updateTaskInStore(updated: Task): void {
  commit({ tasks: _store.tasks.map((t) => (t.id === updated.id ? updated : t)) });
}

export function updateGroupInStore(updated: Group): void {
  commit({ groups: _store.groups.map((g) => (g.id === updated.id ? updated : g)) });
}

/**
 * Drop a deleted group. The server has already re-parented or removed its
 * subtree; the next sync reconciles the rest.
 */
export function removeGroupFromStore(id: string): void {
  commit({ groups: _store.groups.filter((g) => g.id !== id) });
}
