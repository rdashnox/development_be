import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";

import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import {
  createInternshipSchema,
  createMyInternshipSchema,
  updateFacultyAdviserSchema,
  updateInternshipSchema,
  updateInternshipStatusSchema,
} from "./internships.schema.ts";

import { InternshipService } from "./internships.service.ts";

const internships = new Hono<{
  Variables: AppVariables;
}>();

/**
 * GET /internships
 *
 * Lists all internship assignments.
 */
internships.get(
  "/",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const internshipService = new InternshipService(c.get("supabase"));

    const result = await internshipService.listInternships();

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /internships/me
 *
 * Retrieves the authenticated student's current
 * pending or active internship assignment.
 */
internships.get("/me", requireAuth, requireRole("student"), async (c) => {
  const internshipService = new InternshipService(c.get("supabase"));

  const user = c.get("user");

  const result = await internshipService.getMyInternship(user.id);

  return c.json({
    success: true,
    data: result,
  });
});

/**
 * POST /internships
 *
 * Creates a new internship assignment.
 *
 * Status is not accepted from the client.
 * New records are created as "pending".
 */
internships.post(
  "/",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", createInternshipSchema),
  async (c) => {
    const internshipService = new InternshipService(c.get("supabase"));

    const body = c.req.valid("json");

    const result = await internshipService.createInternship(body);

    return c.json(
      {
        success: true,
        data: result,
      },
      201,
    );
  },
);

/**
 * POST /internships/me
 *
 * Student self-service internship creation.
 *
 * This route is retained according to the existing API structure.
 */
internships.post(
  "/me",
  requireAuth,
  requireRole("student"),
  zValidator("json", createMyInternshipSchema),
  async (c) => {
    const internshipService = new InternshipService(c.get("supabase"));

    const body = c.req.valid("json");
    const user = c.get("user");

    const result = await internshipService.createInternship({
      studentId: user.id,
      hteId: body.hteId,
      facultyAdviserId: user.id,
      startDate: "",
      endDate: "",
      requiredHours: 1,
    });

    return c.json(
      {
        success: true,
        data: result,
      },
      201,
    );
  },
);

/**
 * GET /internships/:id
 *
 * Retrieves a specific internship assignment.
 */
internships.get(
  "/:id",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const internshipService = new InternshipService(c.get("supabase"));
    const internshipId = c.req.param("id");

    if (!internshipId) {
      return c.json(
        {
          success: false,
          error: "Internship ID is required.",
        },
        400,
      );
    }

    const result = await internshipService.getInternship(internshipId);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * PATCH /internships/:id/status
 *
 * Changes the internship lifecycle status.
 *
 * Business-rule validation is handled by InternshipService.
 */
internships.patch(
  "/:id/status",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", updateInternshipStatusSchema),
  async (c) => {
    const internshipService = new InternshipService(c.get("supabase"));
    const internshipId = c.req.param("id");

    if (!internshipId) {
      return c.json(
        {
          success: false,
          error: "Internship ID is required.",
        },
        400,
      );
    }

    const body = c.req.valid("json");

    const result = await internshipService.updateStatus(
      internshipId,
      body.status,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * PATCH /internships/:id/adviser
 *
 * Legacy/specialized faculty-adviser update endpoint.
 *
 * The main PATCH /internships/:id endpoint also supports
 * facultyAdviserId. This route remains temporarily for
 * compatibility with existing clients/tests.
 */
internships.patch(
  "/:id/adviser",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", updateFacultyAdviserSchema),
  async (c) => {
    const internshipService = new InternshipService(c.get("supabase"));
    const internshipId = c.req.param("id");

    if (!internshipId) {
      return c.json(
        {
          success: false,
          error: "Internship ID is required.",
        },
        400,
      );
    }

    const body = c.req.valid("json");

    const result = await internshipService.assignFacultyAdviser(
      internshipId,
      body.facultyAdviserId,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * PATCH /internships/:id
 *
 * Updates ordinary internship assignment details:
 * - HTE
 * - faculty adviser
 * - start date
 * - end date
 * - required hours
 *
 * Status must be changed through /status.
 */
internships.patch(
  "/:id",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", updateInternshipSchema),
  async (c) => {
    const internshipService = new InternshipService(c.get("supabase"));
    const internshipId = c.req.param("id");

    if (!internshipId) {
      return c.json(
        {
          success: false,
          error: "Internship ID is required.",
        },
        400,
      );
    }

    const body = c.req.valid("json");

    const result = await internshipService.updateInternship(internshipId, body);

    return c.json({
      success: true,
      data: result,
    });
  },
);

export default internships;
