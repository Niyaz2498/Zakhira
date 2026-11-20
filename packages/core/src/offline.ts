import type {
  CreateGroupInput,
  CreateTaskInput,
  Group,
  Task,
  UpdateGroupInput,
  UpdateTaskInput,
} from "./types.js";

// ─── Offline writes and eventual consistency ─────────────────────────────────
//
// A client that can be used without a connection holds two things: a cached
// copy of what the server last said, and a queue of writes the server has not
// seen yet. What the user looks at is the cache with the queue already applied
// on top — so a task created on a train is a task, not a pending request.
//
// Everything here is pure and takes its clock as an argument, because the whole
// feature turns on comparing timestamps and that is only testable if the clock
// is an input.
//
// ## The conflict rule
//
// One rule decides every collision: **the newer update wins**, where "newer"
// means the larger `updatedAt`. It is applied in two places and they agree:
//
//   - merging a sync response into the cache (`mergeByUpdatedAt`), and
//   - deciding whether a queued write is still worth sending
//     (`resolvePendingAgainstServer`).
//
// A queued write carries `queuedAt` — when the user actually made the change —
// and the optimistic row it produced carries that same stamp as its
// `updatedAt`. So a server row that changed after the user's edit beats it, the
// optimistic row is replaced by the server's on merge, and the now-pointless
// write is dropped from the queue. The two halves cannot disagree, because
// both are comparing the same two numbers.
//
// The timestamps come from two different clocks — the device's and the
// server's. A device whose clock is badly wrong will win or lose conflicts it
// should not have. That is the accepted cost of resolving by update time.

/** What a queued write is addressed to. */
export type PendingMutationKind =
  | "createGroup"
  | "updateGroup"
  | "createTask"
  | "updateTask";

export interface PendingMutationBase {
  /** Id of the queue entry itself — not the row it writes to. */
  id: string;
  /** The row being written: a task id for task writes, a group id for group writes. */
  targetId: string;
  /**
   * When the user made the change, by the device's clock.
   *
   * This is the conflict rule's input, not a log line: a server row updated
   * after this moment is newer than the user's edit and supersedes it.
   */
  queuedAt: string;
  /** Failed send attempts. Shown to the user once a write keeps failing. */
  attempts: number;
  /** Why the last attempt failed, if it did. */
  lastError?: string;
}

export type PendingMutation =
  | (PendingMutationBase & { kind: "createGroup"; input: CreateGroupInput })
  | (PendingMutationBase & { kind: "updateGroup"; input: UpdateGroupInput })
  | (PendingMutationBase & { kind: "createTask"; input: CreateTaskInput })
  | (PendingMutationBase & { kind: "updateTask"; input: UpdateTaskInput });

/** True for the two kinds that bring a row into existence. */
export function isCreateMutation(m: PendingMutation): boolean {
  return m.kind === "createGroup" || m.kind === "createTask";
}

// ─── Local ids ───────────────────────────────────────────────────────────────

/**
 * A UUID v4 for a row the server has not seen yet.
 *
 * The id is minted on the device and sent with the create, so the row keeps one
 * identity for its whole life: nothing has to be re-keyed when the write lands,
 * and a create that is retried after a lost response is recognised by the
 * server as the one it already stored rather than filed as a second task.
 *
 * `Math.random` rather than a crypto source because `@zakhira/core` stays
 * platform-neutral — React Native has no `crypto.randomUUID`. These ids are
 * names, not secrets; collision with a server-minted UUID is not a risk worth a
 * native dependency.
 */
export function newLocalId(rand: () => number = Math.random): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");
  // Version 4, variant 1 — the two fixed nibbles are what make it a valid v4.
  const variant = ((Math.floor(rand() * 4) + 8) % 16).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

// ─── Queue order ─────────────────────────────────────────────────────────────

/**
 * The queue in the order it must be sent: oldest first.
 *
 * Chronological order is also dependency order. A task can only be filed in a
 * group that already exists on the device, so the group's create was queued
 * first and is sent first; the same holds for an edit to a task created
 * offline moments earlier. Sorting by anything else would break that.
 *
 * Ties keep their existing relative order, so two writes stamped in the same
 * millisecond still go out in the order the user made them.
 */
