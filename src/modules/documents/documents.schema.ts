import { z } from "zod";

import { DOCUMENT_TYPES } from "./documents.types.ts";

export const uploadDocumentSchema = z.object({
  internship_id: z.string().uuid(),
  document_type: z.enum(DOCUMENT_TYPES),
});

export const rejectDocumentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Rejection reason is required.")
    .max(1000, "Rejection reason must not exceed 1000 characters."),
});

export type UploadDocumentRequest = z.infer<typeof uploadDocumentSchema>;
export type RejectDocumentRequest = z.infer<typeof rejectDocumentSchema>;
