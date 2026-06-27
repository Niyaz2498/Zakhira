export interface Bindings {
  DB: D1Database;
}

export interface AuthContext {
  keyId: string;
  scope: "all" | "scoped";
  /** null means full access to all operations */
  allowedOperationIds: string[] | null;
}
