import type { SupabaseClients } from "../../lib/supabase.ts";

import { AppError } from "../../errors/app-error.ts";

import type {
  AttendanceRecord,
  CreateAttendanceInput,
  UpdateAttendanceRequest,
} from "./attendance.types.ts";

/**
 * Converts HH:MM or HH:MM:SS into minutes from midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

/**
 * Calculates rendered internship hours for one attendance record.
 *
 * Business rule:
 * rendered hours = elapsed time - standard one-hour meal break.
 *
 * Example:
 * 08:00 - 17:00 = 9 elapsed hours - 1 hour break = 8 rendered hours.
 */
function calculateRenderedHours(timeIn: string, timeOut: string): number {
  const start = parseTimeToMinutes(timeIn);
  const end = parseTimeToMinutes(timeOut);

  const elapsedMinutes = end - start;

  if (elapsedMinutes <= 0) {
    throw new AppError(400, "Time-out must be later than time-in.");
  }

  // Standard one-hour meal break.
  const breakMinutes = 60;

  const renderedMinutes = elapsedMinutes - breakMinutes;

  if (renderedMinutes <= 0) {
    throw new AppError(
      400,
      "Attendance duration is too short for the standard one-hour break.",
    );
  }

  return renderedMinutes / 60;
}

/**
 * Minimal internship information required by
 * attendance business rules.
 */
interface InternshipAttendanceRecord {
  id: string;
  student_id: string;
  status: "pending" | "active" | "completed";
  start_date: string | null;
  end_date: string | null;
}

/**
 * Ensures that an attendance date falls within
 * the internship period.
 *
 * Boundaries are inclusive:
 *
 * start_date <= attendance_date <= end_date
 *
 * Legacy internship records may have null dates because
 * the database migration preserves existing records.
 */
function validateAttendanceDate(
  attendanceDate: string,
  internship: InternshipAttendanceRecord,
): void {
  /*
   * New internship records are expected to have a defined
   * internship period.
   *
   * Legacy records may still contain null dates.
   */
  if (!internship.start_date || !internship.end_date) {
    throw new AppError(
      400,
      "Attendance cannot be recorded because the internship period is not defined.",
    );
  }

  /*
   * Inclusive internship period.
   *
   * Attendance is allowed on both the first and last
   * day of the internship.
   */
  if (
    attendanceDate < internship.start_date ||
    attendanceDate > internship.end_date
  ) {
    throw new AppError(
      400,
      "Attendance date must fall within the internship period.",
    );
  }
}

export class AttendanceService {
  constructor(private readonly clients: SupabaseClients) {}

