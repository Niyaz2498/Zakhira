import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./db/schema.js";

export interface Bindings {
  DB: D1Database;
}

export interface AuthContext {
  keyId: string;
  scope: "all" | "scoped";
  /** null means full access to all operations */
  allowedOperationIds: string[] | null;
}

export type AppDB = DrizzleD1Database<typeof schema>;
