import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { gte, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import type { Bindings, AuthContext, AppDB } from "../types.js";
import type { Task, Group, Reminder } from "@zakhira/core";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

app.use("*", authMiddleware);

// GET /sync[?since=<ISO>]
app.get("/", async (c) => {
  const auth = c.get("auth");
  const since = c.req.query("since");
  const db = drizzle(c.env.DB, { schema }) as AppDB;

  // Each branch calls findMany with a concrete argument rather than passing a
  // `{ where } | {}` union — drizzle's KnownKeysOnly constraint rejects the
  // union, since `{}` is missing the `where` key the other half declares.
  const [groupRows, taskRows, reminderRows] = await Promise.all([
    since
      ? db.query.groups.findMany({ where: gte(schema.groups.updatedAt, since) })
      : db.query.groups.findMany(),
    since
      ? db.query.tasks.findMany({ where: gte(schema.tasks.updatedAt, since) })
      : db.query.tasks.findMany(),
    since
      ? db.query.reminders.findMany({ where: gte(schema.reminders.updatedAt, since) })
      : db.query.reminders.findMany(),
  ]);

  // Apply auth scope filtering
  let filteredGroups: typeof groupRows = groupRows;
  let filteredTasks: typeof taskRows = taskRows;
  let filteredReminders: typeof reminderRows = reminderRows;
  if (auth.allowedGroupIds) {
    filteredGroups = groupRows.filter((r) => auth.allowedGroupIds!.includes(r.id));
    filteredTasks = taskRows.filter((t) =>
      auth.allowedGroupIds!.includes(t.groupId)
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

  const groups: Group[] = filteredGroups.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    parentId: r.parentId,
    startDate: r.startDate,
    endDate: r.endDate,
    importance: r.importance,
    isDefault: Boolean(r.isDefault),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const tasks: Task[] = filteredTasks.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    title: r.title,
    type: r.type,
    state: r.state,
    startDate: r.startDate,
    endDate: r.endDate,
    importance: r.importance,
    notes: r.notes,
    timeLogged: r.timeLogged ?? 0,
    timerStartedAt: r.timerStartedAt ?? null,
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
    data: { groups, tasks, reminders, syncedAt: new Date().toISOString() },
  });
});

export default app;