export function sortPendingMutations(queue: PendingMutation[]): PendingMutation[] {
  return queue
    .map((m, index) => ({ m, index }))
    .sort((a, b) =>
      a.m.queuedAt === b.m.queuedAt
        ? a.index - b.index
        : a.m.queuedAt < b.m.queuedAt
          ? -1
          : 1
    )
    .map(({ m }) => m);
}

/** Ids of every row with an unsent write, for marking them in the UI. */
export function pendingTargetIds(queue: PendingMutation[]): Set<string> {
  return new Set(queue.map((m) => m.targetId));
}

/** Whether this row is waiting on the server. */
export function hasPendingWrite(queue: PendingMutation[], targetId: string): boolean {
  return queue.some((m) => m.targetId === targetId);
}

// ─── Conflict resolution ─────────────────────────────────────────────────────

export interface PendingResolution {
  /** Writes still worth sending. */
  keep: PendingMutation[];
  /** Writes a newer server update has overtaken. Dropped, not sent. */
  superseded: PendingMutation[];
}

/**
 * Split the queue against what the server just sent back.
 *
 * A queued write survives unless the server's own copy of that row was updated
 * *after* the user queued it — in which case the other device's edit is the
 * newer one, it is about to replace the optimistic row in the cache anyway, and
 * sending the stale write would undo it.
 *
 * Rows absent from the response cannot conflict: a delta sync returns only what
 * changed, so silence means the server still holds what this device last saw.
 *
 * This also quietly handles a create whose response was lost. The server comes
 * back holding the row, stamped later than the queued create, so the create is
 * dropped instead of being sent a second time.
 */
export function resolvePendingAgainstServer(
  queue: PendingMutation[],
  serverRows: { id: string; updatedAt: string }[]
): PendingResolution {
  const serverUpdatedAt = new Map(serverRows.map((r) => [r.id, r.updatedAt]));
  const keep: PendingMutation[] = [];
  const superseded: PendingMutation[] = [];

  for (const m of queue) {
    const serverAt = serverUpdatedAt.get(m.targetId);
    if (serverAt !== undefined && serverAt > m.queuedAt) superseded.push(m);
    else keep.push(m);
  }
  return { keep, superseded };
}

// ─── Merging server state into the cache ─────────────────────────────────────

/**
 * Fold a sync response into the cached rows, newest update winning per row.
 *
 * Rows the response does not mention are left alone — that is what makes this
 * safe for a delta sync, which only reports what changed. An optimistic row
 * whose write is still queued carries the moment the user made the edit, so it
 * survives this merge unless the server has something newer, which is the one
 * case where it should not.
 */
