import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, or } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { authMiddleware, assertOperationAccess } from "../middleware/auth.js";
import type { Bindings, AuthContext } from "../types.js";
import type { Operation } from "@zakhira/core";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

app.use("*", authMiddleware);

function toOperation(row: typeof schema.operations.$inferSelect): Operation {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    importance: row.importance,
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /operations
app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema });
  let rows = await db.query.operations.findMany();

  if (auth.scope === "scoped" && auth.allowedOperationIds) {
    rows = rows.filter((r) => auth.allowedOperationIds!.includes(r.id));
  }

  return c.json({ ok: true, data: rows.map(toOperation) });
});

// GET /operations/:id
app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema });
  const row = await db.query.operations.findFirst({
    where: eq(schema.operations.id, c.req.param("id")),
  });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  assertOperationAccess(auth, row.id);
  return c.json({ ok: true, data: toOperation(row) });
});

// POST /operations
app.post("/", async (c) => {
  const auth = c.get("auth");
  if (auth.scope === "scoped") {
    return c.json({ ok: false, error: "Scoped keys cannot create operations" }, 403);
  }
  const body = await c.req.json<{
    name: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    importance?: number;
  }>();
  if (!body.name?.trim()) return c.json({ ok: false, error: "name is required" }, 400);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = drizzle(c.env.DB, { schema });
  await db.insert(schema.operations).values({
    id,
    name: body.name.trim(),
    description: body.description ?? null,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    importance: body.importance ?? null,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });
  const row = await db.query.operations.findFirst({ where: eq(schema.operations.id, id) });
  return c.json({ ok: true, data: toOperation(row!) }, 201);
});

// PATCH /operations/:id
app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema });
  const id = c.req.param("id");
  const row = await db.query.operations.findFirst({ where: eq(schema.operations.id, id) });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  assertOperationAccess(auth, id);
  if (row.isDefault) return c.json({ ok: false, error: "Cannot edit General Tasks" }, 400);

  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    importance?: number | null;
  }>();

  const now = new Date().toISOString();
  await db
    .update(schema.operations)
    .set({
      name: body.name ?? row.name,
      description: "description" in body ? (body.description ?? null) : row.description,
      startDate: "startDate" in body ? (body.startDate ?? null) : row.startDate,
      endDate: "endDate" in body ? (body.endDate ?? null) : row.endDate,
      importance: "importance" in body ? (body.importance ?? null) : row.importance,
      updatedAt: now,
    })
    .where(eq(schema.operations.id, id));

  const updated = await db.query.operations.findFirst({ where: eq(schema.operations.id, id) });
  return c.json({ ok: true, data: toOperation(updated!) });
});

// DELETE /operations/:id
app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  if (auth.scope === "scoped") {
    return c.json({ ok: false, error: "Scoped keys cannot delete operations" }, 403);
  }
  const db = drizzle(c.env.DB, { schema });
  const id = c.req.param("id");
  const row = await db.query.operations.findFirst({ where: eq(schema.operations.id, id) });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  if (row.isDefault) return c.json({ ok: false, error: "Cannot delete General Tasks" }, 400);

  const body = await c.req.json<{ strategy: "move" | "cascade" }>();
  if (!["move", "cascade"].includes(body.strategy)) {
    return c.json({ ok: false, error: "strategy must be 'move' or 'cascade'" }, 400);
  }

  const now = new Date().toISOString();

  if (body.strategy === "cascade") {
    // Delete all tasks in this operation (clear their deps first)
    const opTasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.operationId, id),
    });
    for (const t of opTasks) {
      await db
        .delete(schema.taskDependencies)
        .where(
          or(
            eq(schema.taskDependencies.taskId, t.id),
            eq(schema.taskDependencies.prerequisiteId, t.id)
          )
        );
    }
    for (const t of opTasks) {
      await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id));
    }
  } else {
    // Move tasks to General Tasks; clear their prerequisites
    const defaultOp = await db.query.operations.findFirst({
      where: eq(schema.operations.isDefault, true),
    });
    if (!defaultOp) return c.json({ ok: false, error: "Default operation not found" }, 500);

    const opTasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.operationId, id),
    });
    for (const t of opTasks) {
      await db
        .delete(schema.taskDependencies)
        .where(
          or(
            eq(schema.taskDependencies.taskId, t.id),
            eq(schema.taskDependencies.prerequisiteId, t.id)
          )
        );
      await db
        .update(schema.tasks)
        .set({ operationId: defaultOp.id, updatedAt: now })
        .where(eq(schema.tasks.id, t.id));
    }
  }

  await db
    .delete(schema.apiKeyOperations)
    .where(eq(schema.apiKeyOperations.operationId, id));
  await db.delete(schema.operations).where(eq(schema.operations.id, id));

  return c.json({ ok: true, data: { deleted: true } });
});

export default app;
