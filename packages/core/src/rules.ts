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

// ─── Calendar ────────────────────────────────────────────────────────────────
//
// Every date the app stores — a task's `endDate`, a group's, a reminder's
// `fireDate` — is a plain `YYYY-MM-DD` *calendar* day with no time and no zone.
// These helpers exist so nothing has to reach for `Date.prototype.toISOString()`
// to produce one: that converts to UTC first, so east of Greenwich an evening
// date comes back as the day before. Everything below works in local civil time
// and never crosses a timezone.
//
// The month-grid builder lives here rather than in the phone's calendar
// component so the desktop calendar lands on identical cells when it is built.

/** Months, for a date label the user reads. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Monday-first, matching the grid header the calendar renders. */
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Build a `YYYY-MM-DD` key from civil date parts.
 * @param month 1–12 (not the 0-based month `Date` uses).
 */
export function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** The local calendar day a `Date` falls on — never shifted into UTC. */
export function toDateKey(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Today, as a date key. `now` is injectable so callers can test. */
export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/**
 * Split a date key into civil parts, or null if it isn't a real calendar day.
 *
 * Rejects both malformed strings and dates that merely look plausible:
 * `2026-02-31` parses as digits but is not a day, and `Date` would silently
 * roll it forward to March 3rd rather than complain.
 */
export function parseDateKey(
  key: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

/** True if `value` is a real `YYYY-MM-DD` calendar day. */
export function isValidDateKey(value: string): boolean {
  return parseDateKey(value) !== null;
}

/** Number of days in a month. @param month 1–12. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

/**
 * Move a year/month pair by `delta` months, carrying the year.
 * @param month 1–12.
 */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  // Work in absolute months so a delta of any size (and either sign) carries
  // correctly; `% 12` alone goes negative when stepping back from January.
  const absolute = year * 12 + (month - 1) + delta;
  return { year: Math.floor(absolute / 12), month: (absolute % 12) + 1 };
}

/** "November 2026" — the calendar's month heading. @param month 1–12. */
export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * "Sat, 7 Nov 2026" — how a chosen date reads back in a form field.
 *
 * Returns the input untouched if it isn't a valid key, so a hand-typed value
 * left over from before the picker existed still shows as whatever it says
 * rather than as "Invalid Date".
 */
export function formatDateKeyLong(key: string): string {
  const parts = parseDateKey(key);
  if (!parts) return key;
  const weekday = WEEKDAY_SHORT[weekdayIndex(parts.year, parts.month, parts.day)];
  return `${weekday}, ${parts.day} ${MONTH_SHORT[parts.month - 1]} ${parts.year}`;
}

/** Monday-first weekday index (0 = Monday … 6 = Sunday). @param month 1–12. */
export function weekdayIndex(year: number, month: number, day: number): number {
  // getDay() is Sunday-first; rotate so the week starts on Monday.
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

/** One day cell in a month grid. */
export interface CalendarDay {
  /** `YYYY-MM-DD` — always a real date, including for the greyed lead-in days. */
  key: string;
  /** Day of the month, 1–31. */
  day: number;
  /** False for the previous month's days that pad the first row. */
  inMonth: boolean;
}

/** A row of the grid. `null` is a blank cell. */
export type CalendarWeek = (CalendarDay | null)[];

/**
 * The weeks of a month, Monday-first, ready to render.
 *
 * The first row is padded with the tail of the *previous* month, so the 1st
 * lands under its real weekday; those cells carry genuine dates and are meant
 * to be rendered dimmed but still selectable. The grid then **stops at the last
 * day of the month** — the final row is padded with blanks rather than with the
 * next month's days, so the height of the sheet tracks the month and no row of
 * numbers trails past the end of it.
 *
 * @param month 1–12.
 */
export function buildMonthGrid(year: number, month: number): CalendarWeek[] {
  const lead = weekdayIndex(year, month, 1);
  const previous = shiftMonth(year, month, -1);
  const previousLength = daysInMonth(previous.year, previous.month);

  const cells: (CalendarDay | null)[] = [];
  for (let i = lead; i > 0; i--) {
    const day = previousLength - i + 1;
    cells.push({ key: dateKey(previous.year, previous.month, day), day, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    cells.push({ key: dateKey(year, month, day), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Which month a calendar should open on: the month of `selected` when it holds
 * a usable date, otherwise the month of `now`. A field that already has a date
 * should show it, not make the user navigate back to find it.
 */
export function initialCalendarMonth(
  selected: string | null | undefined,
  now: Date = new Date(),
): { year: number; month: number } {
  const parts = selected ? parseDateKey(selected) : null;
  if (parts) return { year: parts.year, month: parts.month };
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// ─── Task comments ───────────────────────────────────────────────────────────
//
// A task's comment log is read straight from the backend when the task opens
// (comments are not in delta sync), so there is no merging to do here. What
// both apps do need is to agree on ordering and on how a timestamp is worded,
// otherwise the same log reads differently on the phone and the desktop.

/**
 * The log in reading order: **newest first**.
 *
 * This pairs with the composer sitting at the top of the Comments section — an
 * entry you just posted appears directly under the box you typed it in, rather
 * than at the far end of a log you would have to scroll to see.
 *
 * The backend sorts the same way, but on the raw column only, while this sorts
 * ties by `id` as well: two comments posted inside the same millisecond would
 * otherwise swap places between two fetches and make the list visibly
 * reshuffle.
 */
export function sortTaskComments<T extends { id: string; createdAt: string }>(
  comments: T[],
): T[] {
  return [...comments].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
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
