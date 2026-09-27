import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  timerAlertTimes,
  timerSessionHours,
  TIMER_ALERT_INTERVAL_SECONDS,
} from "@zakhira/core";
import type { Task } from "@zakhira/core";

/**
 * Hourly nudges for task timers left running.
 *
 * The problem this solves: a timer started and forgotten runs for a day. So
 * while a timer is going, the device reminds you every hour that it still is.
 *
 * Alerts are one-shot notifications scheduled at absolute times derived from
 * `timerStartedAt` (see `timerAlertTimes`). One-shot rather than repeating
 * because a repeating trigger fires relative to when it was *scheduled* — after
 * an app restart mid-session that would drift off the hour boundary.
 *
 * Nothing here is persisted locally. The scheduled notifications are themselves
 * the state: each carries its task id and session anchor in `content.data`, so
 * reconciliation can read back what is pending and diff it against the store.
 *
 * Every function fails soft. A denied permission or an unavailable notification
 * service must never break timers or block a render.
 */

/** Marks a scheduled notification as ours, so we never cancel anyone else's. */
const TAG = "zakhiraTimerAlert";
const ANDROID_CHANNEL = "timer-alerts";

interface AlertData {
  [key: string]: unknown;
  [TAG]: true;
  taskId: string;
  /** The `timerStartedAt` these alerts were anchored to. */
  startedAt: string;
}

function isOurs(data: unknown): data is AlertData {
  return typeof data === "object" && data !== null && TAG in data;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permissionChecked = false;
let permissionGranted = false;

/** Asks once per app run. Returns false rather than throwing if denied. */
async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) return permissionGranted;
  permissionChecked = true;
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    permissionGranted = status === "granted";

    // Android 8+ needs an explicit channel or notifications post silently.
    if (permissionGranted && Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: "Timer alerts",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: "#d9a441",
      });
    }
  } catch (err) {
    console.warn("[notifications] permission check failed:", err);
    permissionGranted = false;
  }
  return permissionGranted;
}

function alertBody(task: Task, at: Date): string {
  // Hours the session will have reached when this alert fires.
  const hours = timerSessionHours(task.timerStartedAt, at) || 1;
  return `"${task.title}" has been running for ${hours}h. Still working on it?`;
}

async function scheduleForTask(task: Task): Promise<number> {
  const startedAt = task.timerStartedAt;
  if (!startedAt) return 0;

  const times = timerAlertTimes(startedAt);
  for (const at of times) {
    const data: AlertData = { [TAG]: true, taskId: task.id, startedAt };
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Timer still running",
        body: alertBody(task, at),
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        // Android reads the channel from the trigger. Putting it on `content`
        // is silently ignored and falls back to expo's default channel.
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL } : null),
      },
    });
  }
  return times.length;
}

/**
 * Bring scheduled alerts in line with the tasks that are actually running.
 *
 * Safe to call often — on launch, on foreground, after every sync. It diffs
 * rather than rescheduling blindly, so a running timer keeps its existing
 * (correctly anchored) alerts instead of being pushed forward each call.
 *
 * This is also what handles a timer stopped on another device: the task comes
 * back from sync without `timerStartedAt`, and its alerts get cancelled here.
 */
export async function reconcileTimerAlerts(tasks: Task[]): Promise<void> {
  try {
    const running = new Map(
      tasks.filter((t) => t.timerStartedAt).map((t) => [t.id, t]),
    );

    // Only ask for permission if there is something to schedule — no point
    // prompting someone who has never started a timer.
    if (running.size > 0 && !(await ensurePermission())) return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    // taskId → the anchor its pending alerts were built from.
    const pending = new Map<string, { startedAt: string; ids: string[] }>();
    for (const n of scheduled) {
      const data = n.content.data;
      if (!isOurs(data)) continue;
      const entry = pending.get(data.taskId) ?? { startedAt: data.startedAt, ids: [] };
      entry.ids.push(n.identifier);
      pending.set(data.taskId, entry);
    }

    // Drop alerts for timers that stopped, or whose session restarted.
    for (const [taskId, entry] of pending) {
      const task = running.get(taskId);
      const stale = !task || task.timerStartedAt !== entry.startedAt;
      if (stale) {
        await Promise.all(
          entry.ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
        );
        pending.delete(taskId);
      }
    }

    // Schedule for anything running that has no live alerts.
    for (const [taskId, task] of running) {
      if (!pending.has(taskId)) {
        const times = await scheduleForTask(task);
        console.log(
          `[notifications] ${times} alert(s) queued for "${task.title}"`,
        );
      }
    }
  } catch (err) {
    console.warn("[notifications] reconcile failed:", err);
  }
}

/** Clears every alert we own. Used on sign-out. */
export async function cancelAllTimerAlerts(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => isOurs(n.content.data))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (err) {
    console.warn("[notifications] cancel-all failed:", err);
  }
}

export { TIMER_ALERT_INTERVAL_SECONDS };
