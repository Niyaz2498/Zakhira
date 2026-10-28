import type {
  ApiResponse,
  Group,
  CreateGroupInput,
  UpdateGroupInput,
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskComment,
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  ApiKey,
  CreateApiKeyInput,
  DeltaSyncResponse,
  LoginResponse,
} from "./types.js";

export class ZakhiraClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body !== undefined ? JSON.stringify(body) : null,
    });
    return res.json() as Promise<ApiResponse<T>>;
  }

  // ─── Groups ────────────────────────────────────────────────────────────────

  listGroups(): Promise<ApiResponse<Group[]>> {
    return this.request("GET", "/groups");
  }

  getGroup(id: string): Promise<ApiResponse<Group>> {
    return this.request("GET", `/groups/${id}`);
  }

  createGroup(input: CreateGroupInput): Promise<ApiResponse<Group>> {
    return this.request("POST", "/groups", input);
  }

  updateGroup(id: string, input: UpdateGroupInput): Promise<ApiResponse<Group>> {
    return this.request("PATCH", `/groups/${id}`, input);
  }

  /**
   * `cascade` deletes the group's whole subtree — its tasks, its sub-groups and
   * their tasks. `move` keeps everything: tasks go to General Tasks, sub-groups
   * are promoted to the deleted group's own parent.
   */
  deleteGroup(
    id: string,
    strategy: "move" | "cascade"
  ): Promise<ApiResponse<{ deleted: true }>> {
    return this.request("DELETE", `/groups/${id}`, { strategy });
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  listTasks(groupId?: string): Promise<ApiResponse<Task[]>> {
    const q = groupId ? `?groupId=${groupId}` : "";
    return this.request("GET", `/tasks${q}`);
  }

  getTask(id: string): Promise<ApiResponse<Task>> {
    return this.request("GET", `/tasks/${id}`);
  }

  createTask(input: CreateTaskInput): Promise<ApiResponse<Task>> {
    return this.request("POST", "/tasks", input);
  }

  updateTask(id: string, input: UpdateTaskInput): Promise<ApiResponse<Task>> {
    return this.request("PATCH", `/tasks/${id}`, input);
  }

  deleteTask(id: string): Promise<ApiResponse<{ deleted: true }>> {
    return this.request("DELETE", `/tasks/${id}`);
  }

  // ─── Task comments ─────────────────────────────────────────────────────────

  /**
   * All comments on a task, newest first. Comments are not part of delta sync,
   * so this is the only way to read them — call it when the task opens and let
   * the result replace whatever the screen was holding.
   */
  listTaskComments(taskId: string): Promise<ApiResponse<TaskComment[]>> {
    return this.request("GET", `/tasks/${taskId}/comments`);
  }

  /** Rejected with code `TASK_CLOSED` once the task is completed or scrapped. */
  createTaskComment(
    taskId: string,
    input: CreateTaskCommentInput
  ): Promise<ApiResponse<TaskComment>> {
    return this.request("POST", `/tasks/${taskId}/comments`, input);
  }

  updateTaskComment(
    taskId: string,
    commentId: string,
    input: UpdateTaskCommentInput
  ): Promise<ApiResponse<TaskComment>> {
    return this.request("PATCH", `/tasks/${taskId}/comments/${commentId}`, input);
  }

  /** A hard delete — the row is gone, not flagged. */
  deleteTaskComment(
    taskId: string,
    commentId: string
  ): Promise<ApiResponse<{ deleted: true }>> {
    return this.request("DELETE", `/tasks/${taskId}/comments/${commentId}`);
  }

  // ─── Reminders ─────────────────────────────────────────────────────────────

  listReminders(): Promise<ApiResponse<Reminder[]>> {
    return this.request("GET", "/reminders");
  }

  getReminder(id: string): Promise<ApiResponse<Reminder>> {
    return this.request("GET", `/reminders/${id}`);
  }

  createReminder(input: CreateReminderInput): Promise<ApiResponse<Reminder>> {
    return this.request("POST", "/reminders", input);
  }

  updateReminder(id: string, input: UpdateReminderInput): Promise<ApiResponse<Reminder>> {
    return this.request("PATCH", `/reminders/${id}`, input);
  }

  deleteReminder(id: string): Promise<ApiResponse<{ deleted: true }>> {
    return this.request("DELETE", `/reminders/${id}`);
  }

  // ─── API Keys ──────────────────────────────────────────────────────────────

  listApiKeys(): Promise<ApiResponse<ApiKey[]>> {
    return this.request("GET", "/keys");
  }

  createApiKey(input: CreateApiKeyInput): Promise<ApiResponse<{ key: ApiKey; plaintext: string }>> {
    return this.request("POST", "/keys", input);
  }

  revokeApiKey(id: string): Promise<ApiResponse<{ revoked: true }>> {
    return this.request("DELETE", `/keys/${id}`);
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /** Login with username + password. Returns a JWT on success. No auth header required. */
  login(username: string, password: string): Promise<ApiResponse<LoginResponse>> {
    return fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then((r) => r.json()) as Promise<ApiResponse<LoginResponse>>;
  }

  // ─── Bootstrap (no auth — only while 0 keys exist) ─────────────────────────

  bootstrap(input: CreateApiKeyInput): Promise<ApiResponse<{ key: ApiKey; plaintext: string }>> {
    return fetch(`${this.baseUrl}/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => r.json()) as Promise<ApiResponse<{ key: ApiKey; plaintext: string }>>;
  }

  // ─── Delta sync ────────────────────────────────────────────────────────────

  sync(since?: string): Promise<ApiResponse<DeltaSyncResponse>> {
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    return this.request("GET", `/sync${q}`);
  }
}
