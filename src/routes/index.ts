import { Hono } from "hono";

import type { AppVariables } from "../types/context.ts";

import health from "../modules/health/health.routes.ts";
import { createAuthRoutes } from "../modules/auth/auth.routes.ts";

import users from "../modules/users/users.routes.ts";
import students from "../modules/students/students.routes.ts";
import htes from "../modules/htes/htes.routes.ts";
import internships from "../modules/internships/internships.routes.ts";
import attendance from "../modules/attendance/attendance.routes.ts";
import evaluations from "../modules/evaluations/evaluations.routes.ts";
import documents from "../modules/documents/documents.routes.ts";

import { performanceRoutes } from "../modules/performance/performance.routes.ts";

import type { RateLimitStore } from "../infrastructure/rate-limit/rate-limit.types.ts";

export function createApiRoutes(
  frontendUrl: string,
  rateLimitStore: RateLimitStore,
) {
  const api = new Hono<{
    Variables: AppVariables;
  }>();

  api.route("/health", health);

  api.route("/auth", createAuthRoutes(frontendUrl, rateLimitStore));

  api.route("/users", users);
  api.route("/students", students);
  api.route("/htes", htes);
  api.route("/internships", internships);
  api.route("/attendance", attendance);
  api.route("/evaluations", evaluations);
  api.route("/documents", documents);

  api.route("/performance", performanceRoutes);

  return api;
}
