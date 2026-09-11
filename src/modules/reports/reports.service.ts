import type { SupabaseClients } from "../../lib/supabase.ts";
import { AppError } from "../../errors/app-error.ts";

import { calculateRenderedHours } from "../attendance/attendance.service.ts";

import type { InternshipReportQuery } from "./reports.schema.ts";
import type {
  InternshipReportRow,
  InternshipReportStatus,
  InternshipReportSummary,
} from "./reports.types.ts";

const REPORT_SELECT = `
  id,
  student_id,
  hte_id,
  faculty_adviser_id,
  required_hours,
  status,
  student_profiles (
    id,
    student_number,
    program,
    year_level,
    section,
    profiles (
      first_name,
      middle_name,
      last_name,
      suffix
    )
  ),
  hte_profiles (
    id,
    company_name
  ),
  attendance_records (
    time_in,
    time_out,
    validation_status
  ),
  evaluations (
    status
  )
`;

interface ReportAttendanceRecord {
  time_in: string;
  time_out: string;
  validation_status: "pending" | "validated" | "rejected";
}

interface ReportEvaluationRecord {
  status: "draft" | "submitted";
}

interface ReportStudentProfile {
  id: string;
  student_number: string;
  program: string;
  year_level: number;
  section: string | null;
  profiles: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
  } | null;
}

interface ReportHteProfile {
  id: string;
  company_name: string;
}

interface ReportInternshipRecord {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  required_hours: number | null;
  status: InternshipReportStatus;

  student_profiles: ReportStudentProfile | null;
  hte_profiles: ReportHteProfile | null;
  attendance_records: ReportAttendanceRecord[] | null;
  evaluations: ReportEvaluationRecord[] | null;
}

export class ReportsService {
  constructor(private readonly clients: SupabaseClients) {}

  async getInternshipReport(
    filters: InternshipReportQuery,
  ): Promise<InternshipReportRow[]> {
    const records = await this.getInternshipRecords(filters);

    return records.map((internship) => this.mapReportRow(internship));
  }

  async getInternshipReportSummary(
    filters: InternshipReportQuery,
  ): Promise<InternshipReportSummary> {
    const records = await this.getInternshipRecords(filters);

    const summary: InternshipReportSummary = {
      totalInternships: records.length,
      pending: 0,
      active: 0,
      completed: 0,
      totalRequiredHours: 0,
      totalRenderedHours: 0,
      totalRemainingHours: 0,
    };

    for (const internship of records) {
      summary[internship.status] += 1;

      const renderedHours = this.calculateValidatedRenderedHours(
        internship.attendance_records,
      );

      summary.totalRenderedHours += renderedHours;

      if (internship.required_hours !== null) {
        summary.totalRequiredHours += internship.required_hours;
        summary.totalRemainingHours += Math.max(
          internship.required_hours - renderedHours,
          0,
        );
      }
    }

    summary.totalRequiredHours = this.roundHours(summary.totalRequiredHours);

    summary.totalRenderedHours = this.roundHours(summary.totalRenderedHours);

    summary.totalRemainingHours = this.roundHours(summary.totalRemainingHours);

    return summary;
  }

  private async getInternshipRecords(
    filters: InternshipReportQuery,
  ): Promise<ReportInternshipRecord[]> {
    let query = this.clients.supabaseAdmin
      .from("internships")
      .select(REPORT_SELECT)
      .order("created_at", {
        ascending: false,
      });

    if (filters.status !== undefined) {
      query = query.eq("status", filters.status);
    }

    if (filters.program !== undefined) {
      query = query.eq("student_profiles.program", filters.program);
    }

    if (filters.hte_id !== undefined) {
      query = query.eq("hte_id", filters.hte_id);
    }

    if (filters.faculty_adviser_id !== undefined) {
      query = query.eq("faculty_adviser_id", filters.faculty_adviser_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET INTERNSHIP REPORT FAILED:", error);

      throw new AppError(500, "Unable to retrieve the internship report.");
    }

    return (data ?? []) as unknown as ReportInternshipRecord[];
  }

  private mapReportRow(
    internship: ReportInternshipRecord,
  ): InternshipReportRow {
    const studentProfile = internship.student_profiles;
    const studentUser = studentProfile?.profiles ?? null;

    const renderedHours = this.calculateValidatedRenderedHours(
      internship.attendance_records,
    );

    const remainingHours = internship.required_hours === null
      ? null
      : Math.max(internship.required_hours - renderedHours, 0);

    const evaluationStatus = internship.evaluations && internship.evaluations.length > 0
      ? this.getEvaluationStatus(internship.evaluations)
      : null;

    return {
      internshipId: internship.id,

      student: {
        id: internship.student_id,
        studentNumber: studentProfile?.student_number ?? "",
        program: studentProfile?.program ?? "",
        yearLevel: studentProfile?.year_level ?? 0,
        section: studentProfile?.section ?? null,
        name: this.buildStudentName(studentUser),
      },

      hte: internship.hte_profiles
        ? {
          id: internship.hte_profiles.id,
          companyName: internship.hte_profiles.company_name,
        }
        : null,

      facultyAdviserId: internship.faculty_adviser_id,

      status: internship.status,

      requiredHours: internship.required_hours,
      renderedHours,
      remainingHours,

      evaluationStatus,
    };
  }

  private calculateValidatedRenderedHours(
    records: ReportAttendanceRecord[] | null,
  ): number {
    if (!records || records.length === 0) {
      return 0;
    }

    const total = records
      .filter((record) => record.validation_status === "validated")
      .reduce((sum, record) => {
        return sum + calculateRenderedHours(record.time_in, record.time_out);
      }, 0);

    return this.roundHours(total);
  }

  private getEvaluationStatus(
    evaluations: ReportEvaluationRecord[],
  ): "draft" | "submitted" {
    const submittedEvaluation = evaluations.find(
      (evaluation) => evaluation.status === "submitted",
    );

    if (submittedEvaluation) {
      return "submitted";
    }

    return "draft";
  }

  private buildStudentName(
    profile: {
      first_name: string;
      middle_name: string | null;
      last_name: string;
      suffix: string | null;
    } | null,
  ): string | null {
    if (!profile) {
      return null;
    }

    const parts = [
      profile.first_name,
      profile.middle_name,
      profile.last_name,
      profile.suffix,
    ].filter((part): part is string => Boolean(part?.trim()));

    return parts.join(" ");
  }

  private roundHours(hours: number): number {
    return Math.round(hours * 100) / 100;
  }
}
