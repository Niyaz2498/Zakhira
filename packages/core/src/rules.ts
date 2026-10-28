import type { Group, Task, TaskState, GroupStats } from "./types.js";

// ─── Group hierarchy ─────────────────────────────────────────────────────────
//
// Groups nest: a group holds tasks and sub-groups side by side. The shape is a
// forest — `parentId: null` marks a root — and every helper below treats a
// malformed parent pointer (missing parent, or a cycle a bad write slipped in)
// as something to survive rather than something to throw on. A corrupt row
// should not be able to hang a render.

/** groupId → parentId, for ancestor walks. */
export function buildParentMap(groups: Group[]): Map<string, string | null> {
  return new Map(groups.map((g) => [g.id, g.parentId]));
}

/**
 * The group's ancestors, nearest parent first. A group whose parent is missing
 * from `groups` simply ends the chain.
 *
 * The `seen` guard is not defensive theatre: if a cycle ever reaches the table,
 * every caller of this function would otherwise loop forever.
 */
export function ancestorGroupIds(groupId: string, groups: Group[]): string[] {
  const parentOf = buildParentMap(groups);
  const chain: string[] = [];
  const seen = new Set<string>([groupId]);

  let current = parentOf.get(groupId) ?? null;
  while (current !== null && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return chain;
}

/**
 * `groupId` plus every group beneath it, breadth-first — the subtree that
 * completion stats roll up over and that a cascading delete removes.
 * Returns an empty array if the group isn't in `groups`.
 */
export function groupSubtreeIds(groupId: string, groups: Group[]): string[] {
  if (!groups.some((g) => g.id === groupId)) return [];

  const childrenOf = new Map<string, string[]>();
  for (const g of groups) {
    if (g.parentId === null) continue;
    const siblings = childrenOf.get(g.parentId) ?? [];
    siblings.push(g.id);
    childrenOf.set(g.parentId, siblings);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const queue = [groupId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    ids.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return ids;
}

/**
 * True if making `newParentId` the parent of `groupId` would create a loop —
 * i.e. the proposed parent is the group itself or one of its descendants.
 *
 * This is the group-tree counterpart of `wouldCreateCycle` for task
 * prerequisites, and the backend must check it on every re-parent: a group
 * that becomes its own ancestor disappears from the tree render entirely,
 * taking its tasks with it.
 */
export function wouldCreateGroupCycle(
  groupId: string,
  newParentId: string | null,
  groups: Group[]
): boolean {
  if (newParentId === null) return false; // promoting to top level is always safe
  if (newParentId === groupId) return true;
  return groupSubtreeIds(groupId, groups).includes(newParentId);
}

/** A group with its children attached, for recursive rendering. */
export interface GroupNode {
  group: Group;
  /** 0 for a top-level group; used to indent. */
  depth: number;
  children: GroupNode[];
}

/**
 * Build the group forest, ready to render.
 *
 * Ordering at every level: the default group ("General Tasks") first, then the
 * rest by name — so the tree reads the same on both platforms and a rename is
 * the only thing that moves a group.
 *
 * Groups orphaned by a missing parent are surfaced as roots instead of being
 * dropped; a group whose parent pointer loops is unreachable from any root, so
 * it is also re-rooted. Nothing silently vanishes from the UI.
 */
export function buildGroupTree(groups: Group[]): GroupNode[] {
  const byId = new Map(groups.map((g) => [g.id, g]));

  const byLevel = (a: Group, b: Group) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  };

  const childrenOf = new Map<string | null, Group[]>();
  for (const g of groups) {
    // Treat a dangling parent as "no parent" so the group still renders.
    const parent = g.parentId !== null && byId.has(g.parentId) ? g.parentId : null;
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(g);
    childrenOf.set(parent, siblings);
  }

  const placed = new Set<string>();
  const build = (group: Group, depth: number): GroupNode => {
    placed.add(group.id);
    const kids = (childrenOf.get(group.id) ?? [])
      .filter((child) => !placed.has(child.id)) // cycle guard
      .sort(byLevel);
    return { group, depth, children: kids.map((child) => build(child, depth + 1)) };
  };

  const forest = (childrenOf.get(null) ?? []).sort(byLevel).map((g) => build(g, 0));

  // Anything a cycle kept out of the forest is re-rooted rather than lost.
  // `placed` must be re-checked on each iteration, not filtered up front:
  // re-rooting one member of a cycle pulls the rest in as its children, and
  // those must not then be re-rooted a second time — that would render the
  // same group twice, with a duplicate key.
  for (const group of [...groups].sort(byLevel)) {
    if (placed.has(group.id)) continue;
    forest.push(build(group, 0));
  }
  return forest;
}

/**
 * Depth-first flattening of the forest, parents before their children — the
 * order a single scrolling list renders in, with `depth` driving the indent.
 */
export function flattenGroupTree(nodes: GroupNode[]): GroupNode[] {
  return nodes.flatMap((node) => [node, ...flattenGroupTree(node.children)]);
}

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
 * Given the full prerequisite map for a group, validate that the
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
export function canComplete(task: Task, allTasksInGroup: Task[]): boolean {
  if (task.prerequisites.length === 0) return true;
  const taskMap = new Map(allTasksInGroup.map((t) => [t.id, t]));
  return task.prerequisites.every((prereqId) => {
    const prereq = taskMap.get(prereqId);
    return prereq !== undefined && !isTaskOpen(prereq.state);
  });
}

/**
 * Returns the blocking prerequisites (those still open).
 */
export function blockingPrerequisites(task: Task, allTasksInGroup: Task[]): Task[] {
  const taskMap = new Map(allTasksInGroup.map((t) => [t.id, t]));
  return task.prerequisites
    .map((id) => taskMap.get(id))
    .filter((t): t is Task => t !== undefined && isTaskOpen(t.state));
}

// ─── Group completion ────────────────────────────────────────────────────────

/**
 * Count main-quest completion over an explicit set of tasks.
 * Side quests and Exploration tasks never gate completion.
 */
function mainQuestStats(tasks: Task[]): GroupStats {
  const mainTasks = tasks.filter((t) => t.type === "main");
  const completedMain = mainTasks.filter((t) => t.state === "completed").length;
  return {
    totalMain: mainTasks.length,
    completedMain,
    isComplete: mainTasks.length > 0 && completedMain === mainTasks.length,
  };
}

/**
 * A group is complete when every main quest in it *and in all its sub-groups*
 * is complete — progress rolls up the tree.
 *
 * The rollup is the point: a parent that reads "complete" while a sub-group
 * still has open main quests would be lying about the work. A parent with no
 * main quests of its own therefore reports its descendants' progress, and a
 * group with no main quests anywhere in its subtree is never `isComplete`
 * (same rule as before — an empty group isn't an achievement).
 *
 * @param groupId the group to report on
 * @param groups  all groups the caller knows about, for walking the subtree
 * @param tasks   all tasks the caller knows about; filtered here by subtree
 */
export function computeGroupStats(
  groupId: string,
  groups: Group[],
  tasks: Task[]
): GroupStats {
  const subtree = new Set(groupSubtreeIds(groupId, groups));
  return mainQuestStats(tasks.filter((t) => subtree.has(t.groupId)));
}

/**
 * Completion counting only tasks filed directly on the group, ignoring
 * sub-groups. Used where the subject really is this one group's own list.
 */
export function computeDirectGroupStats(groupId: string, tasks: Task[]): GroupStats {
  return mainQuestStats(tasks.filter((t) => t.groupId === groupId));
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

export interface TaskDisplaySections {
  /** Still open: in progress, then todo, then blocked. */
  active: Task[];
  /** Finished: completed, then scrapped. Rendered below a divider. */
  done: Task[];
}

/**
 * Split a group's tasks into the two sections the Groups screens render.
 *
 * Sorting is by state rank only. `Array.prototype.sort` is stable, so tasks
 * sharing a state keep the order they came in — a task won't jump position
 * because an unrelated one changed.
 */
export function splitTasksForDisplay(tasks: Task[]): TaskDisplaySections {
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

// ─── Task comments ───────────────────────────────────────────────────────────
//
// A task's comment log is read straight from the backend when the task opens
// (comments are not in delta sync), so there is no merging to do here. What
// both apps do need is to agree on ordering and on how a timestamp is worded,
// otherwise the same log reads differently on the phone and the desktop.

/**
 * The log in reading order: oldest first, so a task's story runs top to bottom.
 *
 * The backend already sorts by `created_at`, but it sorts on the raw column
 * while this sorts ties by `id` as well — two comments posted inside the same
 * millisecond would otherwise swap places between two fetches and make the list
 * visibly reshuffle.
 */
export function sortTaskComments<T extends { id: string; createdAt: string }>(
  comments: T[],
): T[] {
  return [...comments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * How a comment's age is worded in the log header.
 *
 * Recent entries read as relative ("12m ago") because that is how progress on
 * an active task is actually discussed; past a week the absolute date is more
 * use than "23d ago". An unparseable timestamp returns an empty string rather
 * than "NaN ago".
 *
 * @param createdAt ISO timestamp the comment was posted.
 * @param now       Current time; injectable for testing.
 */
export function formatCommentAge(createdAt: string, now: Date = new Date()): string {
  const thenMs = new Date(createdAt).getTime();
  if (Number.isNaN(thenMs)) return "";

  const diffMs = now.getTime() - thenMs;
  // A clock skew between device and backend can date a comment slightly in the
  // future; "just now" is truer than a negative age.
  if (diffMs < 60_000) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(thenMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * True if `comment` has been edited since it was posted.
 *
 * Compares the two stamps rather than trusting a flag: the backend writes
 * `updatedAt === createdAt` on insert, so any drift is a real edit.
 */
export function isCommentEdited(comment: {
  createdAt: string;
  updatedAt: string;
}): boolean {
  return comment.updatedAt !== comment.createdAt;
}

/**
 * Whether the task's state allows appending to or changing its log.
 *
 * Mirrors the backend's `TASK_CLOSED` rule so the input can be hidden rather
 * than letting the user type a comment into a rejected request.
 */
export function canCommentOnTask(task: Pick<Task, "state">): boolean {
  return task.state !== "completed" && task.state !== "scrapped";
}
