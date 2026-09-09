import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";

import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import {
  createStudentSchema,
  updateMyStudentSchema,
  updateStudentSchema,
} from "./students.schema.ts";

import { StudentService } from "./students.service.ts";

const students = new Hono<{
  Variables: AppVariables;
}>();

/**

* GET /students
*
* Administrator and internship coordinator only.
*
* Returns all student profiles with their associated user/profile data.
  */
students.get(
  "/",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  async (c) => {
    const studentService = new StudentService(c.get("supabase"));
    const result = await studentService.listStudents();

    return c.json({ success: true, data: result });
  },
);

/**

* GET /students/assigned
*
* Faculty advisers only.
*
* Returns only students assigned to the authenticated faculty adviser
* through a pending or active internship.
  */
students.get(
  "/assigned",
  requireAuth,
  requireRole("faculty_adviser"),
  async (c) => {
    const studentService = new StudentService(c.get("supabase"));

    const result = await studentService.listAssignedStudents(c.get("user").id);

    return c.json({ success: true, data: result });
  },
);

/** GET /students/me */
students.get("/me", requireAuth, requireRole("student"), async (c) => {
  const studentService = new StudentService(c.get("supabase"));

  const result = await studentService.getMyStudentProfile(c.get("user").id);

  return c.json({ success: true, data: result });
});

/** PATCH /students/me */
students.patch(
  "/me",
  requireAuth,
  requireRole("student"),
  zValidator("json", updateMyStudentSchema),
  async (c) => {
    const studentService = new StudentService(c.get("supabase"));

    const result = await studentService.updateMyStudentProfile(
      c.get("user").id,
      c.req.valid("json"),
    );

    return c.json({ success: true, data: result });
  },
);

/**

* GET /students/:id
*
* Faculty advisers are restricted by the service to students assigned
* to them through a pending or active internship.
  */
students.get(
  "/:id",
  requireAuth,
  requireRole("administrator", "internship_coordinator", "faculty_adviser"),
  async (c) => {
    const studentService = new StudentService(c.get("supabase"));
    const id = c.req.param("id");

    if (!id) {
      return c.json(
        { success: false, message: "Student ID is required." },
        400,
      );
    }

    const user = c.get("user");

    const result = await studentService.getStudent(
      id,
      user.id,
      (
        user as {
          id: string;
          role:
            | "administrator"
            | "internship_coordinator"
            | "faculty_adviser"
            | "student";
        }
      ).role,
    );

    return c.json({ success: true, data: result });
  },
);

/** POST /students */
students.post(
  "/",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", createStudentSchema),
  async (c) => {
    const studentService = new StudentService(c.get("supabase"));

    const result = await studentService.createStudent(c.req.valid("json"));

    return c.json({ success: true, data: result }, 201);
  },
);

/** PATCH /students/:id */
students.patch(
  "/:id",
  requireAuth,
  requireRole("administrator", "internship_coordinator"),
  zValidator("json", updateStudentSchema),
  async (c) => {
    const studentService = new StudentService(c.get("supabase"));

    const result = await studentService.updateStudent(
      c.req.param("id"),
      c.req.valid("json"),
    );

    return c.json({ success: true, data: result });
  },
);

export default students;
