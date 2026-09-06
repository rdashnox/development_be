export const DOCUMENT_TYPES = [
  "endorsement",
  "agreement",
  "resume",
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
