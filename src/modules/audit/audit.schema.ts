import { z } from "zod";

import { AUDIT_ACTIONS } from "./audit.types.ts";

export const auditLogQuerySchema = z
  .object({
    userId: z.string().uuid().optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    resourceType: z.string().trim().min(1).max(100).optional(),
    resourceId: z.string().trim().min(1).max(100).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The 'from' date must not be later than the 'to' date.",
    path: ["from"],
  });
