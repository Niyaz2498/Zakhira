import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./db/schema.js";

export interface Bindings {
  DB: D1Database;
  ADMIN_SECRET: string;
}

export interface AuthContext {
  keyId: string;
  userId: string | null;
  scope: "all" | "scoped";
  /** null = unrestricted (legacy full-access key). Otherwise the list of operation IDs the key may touch. */
  allowedOperationIds: string[] | null;
}

export type AppDB = DrizzleD1Database<typeof schema>;
