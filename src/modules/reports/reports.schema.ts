import { z } from "zod";

export const internshipReportQuerySchema = z.object({
  status: z.enum(["pending", "active", "completed"]).optional(),

  program: z.string().trim().min(1, "Program must not be empty.").optional(),

  hte_id: z.string().uuid().optional(),

  faculty_adviser_id: z.string().uuid().optional(),
});

export type InternshipReportQuery = z.infer<typeof internshipReportQuerySchema>;
