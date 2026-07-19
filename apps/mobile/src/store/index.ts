import * as SecureStore from "expo-secure-store";
import { ZakhiraClient } from "@zakhira/core";
import type { Operation, Task, Reminder } from "@zakhira/core";

const API_KEY_STORE = "zakhira_api_key";
const API_URL_STORE = "zakhira_api_url";
const LAST_SYNC_STORE = "zakhira_last_sync";

export interface AppStore {
  loaded: boolean;
  syncing: boolean;
  apiKey: string | null;
  apiUrl: string;
  operations: Operation[];
  tasks: Task[];
  reminders: Reminder[];
  lastSyncedAt: string | null;
}

let _store: AppStore = {
  loaded: false,
  syncing: false,
  apiKey: null,
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://zakhira-backend.zakhira.workers.dev",
  operations: [],
  tasks: [],
  reminders: [],
  lastSyncedAt: null,
};

let _listeners: Array<(store: AppStore) => void> = [];

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

export async function loadFromSecureStore(): Promise<void> {
  const [key, url, lastSync] = await Promise.all([
    SecureStore.getItemAsync(API_KEY_STORE),
    SecureStore.getItemAsync(API_URL_STORE),
    SecureStore.getItemAsync(LAST_SYNC_STORE),
  ]);
  _store = {
    ..._store,
    loaded: true,
    syncing: !!key, // pre-set so dashboard shows spinner before sync() fires
    apiKey: key,
    apiUrl: url ?? (process.env.EXPO_PUBLIC_API_URL ?? "https://zakhira-backend.zakhira.workers.dev"),
    lastSyncedAt: lastSync,
  };
  notify();
}

export async function saveApiKey(key: string, url: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORE, key);
  await SecureStore.setItemAsync(API_URL_STORE, url);
  _store = { ..._store, apiKey: key, apiUrl: url };
  notify();
}

export async function sync(): Promise<void> {
  if (!_store.apiKey) return;
  _store = { ..._store, syncing: true };
  notify();
  try {
    const client = new ZakhiraClient(_store.apiUrl, _store.apiKey);
    const res = await client.sync(_store.lastSyncedAt ?? undefined);
    if (!res.ok) {
      console.warn("[sync] server error:", res.error);
      return;
    }

    const { operations, tasks, reminders, syncedAt } = res.data;

    const mergeById = <T extends { id: string; updatedAt: string }>(
      existing: T[],
      incoming: T[]
    ): T[] => {
      const map = new Map(existing.map((e) => [e.id, e]));
      for (const item of incoming) {
        const ex = map.get(item.id);
        if (!ex || item.updatedAt > ex.updatedAt) map.set(item.id, item);
      }
      return Array.from(map.values());
    };

    _store = {
      ..._store,
      operations: mergeById(_store.operations, operations),
      tasks: mergeById(_store.tasks, tasks),
      reminders: mergeById(_store.reminders, reminders),
      lastSyncedAt: syncedAt,
    };

    await SecureStore.setItemAsync(LAST_SYNC_STORE, syncedAt);
  } catch (e) {
    console.warn("[sync] network error:", e);
  } finally {
    _store = { ..._store, syncing: false };
    notify();
  }
}

export async function logout(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(API_KEY_STORE),
    SecureStore.deleteItemAsync(API_URL_STORE),
    SecureStore.deleteItemAsync(LAST_SYNC_STORE),
  ]);
  _store = {
    loaded: true,
    syncing: false,
    apiKey: null,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://zakhira-backend.zakhira.workers.dev",
    operations: [],
    tasks: [],
    reminders: [],
    lastSyncedAt: null,
  };
  notify();
}

export function getClient(): ZakhiraClient | null {
  if (!_store.apiKey) return null;
  return new ZakhiraClient(_store.apiUrl, _store.apiKey);
}

export function updateTaskInStore(updated: Task): void {
  _store = { ..._store, tasks: _store.tasks.map((t) => t.id === updated.id ? updated : t) };
  notify();
}
