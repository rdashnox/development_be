export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "PASSWORD_CHANGE",
  "CREATE_USER",
  "UPDATE_USER",
  "CHANGE_ROLE",
  "DEACTIVATE_USER",
  "CREATE_INTERNSHIP",
  "UPDATE_INTERNSHIP",
  "CHANGE_INTERNSHIP_STATUS",
  "ASSIGN_FACULTY_ADVISER",
  "ASSIGN_HTE_SUPERVISOR",
  "CREATE_ATTENDANCE",
  "UPDATE_ATTENDANCE",
  "VALIDATE_ATTENDANCE",
  "REJECT_ATTENDANCE",
  "CREATE_EVALUATION",
  "UPDATE_EVALUATION",
  "SUBMIT_EVALUATION",
  "UPLOAD_DOCUMENT",
  "APPROVE_DOCUMENT",
  "REJECT_DOCUMENT",
  "DELETE_DOCUMENT",
  "GENERATE_REPORT",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface CreateAuditLogInput {
  userId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  userId?: string;
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface AuditLogPage {
  items: AuditLog[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
