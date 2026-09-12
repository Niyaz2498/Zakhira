import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { sql, eq } from "drizzle-orm";
import * as schema from "./db/schema.js";
import type { Bindings, AppDB } from "./types.js";
import { verifyPassword, signJwt } from "./utils/crypto.js";
import operationsRouter from "./routes/operations.js";
import tasksRouter from "./routes/tasks.js";
import remindersRouter from "./routes/reminders.js";
import keysRouter from "./routes/keys.js";
import syncRouter from "./routes/sync.js";
import adminRouter from "./routes/admin.js";

const app = new Hono<{ Bindings: Bindings }>();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  "*",
  cors({
    origin: ["http://localhost:8081", "http://localhost:1420", "tauri://localhost", "https://tauri.localhost"],
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

// ─── FK constraints ───────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const db = drizzle(c.env.DB, { schema }) as AppDB;
  await db.run(sql`PRAGMA foreign_keys=ON`);
  await next();
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();
  if (!body.username?.trim() || !body.password) {
    return c.json({ ok: false, error: "username and password are required" }, 400);
  }

  const db = drizzle(c.env.DB, { schema }) as AppDB;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, body.username.trim()),
  });

  if (!user || !user.passwordHash) {
    return c.json({ ok: false, error: "Invalid username or password" }, 401);
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return c.json({ ok: false, error: "Invalid username or password" }, 401);
  }

  const token = await signJwt(user.id, c.env.JWT_SECRET);
  return c.json({ ok: true, data: { token, userId: user.id, username: user.username } });
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
