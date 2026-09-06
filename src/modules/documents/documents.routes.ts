import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import type { AppVariables } from "../../types/context.ts";

import { requireAuth } from "../auth/auth.middleware.ts";
import { requireRole } from "../auth/role.middleware.ts";

import { rejectDocumentSchema, uploadDocumentSchema } from "./documents.schema.ts";

import { DocumentService } from "./documents.service.ts";

const documents = new Hono<{
  Variables: AppVariables;
}>();

/**
 * All document endpoints require authentication.
 */
documents.use("*", requireAuth);

/**
 * POST /documents
 *
 * Upload an internship document.
 *
 * Allowed roles:
 * - internship_coordinator
 * - faculty_adviser
 * - student
 * - hte_supervisor
 *
 * Administrators intentionally do not upload documents.
 */
documents.post(
  "/",
  requireRole(
    "internship_coordinator",
    "faculty_adviser",
    "student",
    "hte_supervisor",
  ),
  async (c) => {
    const body = await c.req.parseBody();

    const internshipId = typeof body.internship_id === "string" ? body.internship_id : undefined;

    const documentType = typeof body.document_type === "string" ? body.document_type : undefined;

    const file = body.file;

    if (!(file instanceof File)) {
      return c.json(
        {
          success: false,
          message: "A document file is required.",
        },
        400,
      );
    }

    const validation = uploadDocumentSchema.safeParse({
      internship_id: internshipId,
      document_type: documentType,
    });

    if (!validation.success) {
      return c.json(
        {
          success: false,
          message: "Invalid document upload data.",
          errors: validation.error.flatten(),
        },
        400,
      );
    }

    const user = c.get("user");

    const documentService = new DocumentService(c.get("supabase"));

    const result = await documentService.uploadDocument(
      user.id,
      c.get("userRole"),
      validation.data.internship_id,
      validation.data.document_type,
      file,
    );

    return c.json(
      {
        success: true,
        data: result,
      },
      201,
    );
  },
);

/**
 * GET /documents/internship/:internshipId
 *
 * List documents belonging to an internship.
 *
 * Resource-level authorization is handled by
 * DocumentService.
 */
documents.get(
  "/internship/:internshipId",
  requireRole(
    "administrator",
    "internship_coordinator",
    "faculty_adviser",
    "student",
    "hte_supervisor",
  ),
  async (c) => {
    const internshipId = c.req.param("internshipId");

    if (!internshipId) {
      return c.json(
        {
          success: false,
          message: "Internship ID is required.",
        },
        400,
      );
    }

    const user = c.get("user");

    const documentService = new DocumentService(c.get("supabase"));

    const result = await documentService.listDocuments(
      internshipId,
      user.id,
      c.get("userRole"),
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /documents/:id
 *
 * Retrieve document metadata and a short-lived
 * signed download URL.
 */
documents.get(
  "/:id",
  requireRole(
    "administrator",
    "internship_coordinator",
    "faculty_adviser",
    "student",
    "hte_supervisor",
  ),
  async (c) => {
    const documentId = c.req.param("id");

    if (!documentId) {
      return c.json(
        {
          success: false,
          message: "Document ID is required.",
        },
        400,
      );
    }

    const user = c.get("user");

    const documentService = new DocumentService(c.get("supabase"));

    const result = await documentService.getDocumentDownloadUrl(
      documentId,
      user.id,
      c.get("userRole"),
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * DELETE /documents/:id
 *
 * Delete both the database metadata and the
 * corresponding Storage object.
 *
 * Allowed roles:
 * - administrator
 * - internship_coordinator
 * - student
 *
 * Resource ownership is enforced by DocumentService.
 */
documents.delete(
  "/:id",
  requireRole("administrator", "internship_coordinator", "student"),
  async (c) => {
    const documentId = c.req.param("id");

    if (!documentId) {
      return c.json(
        {
          success: false,
          message: "Document ID is required.",
        },
        400,
      );
    }

    const user = c.get("user");

    const documentService = new DocumentService(c.get("supabase"));

    const result = await documentService.deleteDocument(
      documentId,
      user.id,
      c.get("userRole"),
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * PATCH /documents/:id/approve
 *
 * Approve a pending document.
 *
 * Allowed roles:
 * - administrator
 * - internship_coordinator
 * - faculty_adviser
 * - hte_supervisor
 */
documents.patch(
  "/:id/approve",
  requireRole(
    "administrator",
    "internship_coordinator",
    "faculty_adviser",
    "hte_supervisor",
  ),
  async (c) => {
    const documentId = c.req.param("id");

    if (!documentId) {
      return c.json(
        {
          success: false,
          message: "Document ID is required.",
        },
        400,
      );
    }

    const user = c.get("user");

    const documentService = new DocumentService(c.get("supabase"));

    const result = await documentService.reviewDocument(
      documentId,
      user.id,
      c.get("userRole"),
      "approved",
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

/**
 * PATCH /documents/:id/reject
 *
 * Reject a pending document.
 *
 * Request body:
 * {
 *   "reason": "Document is incomplete."
 * }
 *
 * Allowed roles:
 * - administrator
 * - internship_coordinator
 * - faculty_adviser
 * - hte_supervisor
 */
documents.patch(
  "/:id/reject",
  requireRole(
    "administrator",
    "internship_coordinator",
    "faculty_adviser",
    "hte_supervisor",
  ),
  zValidator("json", rejectDocumentSchema),
  async (c) => {
    const documentId = c.req.param("id");

    if (!documentId) {
      return c.json(
        {
          success: false,
          message: "Document ID is required.",
        },
        400,
      );
    }

    const body = c.req.valid("json");
    const user = c.get("user");

    const documentService = new DocumentService(c.get("supabase"));

    const result = await documentService.reviewDocument(
      documentId,
      user.id,
      c.get("userRole"),
      "rejected",
      body.reason,
    );

    return c.json({
      success: true,
      data: result,
    });
  },
);

export default documents;
