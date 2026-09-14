import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";
import { AppError } from "../../errors/app-error.ts";

import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import { createEvaluationSchema, updateEvaluationSchema } from "./evaluations.schema.ts";

import { EvaluationService } from "./evaluations.service.ts";

const evaluations = new Hono<{
  Variables: AppVariables;
}>();

evaluations.use("*", requireAuth);

/**
 * POST /evaluations
 *
 * Creates an evaluation for an eligible internship.
 *
 * HTE Supervisor:
 *   Creates "hte_supervisor" evaluations.
 *
 * Faculty Adviser:
 *   Creates "faculty_adviser" evaluations.
 */
evaluations.post(
  "/",
  requireRole("hte_supervisor", "faculty_adviser"),
  zValidator("json", createEvaluationSchema),
  async (c) => {
    const evaluationService = new EvaluationService(c.get("supabase"));

    const user = c.get("user");
    const role = c.get("userRole");

    if (role !== "hte_supervisor" && role !== "faculty_adviser") {
      throw new AppError(403, "You are not authorized to create evaluations.");
    }

    const body = c.req.valid("json");

    const result = await evaluationService.createEvaluation(
      user.id,
      role,
      body,
    );

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
 * GET /evaluations/me
 *
 * HTE Supervisor:
 *   Retrieves evaluations associated with their assigned HTE.
 *
 * Faculty Adviser:
 *   Retrieves evaluations for internships assigned to them.
 */
evaluations.get(
  "/me",
  requireRole("hte_supervisor", "faculty_adviser"),
  async (c) => {
    const evaluationService = new EvaluationService(c.get("supabase"));

    const user = c.get("user");
    const role = c.get("userRole");

    if (role !== "hte_supervisor" && role !== "faculty_adviser") {
      throw new AppError(
        403,
        "You are not authorized to access evaluator evaluations.",
      );
    }

    const result = await evaluationService.getMyEvaluations(user.id, role);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /evaluations/internship/:internshipId
 *
 * Retrieves evaluations for an internship.
 *
 * HTE Supervisor:
 *   Can access evaluations for internships assigned to their HTE.
 *
 * Faculty Adviser:
 *   Can access evaluations for internships assigned to them.
 *
 * Student:
 *   Can access only submitted evaluations for their own internship.
 *
 * Internship Coordinator:
 *   Read access.
 *
 * Administrator:
 *   Read access.
 */
evaluations.get(
  "/internship/:internshipId",
  requireRole(
    "administrator",
    "internship_coordinator",
    "faculty_adviser",
    "student",
    "hte_supervisor",
  ),
  async (c) => {
    const evaluationService = new EvaluationService(c.get("supabase"));

    const user = c.get("user");
    const role = c.get("userRole");

    const internshipId = c.req.param("internshipId");

    if (!internshipId) {
      throw new AppError(400, "Internship ID is required.");
    }

    if (
      role !== "administrator" &&
      role !== "internship_coordinator" &&
      role !== "faculty_adviser" &&
      role !== "student" &&
      role !== "hte_supervisor"
    ) {
      throw new AppError(403, "You are not authorized to access evaluations.");
    }

    const result = await evaluationService.getEvaluationsByInternship(
      internshipId,
      user.id,
      role,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /evaluations/:id
 *
 * Read access:
 * - Administrator
 * - Internship Coordinator
 * - Faculty Adviser
 * - HTE Supervisor
 * - Student
 *
 * Resource-level authorization is enforced by EvaluationService.
 */
evaluations.get(
  "/:id",
  requireRole(
    "administrator",
    "internship_coordinator",
    "faculty_adviser",
    "student",
    "hte_supervisor",
  ),
  async (c) => {
    const evaluationService = new EvaluationService(c.get("supabase"));

    const user = c.get("user");
    const role = c.get("userRole");

    const id = c.req.param("id");

    if (!id) {
      throw new AppError(400, "Evaluation ID is required.");
    }

    if (
      role !== "administrator" &&
      role !== "internship_coordinator" &&
      role !== "faculty_adviser" &&
      role !== "student" &&
      role !== "hte_supervisor"
    ) {
      throw new AppError(403, "You are not authorized to access evaluations.");
    }

    const result = await evaluationService.getEvaluationById(id, user.id, role);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * PATCH /evaluations/:id
 *
 * HTE Supervisor or Faculty Adviser updates their
 * own draft evaluation.
 *
 * Submitted evaluations are immutable.
 */
evaluations.patch(
  "/:id",
  requireRole("hte_supervisor", "faculty_adviser"),
  zValidator("json", updateEvaluationSchema),
  async (c) => {
    const evaluationService = new EvaluationService(c.get("supabase"));

    const user = c.get("user");
    const role = c.get("userRole");

    if (role !== "hte_supervisor" && role !== "faculty_adviser") {
      throw new AppError(403, "You are not authorized to update evaluations.");
    }

    const id = c.req.param("id");

    if (!id) {
      throw new AppError(400, "Evaluation ID is required.");
    }

    const body = c.req.valid("json");

    const result = await evaluationService.updateEvaluation(
      id,
      user.id,
      role,
      body,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * POST /evaluations/:id/submit
 *
 * HTE Supervisor or Faculty Adviser submits
 * their own draft evaluation.
 *
 * Submission is final and cannot be edited afterward.
 */
evaluations.post(
  "/:id/submit",
  requireRole("hte_supervisor", "faculty_adviser"),
  async (c) => {
    const evaluationService = new EvaluationService(c.get("supabase"));

    const user = c.get("user");
    const role = c.get("userRole");

    if (role !== "hte_supervisor" && role !== "faculty_adviser") {
      throw new AppError(403, "You are not authorized to submit evaluations.");
    }

    const id = c.req.param("id");

    if (!id) {
      throw new AppError(400, "Evaluation ID is required.");
    }

    const result = await evaluationService.submitEvaluation(id, user.id, role);

    return c.json({
      success: true,
      data: result,
    });
  },
);

export default evaluations;
