import { z } from "zod";

const currentInternshipSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid(),
  hte_id: z.string().uuid(),
  faculty_adviser_id: z.string().uuid().nullable(),
  required_hours: z.number().int().positive().nullable(),
  status: z.enum(["pending", "active"]),
  created_at: z.string(),
  updated_at: z.string(),
  student_profiles: z
    .object({
      id: z.string().uuid(),
      student_number: z.string(),
      program: z.string(),
      year_level: z.number(),
      section: z.string().nullable(),
    })
    .nullable(),
  hte_profiles: z
    .object({
      id: z.string().uuid(),
      company_name: z.string(),
      contact_person: z.string(),
      contact_email: z.string().nullable(),
      is_active: z.boolean(),
    })
    .nullable(),
});

/**
 * FR-03
 *
 * Creates a student profile for an existing application user.
 * The userId must belong to a profile whose role is "student".
 */
export const createStudentSchema = z.object({
  userId: z.string().uuid(),
  studentNumber: z.string().trim().min(1),
  program: z.string().trim().min(1),
  yearLevel: z.number().int().min(1).max(6),
  section: z.string().trim().nullable().optional(),
  contactNumber: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  emergencyContactName: z.string().trim().nullable().optional(),
  emergencyContactNumber: z.string().trim().nullable().optional(),
});

/** Fields that staff may update on a student profile. */
export const updateStudentSchema = z.object({
  studentNumber: z.string().trim().min(1).optional(),
  program: z.string().trim().min(1).optional(),
  yearLevel: z.number().int().min(1).max(6).optional(),
  section: z.string().trim().nullable().optional(),
  contactNumber: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  emergencyContactName: z.string().trim().nullable().optional(),
  emergencyContactNumber: z.string().trim().nullable().optional(),
});

/** Fields a student may update for their own profile. */
export const updateMyStudentSchema = z.object({
  contactNumber: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  emergencyContactName: z.string().trim().nullable().optional(),
  emergencyContactNumber: z.string().trim().nullable().optional(),
});

export const studentSchema = z.object({
  id: z.string().uuid(),
  studentNumber: z.string(),
  program: z.string(),
  yearLevel: z.number(),
  section: z.string().nullable(),
  contactNumber: z.string().nullable(),
  address: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactNumber: z.string().nullable(),
  currentInternship: currentInternshipSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type UpdateMyStudentInput = z.infer<typeof updateMyStudentSchema>;
export type Student = z.infer<typeof studentSchema>;
