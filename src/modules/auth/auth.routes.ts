import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  changePasswordSchema,
  completePasswordResetSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
} from "./auth.schema.ts";

import { AuthService } from "./auth.service.ts";
import { requireAuth } from "./auth.middleware.ts";

import type { AppVariables } from "../../types/context.ts";

import { logger } from "../../shared/logger.ts";
import { AppError } from "../../errors/app-error.ts";

import { rateLimit } from "../../middleware/rate-limit.middleware.ts";
import { rateLimitConfig } from "../../config/rate-limit.ts";

import type { RateLimitStore } from "../../infrastructure/rate-limit/rate-limit.types.ts";

import { requireRole } from "./role.middleware.ts";
import type { AuthRole } from "./auth.types.ts";

// FR-11: Audit Logging
import { AuditService } from "../audit/audit.service.ts";

export function createAuthRoutes(
  frontendUrl: string,
  rateLimitStore: RateLimitStore,
) {
  const auth = new Hono<{
    Variables: AppVariables & {
      user: {
        id: string;
        email?: string;
      };

      userRole: AuthRole;
    };
  }>();

  auth.post(
    "/login",
    rateLimit(rateLimitConfig.login, rateLimitStore, "auth:login"),
    zValidator("json", loginSchema),
    async (c) => {
      const body = c.req.valid("json");

      const supabase = c.get("supabase");

      const authService = new AuthService(supabase, frontendUrl);

      const result = await authService.login(body);

      // FR-11: Record a successful login in the audit trail.
      // Audit failure must not cause an otherwise successful login to fail.
      const auditService = new AuditService(supabase);

      await auditService.log({
        userId: result.user.id,
        action: "LOGIN",
        resourceType: "AUTH",
        resourceId: result.user.id,
        details: {},
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      });

      return c.json({
        success: true,
        data: result,
      });
    },
  );

  auth.post(
    "/forgot-password",
    rateLimit(
      rateLimitConfig.forgotPassword,
      rateLimitStore,
      "auth:forgot-password",
    ),
    zValidator("json", forgotPasswordSchema),
    async (c) => {
      const body = c.req.valid("json");

      const authService = new AuthService(c.get("supabase"), frontendUrl);

      const result = await authService.forgotPassword(body);

      return c.json({
        success: true,
        message: result.message,
        data: null,
      });
    },
  );

  auth.post(
    "/reset-password/complete",
    rateLimit(
      rateLimitConfig.completePasswordReset,
      rateLimitStore,
      "auth:reset-password",
    ),
    zValidator("json", completePasswordResetSchema),
    async (c) => {
      const body = c.req.valid("json");

      const authService = new AuthService(c.get("supabase"), frontendUrl);

      const result = await authService.completePasswordReset(body);

      return c.json({
        success: true,
        message: result.message,
        data: {
          user: result.user,
        },
      });
    },
  );

  auth.post(
    "/change-password",
    requireAuth,
    rateLimit(
      rateLimitConfig.changePassword,
      rateLimitStore,
      "auth:change-password",
    ),
    zValidator("json", changePasswordSchema),
    async (c) => {
      const body = c.req.valid("json");
      const user = c.get("user");

      const authService = new AuthService(c.get("supabase"), frontendUrl);

      const result = await authService.changePassword(user.id, body);

      return c.json({
        success: true,
        data: result,
      });
    },
  );

  auth.get("/me", requireAuth, async (c) => {
    const user = c.get("user");

    const authService = new AuthService(c.get("supabase"), frontendUrl);

    const result = await authService.getCurrentUser(user.id);

    return c.json({
      success: true,
      data: result,
    });
  });

  auth.post(
    "/logout",
    requireAuth,
    rateLimit(rateLimitConfig.logout, rateLimitStore, "auth:logout"),
    async (c) => {
      const authHeader = c.req.header("Authorization");

      const token = authHeader?.split(" ")[1];

      if (token) {
        const authenticatedClient = c
          .get("supabase")
          .createAuthenticatedClient(token);

        const { error } = await authenticatedClient.auth.signOut();

        if (error) {
          logger.warn("Error during Supabase sign out", { error });
        }
      }

      return c.json({
        success: true,
        data: {
          message: "Logged out successfully.",
        },
      });
    },
  );

  auth.post(
    "/refresh",
    rateLimit(rateLimitConfig.refresh, rateLimitStore, "auth:refresh"),
    zValidator("json", refreshTokenSchema),
    async (c) => {
      const body = c.req.valid("json");

      const authService = new AuthService(c.get("supabase"), frontendUrl);

      const result = await authService.refresh(body);

      return c.json({
        success: true,
        data: result,
      });
    },
  );

  auth.get("/role", requireAuth, async (c) => {
    const user = c.get("user");

    const { data, error } = await c
      .get("supabase")
      .supabaseAdmin.from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      throw new AppError(404, "Profile not found.");
    }

    return c.json({
      success: true,
      data: {
        role: data.role,
      },
    });
  });

  auth.get("/admin-check", requireAuth, requireRole("administrator"), (c) => {
    return c.json({
      success: true,
      message: "Administrator access granted.",
    });
  });

  return auth;
}
