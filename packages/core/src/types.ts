// ─── Domain enums ────────────────────────────────────────────────────────────

export type TaskType = "main" | "side" | "exploration";
export type TaskState = "todo" | "in_progress" | "blocked" | "completed" | "scrapped";
export type Recurrence = "once" | "daily" | "yearly";
export type KeyScope = "all" | "scoped";

// ─── Operations ──────────────────────────────────────────────────────────────

export interface Operation {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  importance: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOperationInput {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  importance?: number;
}

export interface UpdateOperationInput {
  name?: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  importance?: number | null;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  operationId: string;
  title: string;
  type: TaskType;
  state: TaskState;
  startDate: string | null;
  endDate: string | null;
  importance: number | null;
  notes: string | null;
  timeLogged: number;
  reminderId: string | null;
  createdAt: string;
  updatedAt: string;
  /** prerequisite task IDs */
  prerequisites: string[];
}

export interface CreateTaskInput {
  title: string;
  operationId: string;
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
  operationId?: string;
  type?: TaskType;
  state?: TaskState;
  startDate?: string | null;
  endDate?: string | null;
  importance?: number | null;
  notes?: string | null;
  timeLogged?: number;
  prerequisites?: string[];
}

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
  operationIds?: string[];
}

export interface CreateApiKeyInput {
  name: string;
  scope: KeyScope;
  operationIds?: string[];
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface DeltaSyncResponse {
  operations: Operation[];
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

// ─── Operation stats ─────────────────────────────────────────────────────────

export interface OperationStats {
  totalMain: number;
  completedMain: number;
  isComplete: boolean;
}
