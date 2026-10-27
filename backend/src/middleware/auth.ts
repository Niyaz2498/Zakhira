import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { Bindings, AuthContext, AppDB } from "../types.js";
import { verifyJwt } from "../utils/crypto.js";

export const authMiddleware = createMiddleware<{
  Bindings: Bindings;
  Variables: { auth: AuthContext };
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);
  const userId = await verifyJwt(token, c.env.JWT_SECRET);
  if (!userId) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const userGroups = await db.query.groups.findMany({
    where: eq(schema.groups.userId, userId),
    columns: { id: true },
  });

  c.set("auth", {
    userId,
    allowedGroupIds: userGroups.map((g) => g.id),
  });

  await next();
});

/**
 * Throws 403 if the authenticated user does not own the given group.
 *
 * Nesting needs no special case here: every group the user owns carries their
 * `user_id`, sub-groups included, so the allow-list already covers whole
 * subtrees. It is not derived by walking parents — a child is reachable
 * because it is owned, not because its parent is.
 */
export function assertGroupAccess(auth: AuthContext, groupId: string): void {
  if (!auth.allowedGroupIds.includes(groupId)) {
    throw new HTTPException(403, { message: "Access denied to this group" });
  }
}
