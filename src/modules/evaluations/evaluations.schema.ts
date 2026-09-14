import { z } from "zod";

const evaluationResponsesSchema = z
  .record(z.string().trim().min(1), z.number().int().min(1).max(5))
  .refine((responses) => Object.keys(responses).length > 0, {
    message: "At least one evaluation criterion must be provided.",
  });

export const createEvaluationSchema = z.object({
  internship_id: z.string().uuid(),

  evaluation_type: z
    .enum(["hte_supervisor", "faculty_adviser"])
    .optional()
    .default("hte_supervisor"),

  responses: evaluationResponsesSchema.optional().default({}),

  comments: z
    .string()
    .trim()
    .max(2000, "Comments must not exceed 2000 characters.")
    .nullable()
    .optional(),
});

export const updateEvaluationSchema = z
  .object({
    responses: evaluationResponsesSchema.optional(),

    comments: z
      .string()
      .trim()
      .max(2000, "Comments must not exceed 2000 characters.")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => data.responses !== undefined || data.comments !== undefined,
    {
      message: "At least one evaluation field must be provided.",
    },
  );

export type CreateEvaluationRequest = z.infer<typeof createEvaluationSchema>;

export type UpdateEvaluationRequest = z.infer<typeof updateEvaluationSchema>;