export function mergeByUpdatedAt<T extends { id: string; updatedAt: string }>(
  cached: T[],
  incoming: T[]
): T[] {
  const byId = new Map(cached.map((row) => [row.id, row]));
  for (const row of incoming) {
    const existing = byId.get(row.id);
    if (!existing || row.updatedAt > existing.updatedAt) byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

/**
 * Replace the cache with a full sync's contents, keeping only the local rows
 * that the server has no opinion about yet.
 *
 * Merging cannot do this job. Deletions are not reported by the sync endpoint —
 * a row removed on another device simply stops being mentioned — so a cache
 * that is only ever merged into accumulates rows that no longer exist. A full
 * sync is the one moment the server's list is complete, and taking it verbatim
 * is what prunes them.
 *
 * `protectedIds` are the rows with unsent writes, typically everything created
 * offline. They are absent from the server's list because it has not been told
 * about them, which is the opposite of deleted, so they are carried over.
 */
export function reconcileFullSync<T extends { id: string }>(
  server: T[],
  cached: T[],
  protectedIds: Set<string>
): T[] {
  const serverIds = new Set(server.map((row) => row.id));
  const localOnly = cached.filter(
    (row) => protectedIds.has(row.id) && !serverIds.has(row.id)
  );
  return [...server, ...localOnly];
}

// ─── Optimistic rows ─────────────────────────────────────────────────────────

/**
 * The row a create shows immediately, before any server has heard of it.
 *
 * Every field the server would have defaulted is defaulted the same way here,
 * so the tile the user sees now is the tile they will see after the write
 * lands. `updatedAt` is `at` — the conflict rule reads it.
 */
export function optimisticTask(id: string, input: CreateTaskInput, at: string): Task {
  return {
    id,
    groupId: input.groupId,
    title: input.title,
    type: input.type,
    state: input.state ?? "todo",
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    importance: input.importance ?? null,
    notes: input.notes ?? null,
    timeLogged: 0,
    timerStartedAt: null,
    reminderId: null,
    createdAt: at,
    updatedAt: at,
    prerequisites: input.prerequisites ?? [],
  };
}

/** The group equivalent of `optimisticTask`. */
export function optimisticGroup(id: string, input: CreateGroupInput, at: string): Group {
  return {
    id,
    name: input.name,
    description: input.description ?? null,
    parentId: input.parentId ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    importance: input.importance ?? null,
    isDefault: false,
    // Never reordered, so it sorts after every positioned sibling — the same
    // place the server would put it.
    sortOrder: null,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Apply an edit to a cached task the way the backend would.
 *
 * The `in` checks matter and are not interchangeable with `??`: for the
 * nullable fields, an absent key means "leave it alone" while an explicit
 * `null` means "clear it", and the backend's PATCH draws that line the same
 * way. Getting it wrong here would show one thing offline and another after
 * the write lands.
 */
export function applyTaskPatch(task: Task, input: UpdateTaskInput, at: string): Task {
  return {
    ...task,
    title: input.title ?? task.title,
    groupId: input.groupId ?? task.groupId,
    type: input.type ?? task.type,
    state: input.state ?? task.state,
    startDate: "startDate" in input ? (input.startDate ?? null) : task.startDate,
    endDate: "endDate" in input ? (input.endDate ?? null) : task.endDate,
    importance: "importance" in input ? (input.importance ?? null) : task.importance,
    notes: "notes" in input ? (input.notes ?? null) : task.notes,
    timeLogged: "timeLogged" in input ? (input.timeLogged ?? 0) : task.timeLogged,
    timerStartedAt:
      "timerStartedAt" in input ? (input.timerStartedAt ?? null) : task.timerStartedAt,
    // A re-parent drops prerequisites, matching the backend: they are only ever
    // compared within one group.
    prerequisites:
      input.groupId !== undefined && input.groupId !== task.groupId
        ? []
        : (input.prerequisites ?? task.prerequisites),
    updatedAt: at,
  };
}

/** The group equivalent of `applyTaskPatch`. */
export function applyGroupPatch(group: Group, input: UpdateGroupInput, at: string): Group {
  return {
    ...group,
    name: input.name ?? group.name,
    description: "description" in input ? (input.description ?? null) : group.description,
    parentId: "parentId" in input ? (input.parentId ?? null) : group.parentId,
    startDate: "startDate" in input ? (input.startDate ?? null) : group.startDate,
    endDate: "endDate" in input ? (input.endDate ?? null) : group.endDate,
    importance: "importance" in input ? (input.importance ?? null) : group.importance,
    updatedAt: at,
  };
}

// ─── Reporting the queue ─────────────────────────────────────────────────────

/**
 * How the sync state reads in a status line.
 *
 * Phrased around the work, not the connection: "2 changes waiting to sync" is
 * something the user can act on, where "offline" is a fact about the radio.
 */
export function describeSyncState(
  pendingCount: number,
  online: boolean,
  lastSyncedAt: string | null
): string {
  if (pendingCount > 0) {
    const changes = `${pendingCount} change${pendingCount === 1 ? "" : "s"}`;
    return online ? `Syncing ${changes}…` : `${changes} waiting to sync`;
  }
  if (!online) return lastSyncedAt ? "Offline — showing saved data" : "Offline";
  return "Up to date";
}
