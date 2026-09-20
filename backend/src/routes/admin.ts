import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, or } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";
import { hashPassword } from "../utils/crypto.js";
import type { Bindings, AppDB } from "../types.js";

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", adminAuthMiddleware);

// GET /admin/users — list all users
app.get("/users", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const users = await db.query.users.findMany();
  return c.json({
    ok: true,
    data: users.map((u) => ({ id: u.id, email: u.email, username: u.username, createdAt: u.createdAt })),
  });
});

// POST /admin/users — create a new user with username + password
app.post("/users", async (c) => {
  const body = await c.req.json<{ username: string; password: string; email?: string }>();
  if (!body.username?.trim()) return c.json({ ok: false, error: "username is required" }, 400);
  if (!body.password) return c.json({ ok: false, error: "password is required" }, 400);

  const db = drizzle(c.env.DB, { schema }) as AppDB;

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.username, body.username.trim()),
  });
  if (existing) return c.json({ ok: false, error: "Username already taken" }, 409);

  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const email = body.email?.trim() || `${body.username.trim()}@local`;

  await db.insert(schema.users).values({
    id: userId,
    email,
    username: body.username.trim(),
    passwordHash,
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

  return c.json({ ok: true, data: { id: userId, username: body.username.trim(), email, createdAt: now } }, 201);
});

// PATCH /admin/users/:id — update username or password
app.patch("/users/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const userId = c.req.param("id");

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return c.json({ ok: false, error: "User not found" }, 404);

  const body = await c.req.json<{ username?: string; password?: string; email?: string }>();
  const now = new Date().toISOString();

  const updates: Partial<typeof schema.users.$inferInsert> = { updatedAt: now };
  if (body.username?.trim()) updates.username = body.username.trim();
  if (body.email?.trim()) updates.email = body.email.trim();
  if (body.password) updates.passwordHash = await hashPassword(body.password);

  await db.update(schema.users).set(updates).where(eq(schema.users.id, userId));
  return c.json({ ok: true, data: { id: userId, updatedAt: now } });
});

// DELETE /admin/users/:id — delete user and all their data
app.delete("/users/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const userId = c.req.param("id");

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return c.json({ ok: false, error: "User not found" }, 404);

  // Delete reminders
  await db.delete(schema.reminders).where(eq(schema.reminders.userId, userId));

  // Delete tasks (clear dependency edges first)
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

  // Delete operations then user
  await db.delete(schema.operations).where(eq(schema.operations.userId, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));

  return c.json({ ok: true, data: { deleted: true } });
});

export default app;
