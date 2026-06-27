import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { Bindings, AuthContext } from "../types.js";
import { hashKey } from "../utils/crypto.js";

export const authMiddleware = createMiddleware<{
  Bindings: Bindings;
  Variables: { auth: AuthContext };
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const plaintext = header.slice(7);
  const hash = await hashKey(plaintext);

  const db = drizzle(c.env.DB, { schema });
  const keyRow = await db.query.apiKeys.findFirst({
    where: eq(schema.apiKeys.keyHash, hash),
    with: { apiKeyOperations: { columns: { operationId: true } } },
  });

  if (!keyRow) {
    throw new HTTPException(401, { message: "Invalid API key" });
  }

  // Touch last_used_at (fire-and-forget; don't await)
  const now = new Date().toISOString();
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(schema.apiKeys.id, keyRow.id));

  const allowedOperationIds =
    keyRow.scope === "all"
      ? null // null = all
      : keyRow.apiKeyOperations.map((r) => r.operationId);

  c.set("auth", {
    keyId: keyRow.id,
    scope: keyRow.scope as "all" | "scoped",
    allowedOperationIds,
  });

  await next();
});

/**
 * Throws 403 if the authed key cannot access the given operationId.
 */
export function assertOperationAccess(auth: AuthContext, operationId: string): void {
  if (auth.scope === "all") return;
  if (!auth.allowedOperationIds?.includes(operationId)) {
    throw new HTTPException(403, { message: "Access denied to this operation" });
  }
}
