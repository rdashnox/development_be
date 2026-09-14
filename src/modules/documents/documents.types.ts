export const DOCUMENT_TYPES = [
  "signed_internship_agreement",
  "resume",
  "fit_to_work",
  "endorsement",
  "agreement",
  "consent",
  "internship_report",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["pending", "approved", "rejected"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface DocumentRecord {
  id: string;
  internship_id: string;
  document_type: DocumentType;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  status: DocumentStatus;
  uploaded_by: string;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentReviewInput {
  reason?: string;
}

/**
 * Prototype-required internship document types.
 *
 * These are application-level required document types for the
 * prototype. They are intentionally not modeled as a separate
 * document-requirements subsystem.
 */
export const REQUIRED_DOCUMENT_TYPES = [
  "signed_internship_agreement",
  "fit_to_work",
  "consent",
] as const;

export type RequiredDocumentType = (typeof REQUIRED_DOCUMENT_TYPES)[number];
