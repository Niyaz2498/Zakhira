import type {
  ApiResponse,
  Operation,
  CreateOperationInput,
  UpdateOperationInput,
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  ApiKey,
  CreateApiKeyInput,
  DeltaSyncResponse,
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
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json() as Promise<ApiResponse<T>>;
  }

  // ─── Operations ────────────────────────────────────────────────────────────

  listOperations(): Promise<ApiResponse<Operation[]>> {
    return this.request("GET", "/operations");
  }

  getOperation(id: string): Promise<ApiResponse<Operation>> {
    return this.request("GET", `/operations/${id}`);
  }

  createOperation(input: CreateOperationInput): Promise<ApiResponse<Operation>> {
    return this.request("POST", "/operations", input);
  }

  updateOperation(id: string, input: UpdateOperationInput): Promise<ApiResponse<Operation>> {
    return this.request("PATCH", `/operations/${id}`, input);
  }

  deleteOperation(
    id: string,
    strategy: "move" | "cascade"
  ): Promise<ApiResponse<{ deleted: true }>> {
    return this.request("DELETE", `/operations/${id}`, { strategy });
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  listTasks(operationId?: string): Promise<ApiResponse<Task[]>> {
    const q = operationId ? `?operationId=${operationId}` : "";
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
