import { Directory, File, Paths } from "expo-file-system";
import type { Group, PendingMutation, Reminder, Task } from "@zakhira/core";

// ─── The on-device copy of everything ────────────────────────────────────────
//
// What the app shows when it opens, before any request has been made, and what
// it keeps showing when there is no connection at all. One file, written whole:
// the four lists are read and merged together on every sync, so splitting them
// would only create ways for them to disagree.
//
// It lives in the document directory rather than the cache directory, which the
// system is free to empty when storage runs low — losing the queue would lose
// work the user has already done. The auth token stays in SecureStore; this is
// ordinary app-private storage and is not encrypted at rest.

const FILE_NAME = "zakhira-cache.json";

/**
 * Bumped when the stored shape changes in a way old files cannot satisfy. A
 * file from a different version is discarded rather than guessed at — the next
 * sync refills it, so there is nothing to migrate and nothing to get wrong.
 */
const CACHE_VERSION = 1;

export interface CachedState {
  groups: Group[];
  tasks: Task[];
  reminders: Reminder[];
  lastSyncedAt: string | null;
  pending: PendingMutation[];
}

const EMPTY: CachedState = {
  groups: [],
  tasks: [],
  reminders: [],
  lastSyncedAt: null,
  pending: [],
};

function cacheFile(): File {
  return new File(Paths.document, FILE_NAME);
}

/** Every array the stored shape promises, or `null` if this is not that shape. */
function readLists(raw: unknown): CachedState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== CACHE_VERSION) return null;
  if (
    !Array.isArray(obj.groups) ||
    !Array.isArray(obj.tasks) ||
    !Array.isArray(obj.reminders) ||
    !Array.isArray(obj.pending)
  ) {
    return null;
  }
  return {
    groups: obj.groups as Group[],
    tasks: obj.tasks as Task[],
    reminders: obj.reminders as Reminder[],
    lastSyncedAt: typeof obj.lastSyncedAt === "string" ? obj.lastSyncedAt : null,
    pending: obj.pending as PendingMutation[],
  };
}

/**
 * The cached state, or empty if there is nothing usable on disk.
 *
 * Never throws. A missing file is the ordinary first-launch case; a truncated
 * one — the app was killed mid-write — is indistinguishable from it as far as
 * the caller is concerned, and both are answered by syncing.
 */
export function loadCache(): CachedState {
  try {
    const file = cacheFile();
    if (!file.exists) return EMPTY;
    return readLists(JSON.parse(file.textSync())) ?? EMPTY;
  } catch (e) {
    console.warn("[cache] unreadable, starting empty:", e);
    return EMPTY;
  }
}

/**
 * Write the cache out. Synchronous, and called after every change the user
 * makes — the file is small and the alternative is a window in which a
 * just-created task exists only in memory.
 */
export function saveCache(state: CachedState): void {
  try {
    const file = cacheFile();
    if (!file.exists) file.create({ intermediates: true });
    file.write(JSON.stringify({ version: CACHE_VERSION, ...state }));
  } catch (e) {
    // Losing a write is bad but not worth taking the screen down for. The next
    // save, a second from now, will probably succeed.
    console.warn("[cache] write failed:", e);
  }
}

/**
 * Remove the cache entirely. Signing out has to take the data with it: the
 * next person to open the app must not find the last one's tasks waiting.
 */
export function clearCache(): void {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch (e) {
    console.warn("[cache] delete failed:", e);
  }
}

/** Where the cache lives, for the settings screen's storage note. */
export function cacheLocation(): string {
  return new Directory(Paths.document).uri;
}
