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
  const userOps = await db.query.operations.findMany({
    where: eq(schema.operations.userId, userId),
    columns: { id: true },
  });

  c.set("auth", {
    userId,
    allowedOperationIds: userOps.map((op) => op.id),
  });

  await next();
});

/** Throws 403 if the authenticated user does not own the given operation. */
export function assertOperationAccess(auth: AuthContext, operationId: string): void {
  if (!auth.allowedOperationIds.includes(operationId)) {
    throw new HTTPException(403, { message: "Access denied to this operation" });
  }
}
