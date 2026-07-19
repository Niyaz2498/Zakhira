import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, or } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";
import { generateApiKey, hashKey } from "../utils/crypto.js";
import type { Bindings, AppDB } from "../types.js";

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", adminAuthMiddleware);

// GET /admin/users — list all users with their key count
app.get("/users", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const userRows = await db.query.users.findMany();
  const keyRows = await db.query.apiKeys.findMany();

  const keyCountByUser = new Map<string, number>();
  for (const k of keyRows) {
    if (k.userId) keyCountByUser.set(k.userId, (keyCountByUser.get(k.userId) ?? 0) + 1);
  }

  const data = userRows.map((u) => ({
    id: u.id,
    email: u.email,
    keyCount: keyCountByUser.get(u.id) ?? 0,
    createdAt: u.createdAt,
  }));

  return c.json({ ok: true, data });
});

// POST /admin/users — create a new user and their "General Tasks" operation
app.post("/users", async (c) => {
  const body = await c.req.json<{ email: string }>();
  if (!body.email?.trim()) return c.json({ ok: false, error: "email is required" }, 400);

  const db = drizzle(c.env.DB, { schema }) as AppDB;

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, body.email.trim()),
  });
  if (existing) return c.json({ ok: false, error: "User already exists" }, 409);

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();

  await db.insert(schema.users).values({
    id: userId,
    email: body.email.trim(),
    createdAt: now,
    updatedAt: now,
  });

  // Auto-create a default "General Tasks" operation for the new user
  await db.insert(schema.operations).values({
    id: crypto.randomUUID(),
    userId,
    name: "General Tasks",
    description: null,
    startDate: null,
    endDate: null,
    importance: null,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ ok: true, data: { id: userId, email: body.email.trim(), createdAt: now } }, 201);
});

// POST /admin/users/:id/keys — mint a key for a user
app.post("/users/:id/keys", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const userId = c.req.param("id");

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return c.json({ ok: false, error: "User not found" }, 404);

  const body = await c.req.json<{ name: string }>();
  if (!body.name?.trim()) return c.json({ ok: false, error: "name is required" }, 400);

  const plaintext = generateApiKey();
  const hash = await hashKey(plaintext);
  const now = new Date().toISOString();
  const keyId = crypto.randomUUID();

  await db.insert(schema.apiKeys).values({
    id: keyId,
    userId,
    keyHash: hash,
    name: body.name.trim(),
    scope: "all",
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    ok: true,
    data: {
      key: { id: keyId, name: body.name.trim(), scope: "all", createdAt: now },
      plaintext,
    },
  }, 201);
});

// DELETE /admin/users/:id — delete user and all their data
app.delete("/users/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const userId = c.req.param("id");

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return c.json({ ok: false, error: "User not found" }, 404);

  // 1. Revoke all their API keys (clear scoped links first)
  const keys = await db.query.apiKeys.findMany({ where: eq(schema.apiKeys.userId, userId) });
  for (const k of keys) {
    await db.delete(schema.apiKeyOperations).where(eq(schema.apiKeyOperations.apiKeyId, k.id));
  }
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));

  // 2. Delete their reminders
  await db.delete(schema.reminders).where(eq(schema.reminders.userId, userId));

  // 3. Delete their tasks (clear dependency edges first)
  const ops = await db.query.operations.findMany({ where: eq(schema.operations.userId, userId) });
  for (const op of ops) {
    const tasks = await db.query.tasks.findMany({ where: eq(schema.tasks.operationId, op.id) });
    for (const t of tasks) {
      await db.delete(schema.taskDependencies).where(
        or(eq(schema.taskDependencies.taskId, t.id), eq(schema.taskDependencies.prerequisiteId, t.id))
      );
    }
    await db.delete(schema.tasks).where(eq(schema.tasks.operationId, op.id));
  }

  // 4. Delete their operations
  await db.delete(schema.operations).where(eq(schema.operations.userId, userId));

  // 5. Delete the user
  await db.delete(schema.users).where(eq(schema.users.id, userId));

  return c.json({ ok: true, data: { deleted: true } });
});

// DELETE /admin/keys/:id — revoke any key
app.delete("/keys/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");

  const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, id) });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);

  await db.delete(schema.apiKeyOperations).where(eq(schema.apiKeyOperations.apiKeyId, id));
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));

  return c.json({ ok: true, data: { revoked: true } });
});

export default app;
