import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import * as schema from "./db/schema.js";
import type { Bindings, AppDB } from "./types.js";
import { generateApiKey, hashKey } from "./utils/crypto.js";
import operationsRouter from "./routes/operations.js";
import tasksRouter from "./routes/tasks.js";
import remindersRouter from "./routes/reminders.js";
import keysRouter from "./routes/keys.js";
import syncRouter from "./routes/sync.js";
import adminRouter from "./routes/admin.js";

const app = new Hono<{ Bindings: Bindings }>();

// ─── CORS (dev convenience) ───────────────────────────────────────────────────
app.use(
  "*",
  cors({
    origin: ["http://localhost:8081", "http://localhost:1420", "tauri://localhost", "https://tauri.localhost"],
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

// ─── Enable FK constraints ────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  await db.run(sql`PRAGMA foreign_keys=ON`);
  await next();
});

// ─── Bootstrap (no auth — only while zero keys exist) ─────────────────────────
app.post("/bootstrap", async (c) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;

  // Refuse if any key already exists
  const existing = await db.query.apiKeys.findFirst();
  if (existing) {
    return c.json({ ok: false, error: "Bootstrap endpoint is sealed" }, 403);
  }

  const body = await c.req.json<{
    name?: string;
    scope?: "all" | "scoped";
    operationIds?: string[];
  }>();

  const plaintext = generateApiKey();
  const hash = await hashKey(plaintext);
  const now = new Date().toISOString();
  const keyId = crypto.randomUUID();

  // Insert General Tasks default operation if it doesn't exist
  const defaultOp = await db.query.operations.findFirst({
    where: sql`is_default = 1`,
  });
  if (!defaultOp) {
    await db.insert(schema.operations).values({
      id: crypto.randomUUID(),
      name: "General Tasks",
      description: null,
      startDate: null,
      endDate: null,
      importance: null,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.insert(schema.apiKeys).values({
    id: keyId,
    keyHash: hash,
    name: body.name ?? "Default",
    scope: "all",
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    ok: true,
    data: {
      key: {
        id: keyId,
        name: body.name ?? "Default",
        scope: "all",
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      plaintext,
    },
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.route("/operations", operationsRouter);
app.route("/tasks", tasksRouter);
app.route("/reminders", remindersRouter);
app.route("/keys", keysRouter);
app.route("/sync", syncRouter);
app.route("/admin", adminRouter);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ ok: true, data: { status: "ok" } }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ ok: false, error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ ok: false, error: "Internal server error" }, 500);
});

export default app;
