import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, or } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { authMiddleware, assertOperationAccess } from "../middleware/auth.js";
import type { Bindings, AuthContext, AppDB } from "../types.js";
import type { Task } from "@zakhira/core";
import {
  canComplete,
  buildPrereqMap,
  findCycleCreators,
} from "@zakhira/core";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

app.use("*", authMiddleware);

async function loadTask(db: AppDB, id: string): Promise<Task | null> {
  const row = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, id),
  });
  if (!row) return null;
  const deps = await db.query.taskDependencies.findMany({
    where: eq(schema.taskDependencies.taskId, id),
  });
  return rowToTask(row, deps.map((d) => d.prerequisiteId));
}

function rowToTask(
  row: typeof schema.tasks.$inferSelect,
  prerequisites: string[]
): Task {
  return {
    id: row.id,
    operationId: row.operationId,
    title: row.title,
    type: row.type as Task["type"],
    state: row.state as Task["state"],
    startDate: row.startDate,
    endDate: row.endDate,
    importance: row.importance,
    notes: row.notes,
    reminderId: row.reminderId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    prerequisites,
  };
}

async function loadTasksForOp(db: AppDB, operationId: string): Promise<Task[]> {
  const rows = await db.query.tasks.findMany({
    where: eq(schema.tasks.operationId, operationId),
  });
  const allDeps = await db.query.taskDependencies.findMany();
  const depMap = new Map<string, string[]>();
  for (const d of allDeps) {
    const arr = depMap.get(d.taskId) ?? [];
    arr.push(d.prerequisiteId);
    depMap.set(d.taskId, arr);
  }
  return rows.map((r) => rowToTask(r, depMap.get(r.id) ?? []));
}

// GET /tasks[?operationId=...]
app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const opId = c.req.query("operationId");

  let rows: (typeof schema.tasks.$inferSelect)[];
  if (opId) {
    assertOperationAccess(auth, opId);
    rows = await db.query.tasks.findMany({
      where: eq(schema.tasks.operationId, opId),
    });
  } else {
    rows = await db.query.tasks.findMany();
    if (auth.scope === "scoped" && auth.allowedOperationIds) {
      rows = rows.filter((r) => auth.allowedOperationIds!.includes(r.operationId));
    }
  }

  const allDeps = await db.query.taskDependencies.findMany();
  const depMap = new Map<string, string[]>();
  for (const d of allDeps) {
    const arr = depMap.get(d.taskId) ?? [];
    arr.push(d.prerequisiteId);
    depMap.set(d.taskId, arr);
  }
  const tasks = rows.map((r) => rowToTask(r, depMap.get(r.id) ?? []));
  return c.json({ ok: true, data: tasks });
});

// GET /tasks/:id
app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const task = await loadTask(db, c.req.param("id"));
  if (!task) return c.json({ ok: false, error: "Not found" }, 404);
  assertOperationAccess(auth, task.operationId);
  return c.json({ ok: true, data: task });
});

// POST /tasks
app.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<{
    title: string;
    operationId: string;
    type: "main" | "side" | "exploration";
    state?: string;
    startDate?: string;
    endDate?: string;
    importance?: number;
    notes?: string;
    prerequisites?: string[];
  }>();

  if (!body.title?.trim()) return c.json({ ok: false, error: "title is required" }, 400);
  if (!body.operationId) return c.json({ ok: false, error: "operationId is required" }, 400);
  assertOperationAccess(auth, body.operationId);

  const db = drizzle(c.env.DB, { schema }) as AppDB;

  // Validate prerequisites
  if (body.prerequisites?.length) {
    const opTasks = await loadTasksForOp(db, body.operationId);
    const prereqMap = buildPrereqMap(opTasks);
    // New task has no ID yet; cycle check uses a placeholder
    const tempId = "__new__";
    prereqMap.set(tempId, body.prerequisites);
    const cyclers = findCycleCreators(tempId, body.prerequisites, prereqMap);
    if (cyclers.length) {
      return c.json({ ok: false, error: "Prerequisites would create a cycle", code: "CYCLE" }, 400);
    }
    // Ensure all prereq IDs belong to the same operation
    const opTaskIds = new Set(opTasks.map((t) => t.id));
    const foreign = body.prerequisites.filter((id) => !opTaskIds.has(id));
    if (foreign.length) {
      return c.json({ ok: false, error: "Prerequisites must be in the same operation" }, 400);
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(schema.tasks).values({
    id,
    operationId: body.operationId,
    title: body.title.trim(),
    type: body.type,
    state: body.state ?? "todo",
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    importance: body.importance ?? null,
    notes: body.notes ?? null,
    reminderId: null,
    createdAt: now,
    updatedAt: now,
  });

  if (body.prerequisites?.length) {
    for (const prereqId of body.prerequisites) {
      await db.insert(schema.taskDependencies).values({ taskId: id, prerequisiteId: prereqId });
    }
  }

  const task = await loadTask(db, id);
  return c.json({ ok: true, data: task }, 201);
});

