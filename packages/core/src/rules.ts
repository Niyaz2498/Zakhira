import type { Task, TaskState, OperationStats } from "./types.js";

// ─── Cycle detection (DFS) ───────────────────────────────────────────────────

/**
 * Returns true if adding `newPrereqId` as a prerequisite of `taskId` would
 * introduce a cycle in the dependency graph.
 *
 * adjacency: taskId → set of prerequisite IDs (edges point "blocked-by").
 * A cycle exists if following prereqs from newPrereqId ever reaches taskId.
 */
export function wouldCreateCycle(
  taskId: string,
  newPrereqId: string,
  allPrereqs: Map<string, string[]>
): boolean {
  const visited = new Set<string>();
  const stack = [newPrereqId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const prereqs = allPrereqs.get(current) ?? [];
    for (const p of prereqs) {
      stack.push(p);
    }
  }
  return false;
}

/**
 * Given the full prerequisite map for an operation, validate that the
 * proposed prerequisite list for `taskId` creates no cycle.
 * Returns the IDs that would create a cycle.
 */
export function findCycleCreators(
  taskId: string,
  proposedPrereqs: string[],
  allPrereqs: Map<string, string[]>
): string[] {
  return proposedPrereqs.filter((prereqId) =>
    wouldCreateCycle(taskId, prereqId, allPrereqs)
  );
}

// ─── Completion gating ───────────────────────────────────────────────────────

const OPEN_STATES: TaskState[] = ["todo", "in_progress", "blocked"];

export function isTaskOpen(state: TaskState): boolean {
  return OPEN_STATES.includes(state);
}

/**
 * Returns true if the task can be marked Complete.
 * Rule: all prerequisites must be non-open (completed or scrapped).
 */
export function canComplete(task: Task, allTasksInOp: Task[]): boolean {
  if (task.prerequisites.length === 0) return true;
  const taskMap = new Map(allTasksInOp.map((t) => [t.id, t]));
  return task.prerequisites.every((prereqId) => {
    const prereq = taskMap.get(prereqId);
    return prereq !== undefined && !isTaskOpen(prereq.state);
  });
}

/**
 * Returns the blocking prerequisites (those still open).
 */
export function blockingPrerequisites(task: Task, allTasksInOp: Task[]): Task[] {
  const taskMap = new Map(allTasksInOp.map((t) => [t.id, t]));
  return task.prerequisites
    .map((id) => taskMap.get(id))
    .filter((t): t is Task => t !== undefined && isTaskOpen(t.state));
}

// ─── Operation completion ────────────────────────────────────────────────────

/**
 * An operation is complete when ALL its main quest tasks are complete.
 * Side quests and Exploration tasks do not count.
 */
export function computeOperationStats(tasks: Task[]): OperationStats {
  const mainTasks = tasks.filter((t) => t.type === "main");
  const completedMain = mainTasks.filter((t) => t.state === "completed").length;
  return {
    totalMain: mainTasks.length,
    completedMain,
    isComplete: mainTasks.length > 0 && completedMain === mainTasks.length,
  };
}

// ─── Prerequisite adjacency builder ──────────────────────────────────────────

export function buildPrereqMap(tasks: Task[]): Map<string, string[]> {
  return new Map(tasks.map((t) => [t.id, t.prerequisites]));
}

// ─── Display ordering ────────────────────────────────────────────────────────

/**
 * Sort rank for a task's state. Open work comes first, most-active first, so
 * what you're currently doing sits at the top of the list; finished work sinks.
 */
const STATE_DISPLAY_RANK: Record<TaskState, number> = {
  in_progress: 0,
  todo: 1,
  blocked: 2,
  completed: 3,
  scrapped: 4,
};

export interface TaskDisplayGroups {
  /** Still open: in progress, then todo, then blocked. */
  active: Task[];
  /** Finished: completed, then scrapped. Rendered below a divider. */
  done: Task[];
}

/**
 * Split an operation's tasks into the two groups the Operations screens render.
 *
 * Sorting is by state rank only. `Array.prototype.sort` is stable, so tasks
 * sharing a state keep the order they came in — a task won't jump position
 * because an unrelated one changed.
 */
export function groupTasksForDisplay(tasks: Task[]): TaskDisplayGroups {
  const byRank = (a: Task, b: Task) =>
    STATE_DISPLAY_RANK[a.state] - STATE_DISPLAY_RANK[b.state];

  return {
    // filter() copies, so sorting these never mutates the caller's array.
    active: tasks.filter((t) => isTaskOpen(t.state)).sort(byRank),
    done: tasks.filter((t) => !isTaskOpen(t.state)).sort(byRank),
  };
}

// ─── Long-running timer alerts ───────────────────────────────────────────────

/** How often to nudge while a timer keeps running, in seconds. */
export const TIMER_ALERT_INTERVAL_SECONDS = 3600;

/** How far ahead to schedule. Beyond a day the reminder has made its point. */
export const TIMER_ALERT_MAX_ALERTS = 24;

/**
 * When to nudge about a task whose timer is still running.
 *
 * Alerts are anchored to `timerStartedAt` — the start of the *current* session —
 * not to total time logged. A task with 45 minutes already banked that is
 * restarted alerts once the new session reaches an hour, i.e. at 1h45m total.
 * That is deliberate: the thing worth flagging is "you have been running this
 * without pause", not "this task has consumed an hour overall".
 *
 * Returns absolute times so callers can schedule one-shot notifications that
 * stay correctly anchored even if the app restarts mid-session. A repeating
 * "every hour from now" trigger would drift on every relaunch.
 *
 * @param timerStartedAt ISO timestamp the session began, or null if stopped.
 * @param now            Current time; injectable for testing.
 */
export function timerAlertTimes(
  timerStartedAt: string | null,
  now: Date = new Date(),
): Date[] {
  if (!timerStartedAt) return [];

  const startMs = new Date(timerStartedAt).getTime();
  if (Number.isNaN(startMs)) return [];

  const times: Date[] = [];
  for (let n = 1; n <= TIMER_ALERT_MAX_ALERTS; n++) {
    const at = startMs + n * TIMER_ALERT_INTERVAL_SECONDS * 1000;
    // Skip boundaries already passed — the app may have been closed through them.
    if (at > now.getTime()) times.push(new Date(at));
  }
  return times;
}

/**
 * Hours a timer has been running this session, floored. Used for alert copy
 * ("Still tracking — 2h"), so it counts session time, not `timeLogged`.
 */
export function timerSessionHours(
  timerStartedAt: string | null,
  now: Date = new Date(),
): number {
  if (!timerStartedAt) return 0;
  const startMs = new Date(timerStartedAt).getTime();
  if (Number.isNaN(startMs)) return 0;
  // Deliberately an hour, not TIMER_ALERT_INTERVAL_SECONDS: this is the copy
  // shown to a human ("running for 2h"), so it must stay real hours even if
  // the alert cadence is ever retuned.
  return Math.floor((now.getTime() - startMs) / 3_600_000);
}
