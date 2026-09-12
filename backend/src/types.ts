import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./db/schema.js";

export interface Bindings {
  DB: D1Database;
  ADMIN_SECRET: string;
  JWT_SECRET: string;
}

export interface AuthContext {
  userId: string;
  /** Operation IDs this user may access. Always populated from the user's own operations. */
  allowedOperationIds: string[];
}

export type AppDB = DrizzleD1Database<typeof schema>;
