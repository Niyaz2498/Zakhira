import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import type { Bindings, AuthContext, AppDB } from "../types.js";
import type { Reminder } from "@zakhira/core";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

app.use("*", authMiddleware);

function rowToReminder(row: typeof schema.reminders.$inferSelect): Reminder {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    fireHour: row.fireHour,
    fireDate: row.fireDate,
    recurrence: row.recurrence as Reminder["recurrence"],
    snoozedUntil: row.snoozedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /reminders
app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  let rows = await db.query.reminders.findMany();

  if (auth.userId) {
    rows = rows.filter((r) => r.userId === auth.userId);
  }

  return c.json({ ok: true, data: rows.map(rowToReminder) });
});

// GET /reminders/:id
app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const row = await db.query.reminders.findFirst({
    where: eq(schema.reminders.id, c.req.param("id")),
  });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  if (auth.userId && row.userId !== auth.userId) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }
  return c.json({ ok: true, data: rowToReminder(row) });
});

// POST /reminders
app.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<{
    title: string;
    fireHour: number;
    recurrence: "once" | "daily" | "yearly";
    fireDate?: string;
    taskId?: string;
  }>();

  if (!body.title?.trim()) return c.json({ ok: false, error: "title is required" }, 400);
  if (body.fireHour === undefined || body.fireHour < 0 || body.fireHour > 23) {
    return c.json({ ok: false, error: "fireHour must be 0–23" }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = drizzle(c.env.DB, { schema }) as AppDB;

  await db.insert(schema.reminders).values({
    id,
    userId: auth.userId,
    taskId: body.taskId ?? null,
    title: body.title.trim(),
    fireHour: Math.floor(body.fireHour),
    fireDate: body.fireDate ?? null,
    recurrence: body.recurrence ?? "once",
    snoozedUntil: null,
    createdAt: now,
    updatedAt: now,
  });

  const row = await db.query.reminders.findFirst({
    where: eq(schema.reminders.id, id),
  });
  return c.json({ ok: true, data: rowToReminder(row) }, 201);
});

// PATCH /reminders/:id
app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");
  const row = await db.query.reminders.findFirst({
    where: eq(schema.reminders.id, id),
  });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  if (auth.userId && row.userId !== auth.userId) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    fireHour?: number;
    recurrence?: "once" | "daily" | "yearly";
    fireDate?: string | null;
    snoozedUntil?: string | null;
    taskId?: string | null;
  }>();

  if (body.fireHour !== undefined && (body.fireHour < 0 || body.fireHour > 23)) {
    return c.json({ ok: false, error: "fireHour must be 0–23" }, 400);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.reminders)
    .set({
      title: body.title ?? row.title,
      fireHour: body.fireHour !== undefined ? Math.floor(body.fireHour) : row.fireHour,
      recurrence: body.recurrence ?? row.recurrence,
      fireDate: "fireDate" in body ? (body.fireDate ?? null) : row.fireDate,
      snoozedUntil: "snoozedUntil" in body ? (body.snoozedUntil ?? null) : row.snoozedUntil,
      taskId: "taskId" in body ? (body.taskId ?? null) : row.taskId,
      updatedAt: now,
    })
    .where(eq(schema.reminders.id, id));

  const updated = await db.query.reminders.findFirst({
    where: eq(schema.reminders.id, id),
  });
  return c.json({ ok: true, data: rowToReminder(updated) });
});

// DELETE /reminders/:id
app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");
  const row = await db.query.reminders.findFirst({
    where: eq(schema.reminders.id, id),
  });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  if (auth.userId && row.userId !== auth.userId) {
    return c.json({ ok: false, error: "Not found" }, 404);
  }
  await db.delete(schema.reminders).where(eq(schema.reminders.id, id));
  return c.json({ ok: true, data: { deleted: true } });
});

export default app;