  /**
   * POST /attendance
   *
   * Student creates attendance for their own
   * active internship.
   */
  async createAttendance(
    userId: string,
    input: CreateAttendanceInput,
  ): Promise<AttendanceRecord> {
    const { internship_id, attendance_date, time_in, time_out } = input;

    /*
     * Validate the time range before accessing
     * the database.
     */
    calculateRenderedHours(time_in, time_out);

    /*
     * Verify that the internship exists, belongs to
     * the authenticated student, is active, and has
     * a defined internship period.
     */
    const { data: internship, error: internshipError } = await this.clients.supabaseAdmin
      .from("internships")
      .select(
        `
          id,
          student_id,
          status,
          start_date,
          end_date
        `,
      )
      .eq("id", internship_id)
      .maybeSingle();

    if (internshipError) {
      console.error("VERIFY ATTENDANCE INTERNSHIP FAILED:", internshipError);

      throw new AppError(500, "Failed to verify internship.");
    }

    if (!internship) {
      throw new AppError(404, "Internship not found.");
    }

    /*
     * Ownership check.
     */
    if (internship.student_id !== userId) {
      throw new Error(
        "You can only create attendance for your own internship.",
      );
    }

    /*
     * Attendance may only be recorded while the
     * internship is active.
     */
    if (internship.status !== "active") {
      throw new Error(
        "Attendance can only be created for an active internship.",
      );
    }

    /*
     * Attendance must fall within the internship period.
     */
    validateAttendanceDate(
      attendance_date,
      internship as InternshipAttendanceRecord,
    );

    /*
     * One attendance record per internship per day.
     */
    const { data: existingAttendance, error: existingError } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .select("id")
      .eq("internship_id", internship_id)
      .eq("attendance_date", attendance_date)
      .maybeSingle();

    if (existingError) {
      console.error("CHECK EXISTING ATTENDANCE FAILED:", existingError);

      throw new AppError(500, "Failed to check existing attendance.");
    }

    if (existingAttendance) {
      throw new AppError(409, "Attendance for this date already exists.");
    }

    /*
     * New attendance records start as pending and must
     * subsequently be validated by an internship coordinator.
     */
    const { data, error } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .insert({
        internship_id,
        attendance_date,
        time_in,
        time_out,
        validation_status: "pending",
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("CREATE ATTENDANCE SUPABASE ERROR:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });

      throw new AppError(500, "Failed to create attendance record.");
    }

    return data as AttendanceRecord;
  }

  /**
   * GET /attendance/:id
   *
   * Retrieves a single attendance record.
   */
  async getAttendanceById(attendanceId: string): Promise<AttendanceRecord> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .select("*")
      .eq("id", attendanceId)
      .maybeSingle();

    if (error) {
      console.error("GET ATTENDANCE BY ID FAILED:", error);

      throw new AppError(500, "Failed to retrieve attendance record.");
    }

    if (!data) {
      throw new AppError(404, "Attendance record not found.");
    }

    return data as AttendanceRecord;
  }

  /**
   * GET /attendance/me
   *
   * Student retrieves their own attendance.
   */
  async getMyAttendance(userId: string): Promise<AttendanceRecord[]> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .select(
        `
          *,
          internships!inner (
            student_id
          )
        `,
      )
      .eq("internships.student_id", userId)
      .order("attendance_date", {
        ascending: true,
      });

    if (error) {
      console.error("GET MY ATTENDANCE FAILED:", error);

      throw new AppError(500, "Failed to retrieve attendance records.");
    }

    return (data ?? []).map(
      (
        record: AttendanceRecord & {
          internships?: unknown;
        },
      ) => {
        const { internships: _, ...attendance } = record;

        return attendance;
      },
    );
  }

  /**
   * GET /attendance/internship/:internshipId
   *
   * Retrieves all attendance records for an internship.
   */
  async getAttendanceByInternship(
    internshipId: string,
  ): Promise<AttendanceRecord[]> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .select("*")
      .eq("internship_id", internshipId)
      .order("attendance_date", {
        ascending: true,
      });

    if (error) {
      console.error("GET ATTENDANCE BY INTERNSHIP FAILED:", error);

      throw new AppError(500, "Failed to retrieve attendance records.");
    }

