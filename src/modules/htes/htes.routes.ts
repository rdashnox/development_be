import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";

import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import {
  createHTESchema,
  updateHTESchema,
  updateHTEStatusSchema,
  updateHTESupervisorSchema,
} from "./htes.schema.ts";

import { HteService } from "./htes.service.ts";

const htes = new Hono<{
  Variables: AppVariables;
}>();

// All HTE endpoints require authentication.
htes.use("*", requireAuth);

// =====================================================
// HTE SUPERVISOR
// =====================================================

/**

GET /htes/my/students

HTE supervisors can retrieve the operational student

interns associated with the HTE assigned to their account.

The supervisor ID comes from the authenticated user and

is never accepted from the client.
*/
htes.get("/my/students", requireRole("hte_supervisor"), async (c) => {
  const hteService = new HteService(c.get("supabase"));

  const result = await hteService.listMyStudents(c.get("user").id);

  return c.json({
    success: true,
    data: result,
  });
});

// =====================================================
// HTE MANAGEMENT
// =====================================================

/**

GET /htes

Administrator and internship coordinator only.
*/
htes.get(
  "/",
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const hteService = new HteService(c.get("supabase"));

    const result = await hteService.listHtes();

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**

GET /htes/:id/students

Administrator and internship coordinator only.

Returns students with an operational internship

(pending or active) associated with the specified HTE.
*/
htes.get(
  "/:id/students",
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const hteService = new HteService(c.get("supabase"));
    const id = c.req.param("id");

    if (!id) {
      return c.json(
        {
          success: false,
          error: "HTE id is required",
        },
        400,
      );
    }

    const result = await hteService.listHteStudents(id);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**

GET /htes/:id

Administrator and internship coordinator only.
*/
htes.get(
  "/:id",
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const hteService = new HteService(c.get("supabase"));
    const id = c.req.param("id");

    if (!id) {
      return c.json(
        {
          success: false,
          error: "HTE id is required",
        },
        400,
      );
    }

    const result = await hteService.getHte(id);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**

POST /htes

Administrator and internship coordinator only.
*/
htes.post(
  "/",
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", createHTESchema),
  async (c) => {
    const hteService = new HteService(c.get("supabase"));

    const body = c.req.valid("json");

    const result = await hteService.createHte(body);

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

PATCH /htes/:id

Administrator and internship coordinator only.
*/
htes.patch(
  "/:id",
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", updateHTESchema),
  async (c) => {
    const hteService = new HteService(c.get("supabase"));
    const id = c.req.param("id");

    if (!id) {
      return c.json(
        {
          success: false,
          error: "HTE id is required",
        },
        400,
      );
    }

    const body = c.req.valid("json");

    const result = await hteService.updateHte(id, body);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**

PATCH /htes/:id/status

Administrator and internship coordinator only.
*/
htes.patch(
  "/:id/status",
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", updateHTEStatusSchema),
  async (c) => {
    const hteService = new HteService(c.get("supabase"));
    const id = c.req.param("id");

    if (!id) {
      return c.json(
        {
          success: false,
          error: "HTE id is required",
        },
        400,
      );
    }

    const body = c.req.valid("json");

    const result = await hteService.updateStatus(id, body);

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**

PATCH /htes/:id/supervisor

Administrator and internship coordinator only.
*/
htes.patch(
  "/:id/supervisor",
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", updateHTESupervisorSchema),
  async (c) => {
    const hteService = new HteService(c.get("supabase"));
    const id = c.req.param("id");

    if (!id) {
      return c.json(
        {
          success: false,
          error: "HTE id is required",
        },
        400,
      );
    }

    const body = c.req.valid("json");

    const result = await hteService.assignSupervisor(id, body.supervisorId);

    return c.json({
      success: true,
      data: result,
    });
  },
);

export default htes;
