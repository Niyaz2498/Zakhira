import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./db/schema.js";

export interface Bindings {
  DB: D1Database;
  ADMIN_SECRET: string;
  JWT_SECRET: string;
}

export interface AuthContext {
  userId: string;
  /** Group IDs this user may access. Always populated from the user's own groups. */
  allowedGroupIds: string[];
}

export type AppDB = DrizzleD1Database<typeof schema>;
