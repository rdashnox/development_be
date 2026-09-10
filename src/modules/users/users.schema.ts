import { z } from "zod";

export const roleSchema = z.enum([
  "administrator",
  "internship_coordinator",
  "faculty_adviser",
  "student",
  "hte_supervisor",
]);

export const createUserSchema = z.object({
  email: z.string().trim().email(),

  firstName: z.string().min(1),

  middleName: z.string().nullable().optional(),

  lastName: z.string().min(1),

  suffix: z.string().nullable().optional(),

  role: roleSchema,

  password: z.string().min(8).max(72),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1),

  middleName: z.string().nullable().optional(),

  lastName: z.string().min(1),

  suffix: z.string().nullable().optional(),
});

export const updateUserRoleSchema = z.object({
  role: roleSchema,
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});
