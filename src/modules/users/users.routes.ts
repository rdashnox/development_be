import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";

import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import {
  createUserSchema,
  updateUserRoleSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from "./users.schema.ts";

import { UserService } from "./users.service.ts";

const users = new Hono<{
  Variables: AppVariables;
}>();

// All users must be authenticated
users.use("*", requireAuth);

// Only administrator and internship_coordinator can view the user list
users.get(
  "/",
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const userService = new UserService(c.get("supabase"));

    const result = await userService.listUsers();

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Only administrators can view a specific user
users.get(
  "/:id",
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const userService = new UserService(c.get("supabase"));

    const id = c.req.param("id");
    if (!id) {
      return c.json(
        {
          success: false,
          error: "User ID is required",
        },
        400,
      );
    }

    const result = await userService.getUser(id);

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Only administrators can create users
users.post(
  "/",
  requireRole("administrator"),
  zValidator("json", createUserSchema),
  async (c) => {
    const userService = new UserService(c.get("supabase"));

    const body = c.req.valid("json");

    const result = await userService.createUser(body);

    return c.json(
      {
        success: true,
        data: result,
      },
      201,
    );
  },
);

// Only administrators can update users
users.patch(
  "/:id",
  requireRole("administrator"),
  zValidator("json", updateUserSchema),
  async (c) => {
    const userService = new UserService(c.get("supabase"));

    const body = c.req.valid("json");

    const result = await userService.updateUser(c.req.param("id"), body);

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Only administrators can update roles
users.patch(
  "/:id/role",
  requireRole("administrator"),
  zValidator("json", updateUserRoleSchema),
  async (c) => {
    const userService = new UserService(c.get("supabase"));

    const body = c.req.valid("json");

    const result = await userService.updateUserRole(c.req.param("id"), body);

    return c.json({
      success: true,
      data: result,
    });
  },
);

// Only administrators can update status
users.patch(
  "/:id/status",
  requireRole("administrator"),
  zValidator("json", updateUserStatusSchema),
  async (c) => {
    const userService = new UserService(c.get("supabase"));

    const body = c.req.valid("json");

    const result = await userService.updateStatus(c.req.param("id"), body);

    return c.json({
      success: true,
      data: result,
    });
  },
);

export default users;
