import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";

import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import { internshipReportQuerySchema } from "./reports.schema.ts";
import { ReportsService } from "./reports.service.ts";

const reports = new Hono<{
  Variables: AppVariables;
}>();

/**
 * All reporting endpoints require authentication.
 */
reports.use("*", requireAuth);

/**
 * GET /reports/internships
 *
 * Generates the internship monitoring report.
 *
 * Reporting access currently follows the same institutional
 * internship-list permission boundary:
 * - administrator
 * - internship_coordinator
 */
reports.get(
  "/internships",
  requireRole("administrator", "internship_coordinator"),
  zValidator("query", internshipReportQuerySchema),
  async (c) => {
    const reportsService = new ReportsService(c.get("supabase"));

    const filters = c.req.valid("query");

    const result = await reportsService.getInternshipReport(filters);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /reports/internships/summary
 *
 * Generates basic aggregate internship summary information.
 */
reports.get(
  "/internships/summary",
  requireRole("administrator", "internship_coordinator"),
  zValidator("query", internshipReportQuerySchema),
  async (c) => {
    const reportsService = new ReportsService(c.get("supabase"));

    const filters = c.req.valid("query");

    const result = await reportsService.getInternshipReportSummary(filters);

    return c.json({
      success: true,
      data: result,
    });
  },
);

export default reports;
