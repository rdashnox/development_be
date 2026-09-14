import type { SupabaseClients } from "../../lib/supabase.ts";
import { AppError } from "../../errors/app-error.ts";
import { logger } from "../../shared/logger.ts";

import type {
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  CreateAuditLogInput,
} from "./audit.types.ts";

export class AuditService {
  constructor(private readonly clients: SupabaseClients) {}

  /**
   * Records one successful auditable application action.
   * Audit failure is logged but does not roll back a successful
   * business operation.
   */
  async log(input: CreateAuditLogInput): Promise<void> {
    const { error } = await this.clients.supabaseAdmin
      .from("audit_logs")
      .insert({
        user_id: input.userId,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        details: input.details ?? {},
        ip_address: input.ipAddress ?? null,
      });

    if (error) {
      logger.error("AUDIT LOG INSERT FAILED", error);
    }
  }

  async list(filters: AuditLogFilters): Promise<AuditLogPage> {
    const offset = (filters.page - 1) * filters.limit;
    const end = offset + filters.limit - 1;

    let query = this.clients.supabaseAdmin
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, end);

    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.action) query = query.eq("action", filters.action);
    if (filters.resourceType) {
      query = query.eq("resource_type", filters.resourceType);
    }
    if (filters.resourceId) query = query.eq("resource_id", filters.resourceId);
    if (filters.from) query = query.gte("created_at", filters.from);
    if (filters.to) query = query.lte("created_at", filters.to);

    const { data, error, count } = await query;

    if (error) {
      logger.error("LIST AUDIT LOGS FAILED", error);
      throw new AppError(500, "Unable to retrieve audit logs.");
    }

    const total = count ?? 0;

    return {
      items: (data ?? []) as AuditLog[],
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
    };
  }
}
