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

  let allowedOperationIds: string[] | null = null;

  if (keyRow.userId) {
    if (keyRow.scope === "all") {
      // Load all operations owned by this user
      const userOps = await db.query.operations.findMany({
        where: eq(schema.operations.userId, keyRow.userId),
        columns: { id: true },
      });
      allowedOperationIds = userOps.map((op) => op.id);
    } else {
      allowedOperationIds = keyRow.apiKeyOperations.map((r) => r.operationId);
    }
  } else {
    // Legacy key (no userId): old scope behaviour
    if (keyRow.scope === "scoped") {
      allowedOperationIds = keyRow.apiKeyOperations.map((r) => r.operationId);
    }
    // scope="all" with no userId → allowedOperationIds stays null (full access)
  }

  c.set("auth", {
    keyId: keyRow.id,
    userId: keyRow.userId ?? null,
    scope: keyRow.scope as "all" | "scoped",
    allowedOperationIds,
  });

  await next();
});

/**
 * Throws 403 if the authed key cannot access the given operationId.
 */
export function assertOperationAccess(auth: AuthContext, operationId: string): void {
  if (auth.allowedOperationIds === null) return; // legacy full access
  if (!auth.allowedOperationIds.includes(operationId)) {
    throw new HTTPException(403, { message: "Access denied to this operation" });
  }
}
