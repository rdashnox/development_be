import type { SupabaseClients } from "../../lib/supabase.ts";
import { AppError } from "../../errors/app-error.ts";

import type { DocumentRecord, DocumentStatus, DocumentType } from "./documents.types.ts";

const STORAGE_BUCKET = "internship-documents";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type DocumentAccessRole =
  | "administrator"
  | "internship_coordinator"
  | "faculty_adviser"
  | "student"
  | "hte_supervisor";

interface InternshipAuthorizationRecord {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  hte_profiles: {
    supervisor_id: string | null;
  } | null;
}

export class DocumentService {
  constructor(private readonly clients: SupabaseClients) {}

  private validateFile(file: File): void {
    if (!(file instanceof File)) {
      throw new AppError(400, "A document file is required.");
    }

    if (file.size <= 0) {
      throw new AppError(400, "The uploaded file is empty.");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(400, "The uploaded file must not exceed 10 MiB.");
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new AppError(
        400,
        "Unsupported file type. Allowed types are PDF, DOC, DOCX, JPEG, and PNG.",
      );
    }

    if (!file.name.trim()) {
      throw new AppError(400, "The uploaded file must have a filename.");
    }

    if (file.name.length > 255) {
      throw new AppError(400, "Filename must not exceed 255 characters.");
    }
  }

  private sanitizeFilename(filename: string): string {
    const lastSegment = filename.split(/[/\\]/).pop() ?? "document";

    const sanitized = lastSegment
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");

    return sanitized.slice(0, 200) || "document";
  }

  private async getInternship(
    internshipId: string,
  ): Promise<InternshipAuthorizationRecord> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(
        `
        id,
        student_id,
        hte_id,
        faculty_adviser_id,
        hte_profiles (
          supervisor_id
        )
        `,
      )
      .eq("id", internshipId)
      .maybeSingle();

    if (error) {
      console.error("GET DOCUMENT INTERNSHIP FAILED:", error);
      throw new AppError(500, "Failed to verify internship.");
    }

    if (!data) {
      throw new AppError(404, "Internship not found.");
    }

