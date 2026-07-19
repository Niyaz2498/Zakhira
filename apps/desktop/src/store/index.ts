import { ZakhiraClient } from "@zakhira/core";
import type { Operation, Task, Reminder } from "@zakhira/core";

const LS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

function loadCached<T>(key: string): T[] {
  try {
    const raw = LS.get(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch { return []; }
}

function saveCached<T>(key: string, items: T[]): void {
  LS.set(key, JSON.stringify(items));
}

export interface AppStore {
  apiKey: string | null;
  apiUrl: string;
  displayName: string | null;
  operations: Operation[];
  tasks: Task[];
  reminders: Reminder[];
  lastSyncedAt: string | null;
}

// Synchronously initialize from localStorage — available before first render
let _store: AppStore = {
  apiKey: LS.get("zakhira_api_key"),
  apiUrl: LS.get("zakhira_api_url") ?? (import.meta.env.VITE_API_URL ?? "https://zakhira-backend.zakhira.workers.dev"),
  displayName: LS.get("zakhira_display_name"),
  operations: loadCached<Operation>("zakhira_operations"),
  tasks: loadCached<Task>("zakhira_tasks"),
  reminders: loadCached<Reminder>("zakhira_reminders"),
  lastSyncedAt: LS.get("zakhira_last_synced_at"),
};

let _listeners: Array<(store: AppStore) => void> = [];

export function getStore(): AppStore { return _store; }

function notify() {
  for (const l of _listeners) l({ ..._store });
}

export function subscribe(listener: (store: AppStore) => void) {
  _listeners.push(listener);
  return () => { _listeners = _listeners.filter((l) => l !== listener); };
}

/** No-op — kept for call-site compatibility; state loads at module init. */
export function loadFromStore(): void { notify(); }

export function saveCredentials(apiKey: string, apiUrl: string): void {
  LS.set("zakhira_api_key", apiKey);
  LS.set("zakhira_api_url", apiUrl);
  _store = { ..._store, apiKey, apiUrl };
  notify();
}

export async function sync(): Promise<void> {
  if (!_store.apiKey) return;
  try {
    const client = new ZakhiraClient(_store.apiUrl, _store.apiKey);
    // Always full sync — avoids delta-sync gaps when in-memory store is stale/empty
    const res = await client.sync(undefined);
    if (!res.ok) return;

    const { operations, tasks, reminders, syncedAt } = res.data;

    _store = { ..._store, operations, tasks, reminders, lastSyncedAt: syncedAt };

    // Persist to localStorage so data survives restarts
    saveCached("zakhira_operations", operations);
    saveCached("zakhira_tasks", tasks);
    saveCached("zakhira_reminders", reminders);
    LS.set("zakhira_last_synced_at", syncedAt);

    notify();
  } catch (e) {
    console.error("sync failed:", e);
    // Don't wipe in-memory data on failure — keep showing cached data
  }
}

export function getClient(): ZakhiraClient | null {
  if (!_store.apiKey) return null;
  return new ZakhiraClient(_store.apiUrl, _store.apiKey);
}

export function addTask(task: Task): void {
  const tasks = [..._store.tasks, task];
  _store = { ..._store, tasks };
  saveCached("zakhira_tasks", tasks);
  notify();
}

export function addOperation(op: Operation): void {
  const operations = [..._store.operations, op];
  _store = { ..._store, operations };
  saveCached("zakhira_operations", operations);
  notify();
}

export function addReminder(reminder: Reminder): void {
  const reminders = [..._store.reminders, reminder];
  _store = { ..._store, reminders };
  saveCached("zakhira_reminders", reminders);
  notify();
}

export function logout(): void {
  LS.del("zakhira_api_key");
  LS.del("zakhira_display_name");
  LS.del("zakhira_operations");
  LS.del("zakhira_tasks");
  LS.del("zakhira_reminders");
  LS.del("zakhira_last_synced_at");
  _store = {
    ..._store,
    apiKey: null,
    displayName: null,
    operations: [],
    tasks: [],
    reminders: [],
    lastSyncedAt: null,
  };
  notify();
}

export function setDisplayName(name: string): void {
  const trimmed = name.trim() || null;
  if (trimmed) LS.set("zakhira_display_name", trimmed);
  else LS.del("zakhira_display_name");
  _store = { ..._store, displayName: trimmed };
  notify();
}

export function updateTaskInStore(updated: Task): void {
  const tasks = _store.tasks.map((t) => t.id === updated.id ? updated : t);
  _store = { ..._store, tasks };
  saveCached("zakhira_tasks", tasks);
  notify();
}

export function removeTaskFromStore(id: string): void {
  const tasks = _store.tasks.filter((t) => t.id !== id);
  _store = { ..._store, tasks };
  saveCached("zakhira_tasks", tasks);
  notify();
}
