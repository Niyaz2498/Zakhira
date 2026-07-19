import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types.js";

export const adminAuthMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    const token = header.slice(7);
    if (!c.env.ADMIN_SECRET || token !== c.env.ADMIN_SECRET) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    await next();
  }
);
