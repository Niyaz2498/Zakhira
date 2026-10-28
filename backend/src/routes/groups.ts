import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, or, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { authMiddleware, assertGroupAccess } from "../middleware/auth.js";
import type { Bindings, AuthContext, AppDB } from "../types.js";
import type { Group } from "@zakhira/core";
import { groupSubtreeIds, wouldCreateGroupCycle } from "@zakhira/core";

const app = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

app.use("*", authMiddleware);

function toGroup(row: typeof schema.groups.$inferSelect): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    startDate: row.startDate,
    endDate: row.endDate,
    importance: row.importance,
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The user's own groups, as the shape `@zakhira/core`'s tree helpers expect. */
async function loadOwnGroups(db: AppDB, auth: AuthContext): Promise<Group[]> {
  const rows = await db.query.groups.findMany();
  return rows.filter((r) => auth.allowedGroupIds.includes(r.id)).map(toGroup);
}

/**
 * Validate a proposed parent for `groupId` (use `null` for a new group, which
 * has no subtree yet). Returns an error message, or null if the parent is fine.
 */
function validateParent(
  parentId: string | null,
  groupId: string | null,
  auth: AuthContext,
  ownGroups: Group[]
): string | null {
  if (parentId === null) return null; // top level

  const parent = ownGroups.find((g) => g.id === parentId);
  if (!parent) {
    // Covers both "no such group" and "someone else's group". Not distinguished
    // on purpose — telling a caller a group exists but isn't theirs leaks it.
    return "Parent group not found";
  }
  // General Tasks is the implicit inbox for anything uncategorised, and it
  // reports a task count rather than main-quest progress. Letting it hold
  // sub-groups would make it a category like any other, which it isn't.
  if (parent.isDefault) {
    return "General Tasks cannot contain sub-groups";
  }
  if (groupId !== null && wouldCreateGroupCycle(groupId, parentId, ownGroups)) {
    return "A group cannot be moved inside itself or one of its own sub-groups";
  }
  return null;
}

// GET /groups
app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const rows = await db.query.groups.findMany();
  const groups = rows
    .filter((r) => auth.allowedGroupIds.includes(r.id))
    .map(toGroup);

  // Returned flat, parent pointers included; clients build the tree with
  // `buildGroupTree` from @zakhira/core so both apps nest identically.
  return c.json({ ok: true, data: groups });
});

// GET /groups/:id
app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const row = await db.query.groups.findFirst({
    where: eq(schema.groups.id, c.req.param("id")),
  });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  assertGroupAccess(auth, row.id);
  return c.json({ ok: true, data: toGroup(row) });
});

// POST /groups
app.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<{
    name: string;
    description?: string;
    parentId?: string | null;
    startDate?: string;
    endDate?: string;
    importance?: number;
  }>();
  if (!body.name?.trim()) return c.json({ ok: false, error: "name is required" }, 400);

  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const parentId = body.parentId ?? null;

  // A brand-new group has no descendants, so pass null as the group being
  // moved — only the parent's existence and ownership need checking.
  const parentError = validateParent(parentId, null, auth, await loadOwnGroups(db, auth));
  if (parentError) return c.json({ ok: false, error: parentError }, 400);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(schema.groups).values({
    id,
    userId: auth.userId,
    parentId,
    name: body.name.trim(),
    description: body.description ?? null,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    importance: body.importance ?? null,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });
  const row = await db.query.groups.findFirst({ where: eq(schema.groups.id, id) });
  return c.json({ ok: true, data: toGroup(row!) }, 201);
});

// PATCH /groups/:id
app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");
  const row = await db.query.groups.findFirst({ where: eq(schema.groups.id, id) });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  assertGroupAccess(auth, id);
  if (row.isDefault) return c.json({ ok: false, error: "Cannot edit General Tasks" }, 400);

  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    parentId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    importance?: number | null;
  }>();

  // Absent `parentId` leaves the group where it is; an explicit null promotes
  // it to the top level. Distinguishing the two is why this reads the key
  // rather than coalescing with ??.
  const reparenting = "parentId" in body;
  const parentId = reparenting ? (body.parentId ?? null) : row.parentId;

  if (reparenting && parentId !== row.parentId) {
    const parentError = validateParent(parentId, id, auth, await loadOwnGroups(db, auth));
    if (parentError) return c.json({ ok: false, error: parentError }, 400);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.groups)
    .set({
      name: body.name ?? row.name,
      description: "description" in body ? (body.description ?? null) : row.description,
      parentId,
      startDate: "startDate" in body ? (body.startDate ?? null) : row.startDate,
      endDate: "endDate" in body ? (body.endDate ?? null) : row.endDate,
      importance: "importance" in body ? (body.importance ?? null) : row.importance,
      updatedAt: now,
    })
    .where(eq(schema.groups.id, id));

  const updated = await db.query.groups.findFirst({ where: eq(schema.groups.id, id) });
  return c.json({ ok: true, data: toGroup(updated!) });
});

