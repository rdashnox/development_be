import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import { auditLogQuerySchema } from "./audit.schema.ts";
import { AuditService } from "./audit.service.ts";

const audit = new Hono<{
  Variables: AppVariables;
}>();

audit.use("*", requireAuth);

audit.get(
  "/",
  requireRole("administrator"),
  zValidator("query", auditLogQuerySchema),
  async (c) => {
    const service = new AuditService(c.get("supabase"));
    const result = await service.list(c.req.valid("query"));

    return c.json({
      success: true,
      data: result,
    });
  },
);

export default audit;
