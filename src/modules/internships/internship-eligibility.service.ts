import type { SupabaseClients } from "../../lib/supabase.ts";
import { AppError } from "../../errors/app-error.ts";

import { calculateRenderedHours } from "../attendance/attendance.service.ts";

export interface InternshipEligibility {
  eligible: boolean;
  reason:
    | "eligible"
    | "internship_not_found"
    | "internship_period_not_ended"
    | "required_hours_not_set"
    | "required_hours_not_met";
  renderedHours: number;
  requiredHours: number | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Returns the current calendar date in the application's
 * Philippine operating timezone.
 *
 * The internship system is intended for Philippine academic
 * operations, so lifecycle decisions should not depend on
 * the serverless runtime's UTC date near midnight.
 */
function getCurrentDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export class InternshipEligibilityService {
  constructor(private readonly clients: SupabaseClients) {}

  /**
   * Determines whether an internship has satisfied the conditions
   * required for final completion/evaluation:
   *
   * 1. The internship must exist.
   * 2. The internship period must have ended.
   * 3. Required hours must be configured.
   * 4. Validated rendered hours must meet or exceed required hours.
   *
   * Attendance records with pending or rejected validation are ignored.
   */
  async checkFinalEligibility(
    internshipId: string,
  ): Promise<InternshipEligibility> {
    const { data: internship, error: internshipError } = await this.clients.supabaseAdmin
      .from("internships")
      .select("id, start_date, end_date, required_hours")
      .eq("id", internshipId)
      .maybeSingle();

    if (internshipError) {
      throw new AppError(
        500,
        "Unable to verify internship completion eligibility.",
      );
    }

    if (!internship) {
      return {
        eligible: false,
        reason: "internship_not_found",
        renderedHours: 0,
        requiredHours: null,
        startDate: null,
        endDate: null,
      };
    }

    const startDate = internship.start_date as string | null;
    const endDate = internship.end_date as string | null;
    const requiredHours = internship.required_hours as number | null;

    /*
     * Legacy internship records may have null dates because the
     * database migration intentionally preserves existing rows.
     *
     * Such records cannot satisfy the new completion/evaluation
     * eligibility rule until their internship period is defined.
     */
    if (!endDate || getCurrentDate() <= endDate) {
      return {
        eligible: false,
        reason: "internship_period_not_ended",
        renderedHours: await this.getRenderedHours(internshipId),
        requiredHours,
        startDate,
        endDate,
      };
    }

    if (requiredHours === null) {
      return {
        eligible: false,
        reason: "required_hours_not_set",
        renderedHours: await this.getRenderedHours(internshipId),
        requiredHours,
        startDate,
        endDate,
      };
    }

    const renderedHours = await this.getRenderedHours(internshipId);

    if (renderedHours < requiredHours) {
      return {
        eligible: false,
        reason: "required_hours_not_met",
        renderedHours,
        requiredHours,
        startDate,
        endDate,
      };
    }

    return {
      eligible: true,
      reason: "eligible",
      renderedHours,
      requiredHours,
      startDate,
      endDate,
    };
  }

  /**
   * Calculates total rendered hours from validated attendance records.
   *
   * The existing attendance rule is reused:
   * elapsed time minus the standard one-hour meal break.
   */
  private async getRenderedHours(internshipId: string): Promise<number> {
    const { data: attendanceRecords, error } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .select("time_in, time_out")
      .eq("internship_id", internshipId)
      .eq("validation_status", "validated");

    if (error) {
      throw new AppError(500, "Unable to calculate internship rendered hours.");
    }

    return (attendanceRecords ?? []).reduce((total, record) => {
      return (
        total +
        calculateRenderedHours(
          record.time_in as string,
          record.time_out as string,
        )
      );
    }, 0);
  }
}
