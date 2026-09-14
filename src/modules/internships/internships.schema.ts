import { z } from "zod";

const internshipDateSchema = z.string().date();

export const createInternshipSchema = z
  .object({
    studentId: z.string().uuid(),
    hteId: z.string().uuid(),
    facultyAdviserId: z.string().uuid(),
    startDate: internshipDateSchema,
    endDate: internshipDateSchema,
    requiredHours: z.number().int().positive(),
  })
  .refine((data) => data.startDate < data.endDate, {
    message: "Internship start date must be earlier than the end date.",
    path: ["endDate"],
  });

/**
 * Retained for compatibility with the existing module contract.
 *
 * There is currently no POST /internships/me route in the
 * internship router. Do not introduce one merely because this
 * schema exists.
 */
export const createMyInternshipSchema = z.object({
  hteId: z.string().uuid(),
});

export const updateInternshipStatusSchema = z.object({
  status: z.enum(["pending", "active", "completed"]),
});

export const updateFacultyAdviserSchema = z.object({
  facultyAdviserId: z.string().uuid().nullable(),
});

export const updateInternshipSchema = z
  .object({
    hteId: z.string().uuid().optional(),
    facultyAdviserId: z.string().uuid().nullable().optional(),
    startDate: internshipDateSchema.optional(),
    endDate: internshipDateSchema.optional(),
    requiredHours: z.number().int().positive().optional(),
  })
  .refine(
    (data) =>
      data.hteId !== undefined ||
      data.facultyAdviserId !== undefined ||
      data.startDate !== undefined ||
      data.endDate !== undefined ||
      data.requiredHours !== undefined,
    {
      message: "At least one internship field must be provided.",
    },
  );
