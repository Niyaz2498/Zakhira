// ─── Domain enums ────────────────────────────────────────────────────────────

export type TaskType = "main" | "side" | "exploration";
export type TaskState = "todo" | "in_progress" | "blocked" | "completed" | "scrapped";
export type Recurrence = "once" | "daily" | "yearly";
export type KeyScope = "all" | "scoped";

// ─── Groups ──────────────────────────────────────────────────────────────────

export interface Group {
  id: string;
  name: string;
  description: string | null;
  /** Parent group, or null for a top-level group. */
  parentId: string | null;
  startDate: string | null;
  endDate: string | null;
  importance: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  /** Omit to create a top-level group. */
  parentId?: string;
  startDate?: string;
  endDate?: string;
  importance?: number;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  /** null re-parents the group to the top level. */
  parentId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  importance?: number | null;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  groupId: string;
  title: string;
  type: TaskType;
  state: TaskState;
  startDate: string | null;
  endDate: string | null;
  importance: number | null;
  notes: string | null;
  timeLogged: number;
  timerStartedAt: string | null;
  reminderId: string | null;
  createdAt: string;
  updatedAt: string;
  /** prerequisite task IDs */
  prerequisites: string[];
}

export interface CreateTaskInput {
  title: string;
  groupId: string;
  type: TaskType;
  state?: TaskState;
  startDate?: string;
  endDate?: string;
  importance?: number;
  notes?: string;
  prerequisites?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  groupId?: string;
  type?: TaskType;
  state?: TaskState;
  startDate?: string | null;
  endDate?: string | null;
  importance?: number | null;
  notes?: string | null;
  timeLogged?: number;
  timerStartedAt?: string | null;
  prerequisites?: string[];
}

// ─── Task Comments ───────────────────────────────────────────────────────────

/**
 * One entry in a task's running log. Distinct from `Task.notes`, which is the
 * brief and is overwritten on every edit — a task has any number of comments.
 *
 * Comments are not carried by delta sync. Fetch them per task with
 * `listTaskComments` and treat the result as authoritative; that is what lets a
 * delete be a real delete rather than a tombstone.
 */
export interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  /** Equal to `createdAt` until the comment is edited. */
  updatedAt: string;
}

export interface CreateTaskCommentInput {
  body: string;
}

export interface UpdateTaskCommentInput {
  body: string;
}

/** Longest comment the backend will accept, in characters. */
export const TASK_COMMENT_MAX_LENGTH = 10_000;

// ─── Reminders ───────────────────────────────────────────────────────────────

export interface Reminder {
  id: string;
  taskId: string | null;
  title: string;
  fireHour: number;
  fireDate: string | null;
  recurrence: Recurrence;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReminderInput {
  title: string;
  fireHour: number;
  recurrence: Recurrence;
  fireDate?: string;
  taskId?: string;
}

export interface UpdateReminderInput {
  title?: string;
  fireHour?: number;
  recurrence?: Recurrence;
  fireDate?: string | null;
  snoozedUntil?: string | null;
  taskId?: string | null;
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  scope: KeyScope;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** only present for scoped keys */
  groupIds?: string[];
}

export interface CreateApiKeyInput {
  name: string;
  scope: KeyScope;
  groupIds?: string[];
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface DeltaSyncResponse {
  groups: Group[];
  tasks: Task[];
  reminders: Reminder[];
  syncedAt: string;
}

// ─── API response envelope ───────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  userId: string;
  username: string;
}

// ─── Group stats ─────────────────────────────────────────────────────────────

export interface GroupStats {
  totalMain: number;
  completedMain: number;
  isComplete: boolean;
}