    return data as unknown as InternshipAuthorizationRecord;
  }

  private async authorizeInternshipAccess(
    internshipId: string,
    userId: string,
    role: DocumentAccessRole,
    operation: "view" | "upload" | "delete" | "review",
  ): Promise<InternshipAuthorizationRecord> {
    const internship = await this.getInternship(internshipId);

    if (role === "administrator" || role === "internship_coordinator") {
      if (operation === "upload" && role === "administrator") {
        throw new AppError(
          403,
          "Administrators cannot upload internship documents.",
        );
      }

      return internship;
    }

    if (role === "student") {
      if (internship.student_id !== userId) {
        throw new AppError(403, "You do not have access to this internship.");
      }

      if (operation === "review") {
        throw new AppError(403, "Students cannot review documents.");
      }

      return internship;
    }

    if (role === "faculty_adviser") {
      if (internship.faculty_adviser_id !== userId) {
        throw new AppError(403, "You are not assigned to this internship.");
      }

      if (operation === "delete") {
        throw new AppError(403, "Faculty advisers cannot delete documents.");
      }

      return internship;
    }

    if (role === "hte_supervisor") {
      if (internship.hte_profiles?.supervisor_id !== userId) {
        throw new AppError(403, "You are not assigned to this internship.");
      }

      if (operation === "delete") {
        throw new AppError(403, "HTE supervisors cannot delete documents.");
      }

      return internship;
    }

    throw new AppError(403, "Insufficient permissions.");
  }

  private async getDocumentById(documentId: string): Promise<DocumentRecord> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (error) {
      console.error("GET DOCUMENT FAILED:", error);
      throw new AppError(500, "Failed to retrieve document.");
    }

    if (!data) {
      throw new AppError(404, "Document not found.");
    }

    return data as DocumentRecord;
  }

  async uploadDocument(
    userId: string,
    role: DocumentAccessRole,
    internshipId: string,
    documentType: DocumentType,
    file: File,
  ): Promise<DocumentRecord> {
    this.validateFile(file);

    await this.authorizeInternshipAccess(internshipId, userId, role, "upload");

    const { data: existing, error: existingError } = await this.clients.supabaseAdmin
      .from("documents")
      .select("*")
      .eq("internship_id", internshipId)
      .eq("document_type", documentType)
      .maybeSingle();

    if (existingError) {
      console.error("CHECK EXISTING DOCUMENT FAILED:", existingError);
      throw new AppError(500, "Failed to check existing document.");
    }

    if (existing && existing.status !== "rejected") {
      throw new AppError(
        409,
        "A document of this type already exists for this internship.",
      );
    }

    const documentId = existing?.id ?? crypto.randomUUID();
    const filename = this.sanitizeFilename(file.name);
    const storagePath = `${internshipId}/${documentId}-${filename}`;

    const { error: uploadError } = await this.clients.supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("UPLOAD DOCUMENT FAILED:", uploadError);
      throw new AppError(500, "Failed to upload document.");
    }

    if (existing) {
      const oldStoragePath = existing.storage_path;

      const { data, error } = await this.clients.supabaseAdmin
        .from("documents")
        .update({
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          status: "pending",
          uploaded_by: userId,
          uploaded_at: new Date().toISOString(),
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error || !data) {
        await this.clients.supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .remove([storagePath]);

        console.error("REPLACE DOCUMENT FAILED:", error);
        throw new AppError(500, "Failed to update document metadata.");
      }

      if (oldStoragePath !== storagePath) {
        const { error: removeError } = await this.clients.supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .remove([oldStoragePath]);

        if (removeError) {
          console.error("REMOVE OLD DOCUMENT FAILED:", removeError);
        }
      }

      return data as DocumentRecord;
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("documents")
      .insert({
        id: documentId,
        internship_id: internshipId,
        document_type: documentType,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        status: "pending",
        uploaded_by: userId,
      })
      .select("*")
      .single();

    if (error || !data) {
      await this.clients.supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

      console.error("CREATE DOCUMENT FAILED:", error);
      throw new AppError(500, "Failed to save document metadata.");
    }

    return data as DocumentRecord;
  }

  async listDocuments(
    internshipId: string,
    userId: string,
    role: DocumentAccessRole,
  ): Promise<DocumentRecord[]> {
    await this.authorizeInternshipAccess(internshipId, userId, role, "view");

    const { data, error } = await this.clients.supabaseAdmin
      .from("documents")
      .select("*")
      .eq("internship_id", internshipId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("LIST DOCUMENTS FAILED:", error);
      throw new AppError(500, "Failed to retrieve documents.");
    }

    return (data ?? []) as DocumentRecord[];
  }

  async getDocument(
    documentId: string,
    userId: string,
    role: DocumentAccessRole,
  ): Promise<DocumentRecord> {
    const document = await this.getDocumentById(documentId);

    await this.authorizeInternshipAccess(
      document.internship_id,
      userId,
      role,
      "view",
    );

    return document;
  }

  async getDocumentDownloadUrl(
    documentId: string,
    userId: string,
    role: DocumentAccessRole,
  ): Promise<{ document: DocumentRecord; url: string }> {
    const document = await this.getDocument(documentId, userId, role);

    const { data, error } = await this.clients.supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(document.storage_path, 300);

    if (error || !data?.signedUrl) {
      console.error("CREATE DOCUMENT SIGNED URL FAILED:", error);
      throw new AppError(500, "Failed to generate document download URL.");
    }

    return {
      document,
      url: data.signedUrl,
    };
  }

  async deleteDocument(
    documentId: string,
    userId: string,
    role: DocumentAccessRole,
  ): Promise<void> {
    const document = await this.getDocumentById(documentId);

    await this.authorizeInternshipAccess(
      document.internship_id,
      userId,
      role,
      "delete",
    );

    const { error: storageError } = await this.clients.supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove([document.storage_path]);

    if (storageError) {
      console.error("DELETE DOCUMENT STORAGE FAILED:", storageError);
      throw new AppError(500, "Failed to delete document file.");
    }

    const { error: databaseError } = await this.clients.supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (databaseError) {
      console.error("DELETE DOCUMENT DATABASE FAILED:", databaseError);
      throw new AppError(
        500,
        "Document file was removed, but metadata deletion failed.",
      );
    }
  }

  async reviewDocument(
    documentId: string,
    userId: string,
    role: DocumentAccessRole,
    status: Extract<DocumentStatus, "approved" | "rejected">,
    reason?: string,
  ): Promise<DocumentRecord> {
    const document = await this.getDocumentById(documentId);

    await this.authorizeInternshipAccess(
      document.internship_id,
      userId,
      role,
      "review",
    );

    if (document.status !== "pending") {
      throw new AppError(400, "Only pending documents can be reviewed.");
    }

    if (status === "rejected" && !reason?.trim()) {
      throw new AppError(400, "A rejection reason is required.");
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("documents")
      .update({
        status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: status === "rejected" ? reason?.trim() : null,
      })
      .eq("id", documentId)
      .eq("status", "pending")
      .select("*")
      .single();

    if (error || !data) {
      console.error("REVIEW DOCUMENT FAILED:", error);
      throw new AppError(500, "Failed to update document review status.");
    }

    return data as DocumentRecord;
  }
}