    return (data ?? []) as AttendanceRecord[];
  }

  /**
   * PATCH /attendance/:id/validation
   *
   * Internship coordinator validates or rejects
   * a pending attendance record.
   */
  async validateAttendance(
    attendanceId: string,
    coordinatorId: string,
    status: "validated" | "rejected",
  ): Promise<AttendanceRecord> {
    /*
     * Make sure the attendance record exists.
     */
    const attendance = await this.getAttendanceById(attendanceId);

    /*
     * Only pending records may be validated/rejected.
     */
    if (attendance.validation_status !== "pending") {
      throw new AppError(
        400,
        "Only pending attendance records can be validated.",
      );
    }

    /*
     * Verify that the authenticated user is an active
     * internship coordinator.
     */
    const { data: coordinator, error: coordinatorError } = await this.clients.supabaseAdmin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", coordinatorId)
      .maybeSingle();

    if (coordinatorError) {
      console.error("VERIFY ATTENDANCE COORDINATOR FAILED:", coordinatorError);

      throw new AppError(500, "Failed to verify coordinator.");
    }

    if (
      !coordinator ||
      coordinator.role !== "internship_coordinator" ||
      !coordinator.is_active
    ) {
      throw new AppError(
        403,
        "Only an active internship coordinator can validate attendance.",
      );
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .update({
        validation_status: status,
        validated_by: coordinatorId,
        validated_at: new Date().toISOString(),
      })
      .eq("id", attendanceId)
      .select("*")
      .single();

    if (error || !data) {
      console.error("VALIDATE ATTENDANCE FAILED:", error);

      throw new AppError(500, "Failed to validate attendance.");
    }

    return data as AttendanceRecord;
  }

  /**
   * GET /attendance/internship/:internshipId/rendered-hours
   *
   * Calculates total rendered hours from validated
   * attendance records only.
   *
   * Pending and rejected records do not contribute
   * to rendered internship hours.
   */
  async getRenderedHours(internshipId: string): Promise<number> {
    const records = await this.getAttendanceByInternship(internshipId);

    return records
      .filter((record) => record.validation_status === "validated")
      .reduce((total, record) => {
        return total + calculateRenderedHours(record.time_in, record.time_out);
      }, 0);
  }

  /**
   * PATCH /attendance/:id
   *
   * Student may update their own attendance
   * while it is still pending.
   */
  async updateAttendance(
    attendanceId: string,
    userId: string,
    input: UpdateAttendanceRequest,
  ): Promise<AttendanceRecord> {
    /*
     * Retrieve the existing attendance record.
     */
    const attendance = await this.getAttendanceById(attendanceId);

    /*
     * Only pending records may be changed.
     */
    if (attendance.validation_status !== "pending") {
      throw new AppError(
        400,
        "Only pending attendance records can be updated.",
      );
    }

    /*
     * Retrieve the associated internship including
     * its period.
     */
    const { data: internship, error: internshipError } = await this.clients.supabaseAdmin
      .from("internships")
      .select(
        `
          id,
          student_id,
          status,
          start_date,
          end_date
        `,
      )
      .eq("id", attendance.internship_id)
      .maybeSingle();

    if (internshipError) {
      console.error("VERIFY ATTENDANCE INTERNSHIP FAILED:", internshipError);

      throw new AppError(500, "Failed to verify internship.");
    }

    if (!internship) {
      throw new AppError(404, "Internship not found.");
    }

    /*
     * Ownership check.
     */
    if (internship.student_id !== userId) {
      throw new AppError(403, "You can only update your own attendance.");
    }

    /*
     * Attendance may only be updated while the
     * internship remains active.
     */
    if (internship.status !== "active") {
      throw new AppError(
        400,
        "Attendance can only be updated for an active internship.",
      );
    }

    /*
     * Construct the final values after applying
     * the partial update.
     */
    const attendanceDate = input.attendance_date ?? attendance.attendance_date;

    const timeIn = input.time_in ?? attendance.time_in;

    const timeOut = input.time_out ?? attendance.time_out;

    /*
     * The resulting attendance date must still fall
     * within the internship period.
     */
    validateAttendanceDate(
      attendanceDate,
      internship as InternshipAttendanceRecord,
    );

    /*
     * Validate the resulting time range.
     */
    calculateRenderedHours(timeIn, timeOut);

    /*
     * Prevent changing the attendance date to another
     * date that already has an attendance record.
     */
    const { data: duplicate, error: duplicateError } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .select("id")
      .eq("internship_id", attendance.internship_id)
      .eq("attendance_date", attendanceDate)
      .neq("id", attendanceId)
      .maybeSingle();

    if (duplicateError) {
      console.error("CHECK DUPLICATE ATTENDANCE FAILED:", duplicateError);

      throw new AppError(500, "Failed to check existing attendance.");
    }

    if (duplicate) {
      throw new AppError(409, "Attendance for this date already exists.");
    }

    /*
     * Apply the update.
     */
    const { data, error } = await this.clients.supabaseAdmin
      .from("attendance_records")
      .update({
        attendance_date: attendanceDate,
        time_in: timeIn,
        time_out: timeOut,
      })
      .eq("id", attendanceId)
      .select("*")
      .single();

    if (error || !data) {
      console.error("UPDATE ATTENDANCE FAILED:", error);

      throw new AppError(500, "Failed to update attendance.");
    }

    return data as AttendanceRecord;
  }
}

export { calculateRenderedHours };