/**
 * Drop the comment log of every one of these tasks.
 *
 * task_comments has a plain FK with no ON DELETE CASCADE (matching
 * task_dependencies), so this has to run before the task rows go or the delete
 * fails the constraint — which is exactly what it did the first time a
 * cascading group delete met a commented task.
 */
async function clearComments(db: AppDB, taskIds: string[]): Promise<void> {
  for (const taskId of taskIds) {
    await db.delete(schema.taskComments).where(eq(schema.taskComments.taskId, taskId));
  }
}

/** Drop every dependency edge touching these tasks, in either direction. */
async function clearDependencies(db: AppDB, taskIds: string[]): Promise<void> {
  for (const taskId of taskIds) {
    await db
      .delete(schema.taskDependencies)
      .where(
        or(
          eq(schema.taskDependencies.taskId, taskId),
          eq(schema.taskDependencies.prerequisiteId, taskId)
        )
      );
  }
}

// DELETE /groups/:id
app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const id = c.req.param("id");
  const row = await db.query.groups.findFirst({ where: eq(schema.groups.id, id) });
  if (!row) return c.json({ ok: false, error: "Not found" }, 404);
  assertGroupAccess(auth, id);
  if (row.isDefault) return c.json({ ok: false, error: "Cannot delete General Tasks" }, 400);

  const body = await c.req.json<{ strategy: "move" | "cascade" }>();
  if (!["move", "cascade"].includes(body.strategy)) {
    return c.json({ ok: false, error: "strategy must be 'move' or 'cascade'" }, 400);
  }

  const now = new Date().toISOString();
  const ownGroups = await loadOwnGroups(db, auth);

  if (body.strategy === "cascade") {
    // Cascade takes the whole subtree: this group, its sub-groups at any
    // depth, and every task filed anywhere inside it.
    const subtree = groupSubtreeIds(id, ownGroups);
    const doomedTasks = await db.query.tasks.findMany({
      where: inArray(schema.tasks.groupId, subtree),
    });

    await clearDependencies(db, doomedTasks.map((t) => t.id));
    await clearComments(db, doomedTasks.map((t) => t.id));
    for (const t of doomedTasks) {
      await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id));
    }

    // Children before parents: the FK on groups.parent_id still points at
    // rows being removed, and `subtree` is breadth-first, so reverse it.
    for (const groupId of [...subtree].reverse()) {
      await db.delete(schema.groups).where(eq(schema.groups.id, groupId));
    }

    return c.json({ ok: true, data: { deleted: true } });
  }

  // "move" loses nothing. Direct tasks go to General Tasks; sub-groups are
  // promoted to this group's own parent, so a whole tree is never destroyed
  // by the gentler of the two options.
  //
  // Resolved from the caller's OWN groups, not with a bare
  // `where isDefault = true`: every user has a General Tasks row (and the
  // 0001 seed left an unowned one behind), so an unscoped lookup returns
  // whichever sorts first and can re-file a user's tasks into a group they
  // do not own. The task then vanishes from its owner's app — 403 on fetch
  // and filtered out of /sync — with no error anywhere. Found by the
  // local API check, which runs with several users in the database.
  const defaultGroup = ownGroups.find((g) => g.isDefault);
  if (!defaultGroup) return c.json({ ok: false, error: "Default group not found" }, 500);

  const directTasks = await db.query.tasks.findMany({
    where: eq(schema.tasks.groupId, id),
  });

  // Prerequisites are same-group scoped, so moving a task out invalidates
  // them — same rule as moving a single task between groups.
  await clearDependencies(db, directTasks.map((t) => t.id));
  for (const t of directTasks) {
    await db
      .update(schema.tasks)
      .set({ groupId: defaultGroup.id, updatedAt: now })
      .where(eq(schema.tasks.id, t.id));
  }

  for (const child of ownGroups.filter((g) => g.parentId === id)) {
    await db
      .update(schema.groups)
      .set({ parentId: row.parentId, updatedAt: now })
      .where(eq(schema.groups.id, child.id));
  }

  await db.delete(schema.groups).where(eq(schema.groups.id, id));

  return c.json({ ok: true, data: { deleted: true } });
});

export default app;
