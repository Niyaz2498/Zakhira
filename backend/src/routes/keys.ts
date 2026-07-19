import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import type { Bindings, AuthContext, AppDB } from "../types.js";
import type { ApiKey } from "@zakhira/core";
import { generateApiKey, hashKey } from "../utils/crypto.js";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

app.use("*", authMiddleware);

async function rowToApiKey(
  db: AppDB,
  row: typeof schema.apiKeys.$inferSelect
): Promise<ApiKey> {
  const opRows =
    row.scope === "scoped"
      ? await db.query.apiKeyOperations.findMany({
          where: eq(schema.apiKeyOperations.apiKeyId, row.id),
        })
      : [];
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as ApiKey["scope"],
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    operationIds: row.scope === "scoped" ? opRows.map((r) => r.operationId) : undefined,
  };
}

// GET /keys
app.get("/", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const rows = await db.query.apiKeys.findMany();
  const keys = await Promise.all(rows.map((r) => rowToApiKey(db, r)));
  return c.json({ ok: true, data: keys });
});

// POST /keys
app.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    scope: "all" | "scoped";
    operationIds?: string[];
  }>();

  if (!body.name?.trim()) return c.json({ ok: false, error: "name is required" }, 400);
  if (body.scope === "scoped" && !body.operationIds?.length) {
    return c.json({ ok: false, error: "operationIds required for scoped keys" }, 400);
  }

  const plaintext = generateApiKey();
  const hash = await hashKey(plaintext);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const db = drizzle(c.env.DB, { schema }) as AppDB;
  await db.insert(schema.apiKeys).values({
    id,
    keyHash: hash,
    name: body.name.trim(),
    scope: body.scope,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  if (body.scope === "scoped" && body.operationIds) {
    for (const opId of body.operationIds) {
      await db
        .insert(schema.apiKeyOperations)
        .values({ apiKeyId: id, operationId: opId });
    }
  }

  const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, id) });
  const key = await rowToApiKey(db, row);
  return c.json({ ok: true, data: { key, plaintext } }, 201);
});

// DELETE /keys/:id
app.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");
  const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, id) });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);

  await db.delete(schema.apiKeyOperations).where(eq(schema.apiKeyOperations.apiKeyId, id));
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));

  return c.json({ ok: true, data: { revoked: true } });
});

export default app;
