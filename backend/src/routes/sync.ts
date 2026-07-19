import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { gte, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import type { Bindings, AuthContext, AppDB } from "../types.js";
import type { Task, Operation, Reminder } from "@zakhira/core";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

app.use("*", authMiddleware);

// GET /sync[?since=<ISO>]
app.get("/", async (c) => {
  const auth = c.get("auth");
  const since = c.req.query("since");
  const db = drizzle(c.env.DB, { schema }) as AppDB;

  let opsQuery = db.query.operations.findMany(
    since ? { where: gte(schema.operations.updatedAt, since) } : {}
  );
  let tasksQuery = db.query.tasks.findMany(
    since ? { where: gte(schema.tasks.updatedAt, since) } : {}
  );
  let remindersQuery = db.query.reminders.findMany(
    since ? { where: gte(schema.reminders.updatedAt, since) } : {}
  );

  const [opRows, taskRows, reminderRows] = await Promise.all([
    opsQuery,
    tasksQuery,
    remindersQuery,
  ]);

  // Apply auth scope filtering
  let filteredOps: typeof opRows = opRows;
  let filteredTasks: typeof taskRows = taskRows;
  let filteredReminders: typeof reminderRows = reminderRows;
  if (auth.allowedOperationIds) {
    filteredOps = opRows.filter((r) => auth.allowedOperationIds!.includes(r.id));
    filteredTasks = taskRows.filter((t) =>
      auth.allowedOperationIds!.includes(t.operationId)
    );
  }
  if (auth.userId) {
    filteredReminders = reminderRows.filter((r) => r.userId === auth.userId);
  }

  // Load all deps for efficiency
  const allDeps = await db.query.taskDependencies.findMany();
  const depMap = new Map<string, string[]>();
  for (const d of allDeps) {
    const arr = depMap.get(d.taskId) ?? [];
    arr.push(d.prerequisiteId);
    depMap.set(d.taskId, arr);
  }

  const operations: Operation[] = filteredOps.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    startDate: r.startDate,
    endDate: r.endDate,
    importance: r.importance,
    isDefault: Boolean(r.isDefault),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const tasks: Task[] = filteredTasks.map((r) => ({
    id: r.id,
    operationId: r.operationId,
    title: r.title,
    type: r.type,
    state: r.state,
    startDate: r.startDate,
    endDate: r.endDate,
    importance: r.importance,
    notes: r.notes,
    timeLogged: r.timeLogged ?? 0,
    reminderId: r.reminderId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    prerequisites: depMap.get(r.id) ?? [],
  }));

  const reminders: Reminder[] = filteredReminders.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    title: r.title,
    fireHour: r.fireHour,
    fireDate: r.fireDate,
    recurrence: r.recurrence,
    snoozedUntil: r.snoozedUntil,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return c.json({
    ok: true,
    data: { operations, tasks, reminders, syncedAt: new Date().toISOString() },
  });
});

export default app;
