import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Self-update against the `latest.json` published to GitHub Releases by the
 * release workflow.
 *
 * Every failure path here is non-fatal by design: no network, an unreachable
 * endpoint, a signature mismatch, or running in `tauri dev` (where the updater
 * is not configured) must never take the app down or interrupt the user. Errors
 * are logged and the state falls back to "idle".
 */

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready";

export interface UpdaterState {
  status: UpdateStatus;
  /** Version offered by the endpoint, once one is known. */
  version: string | null;
  /** True once a check has completed and found nothing — drives Settings copy. */
  checkedAndCurrent: boolean;
  /** Bytes progress while downloading, when the server sends a length. */
  progress: number | null;
  /** Dismissing hides the banner for this run only. */
  dismissed: boolean;
}

let _state: UpdaterState = {
  status: "idle",
  version: null,
  checkedAndCurrent: false,
  progress: null,
  dismissed: false,
};

let _listeners: ((s: UpdaterState) => void)[] = [];
let _pending: Update | null = null;

function notify() {
  for (const l of _listeners) l({ ..._state });
}

function set(patch: Partial<UpdaterState>) {
  _state = { ..._state, ...patch };
  notify();
}

export function getUpdaterState(): UpdaterState {
  return _state;
}

export function subscribeUpdater(listener: (s: UpdaterState) => void) {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

export function dismissUpdate(): void {
  set({ dismissed: true });
}

/** Looks for an update. Safe to call repeatedly; concurrent calls are ignored. */
export async function checkForUpdate(): Promise<void> {
  if (_state.status === "checking" || _state.status === "downloading") return;
  set({ status: "checking", checkedAndCurrent: false });
  try {
    const update = await check();
    if (update) {
      _pending = update;
      set({ status: "available", version: update.version, dismissed: false });
    } else {
      _pending = null;
      set({ status: "idle", version: null, checkedAndCurrent: true });
    }
  } catch (err) {
    console.warn("[updater] check failed:", err);
    _pending = null;
    set({ status: "idle", checkedAndCurrent: false });
  }
}

/**
 * Downloads and installs the pending update, then relaunches. On success this
 * call does not return — the process is replaced.
 */
export async function installUpdate(): Promise<void> {
  if (!_pending) return;
  set({ status: "downloading", progress: 0 });
  try {
    let downloaded = 0;
    let total: number | null = null;

    await _pending.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        set({ progress: total ? Math.round((downloaded / total) * 100) : null });
      } else if (event.event === "Finished") {
        set({ status: "ready", progress: 100 });
      }
    });

    await relaunch();
  } catch (err) {
    console.warn("[updater] install failed:", err);
    // Drop back to "available" so the user can retry from the banner.
    set({ status: "available", progress: null });
  }
}

export function useUpdater(): UpdaterState {
  const [state, setState] = useState<UpdaterState>(getUpdaterState());
  useEffect(() => subscribeUpdater(setState), []);
  return state;
}