// PATCH /tasks/:id
app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");
  const existing = await loadTask(db, id);
  if (!existing) return c.json({ ok: false, error: "Not found" }, 404);
  assertOperationAccess(auth, existing.operationId);

  if (existing.state === "completed" || existing.state === "scrapped") {
    return c.json({ ok: false, error: "Cannot edit a completed or scrapped task" }, 400);
  }

  const body = await c.req.json<{
    title?: string;
    operationId?: string;
    type?: string;
    state?: string;
    startDate?: string | null;
    endDate?: string | null;
    importance?: number | null;
    notes?: string | null;
    prerequisites?: string[];
  }>();

  // Moving to a different operation clears prerequisites
  const newOpId = body.operationId ?? existing.operationId;
  const opChanged = newOpId !== existing.operationId;
  if (opChanged) {
    assertOperationAccess(auth, newOpId);
  }

  let newPrereqs = opChanged ? [] : (body.prerequisites ?? existing.prerequisites);

  // If state → completed, check gating
  if (body.state === "completed" && existing.state !== "completed") {
    const opTasks = await loadTasksForOp(db, existing.operationId);
    const taskWithNewPrereqs = { ...existing, prerequisites: newPrereqs };
    if (!canComplete(taskWithNewPrereqs, opTasks)) {
      return c.json({
        ok: false,
        error: "Cannot complete task: some prerequisites are still open",
        code: "PREREQ_OPEN",
      }, 400);
    }
  }

  // Validate prerequisites (only if explicitly provided and op not changed)
  if (!opChanged && body.prerequisites !== undefined) {
    const opTasks = await loadTasksForOp(db, existing.operationId);
    const prereqMap = buildPrereqMap(opTasks);
    prereqMap.set(id, body.prerequisites);
    const cyclers = findCycleCreators(id, body.prerequisites, prereqMap);
    if (cyclers.length) {
      return c.json({ ok: false, error: "Prerequisites would create a cycle", code: "CYCLE" }, 400);
    }
    const opTaskIds = new Set(opTasks.map((t) => t.id));
    const foreign = body.prerequisites.filter((pid) => pid !== id && !opTaskIds.has(pid));
    if (foreign.length) {
      return c.json({ ok: false, error: "Prerequisites must be in the same operation" }, 400);
    }
  }

  const now = new Date().toISOString();
  await db
    .update(schema.tasks)
    .set({
      title: body.title ?? existing.title,
      operationId: newOpId,
      type: body.type ?? existing.type,
      state: body.state ?? existing.state,
      startDate: "startDate" in body ? (body.startDate ?? null) : existing.startDate,
      endDate: "endDate" in body ? (body.endDate ?? null) : existing.endDate,
      importance: "importance" in body ? (body.importance ?? null) : existing.importance,
      notes: "notes" in body ? (body.notes ?? null) : existing.notes,
      updatedAt: now,
    })
    .where(eq(schema.tasks.id, id));

  // Rebuild dependency rows
  await db
    .delete(schema.taskDependencies)
    .where(eq(schema.taskDependencies.taskId, id));
  for (const prereqId of newPrereqs) {
    await db.insert(schema.taskDependencies).values({ taskId: id, prerequisiteId: prereqId });
  }

  const updated = await loadTask(db, id);
  return c.json({ ok: true, data: updated });
});

// DELETE /tasks/:id
app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");
  const task = await loadTask(db, id);
  if (!task) return c.json({ ok: false, error: "Not found" }, 404);
  assertOperationAccess(auth, task.operationId);

  // Remove all dependency edges (both directions)
  await db
    .delete(schema.taskDependencies)
    .where(
      or(
        eq(schema.taskDependencies.taskId, id),
        eq(schema.taskDependencies.prerequisiteId, id)
      )
    );
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));

  return c.json({ ok: true, data: { deleted: true } });
});

export default app;
