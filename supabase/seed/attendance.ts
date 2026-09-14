import { createSeedAdminClient, normalizeEmail, seedError } from "./_shared/seed-utils.ts";

const supabaseAdmin = createSeedAdminClient();

type AttendanceValidationStatus = "pending" | "validated" | "rejected";

type AttendanceSeedRow = {
  studentEmail: string;
  attendanceDate: string;
  timeIn: string;
  timeOut: string;
  validationStatus: AttendanceValidationStatus;
  validatedByEmail: string | null;
  validatedAt: string | null;
};

type StudentRow = { id: string; email: string };
type InternshipRow = {
  id: string;
  student_id: string;
  start_date: string | null;
  end_date: string | null;
  status: "pending" | "active" | "completed";
};
type CoordinatorRow = { id: string; email: string; is_active: boolean };
type ExistingAttendanceRow = {
  id: string;
  internship_id: string;
  attendance_date: string;
  validation_status: AttendanceValidationStatus;
  validated_by: string | null;
  validated_at: string | null;
};

type AttendanceInsertRow = {
  internship_id: string;
  attendance_date: string;
  time_in: string;
  time_out: string;
  validation_status: AttendanceValidationStatus;
  validated_by: string | null;
  validated_at: string | null;
};

const CSV_URL = new URL("./data/attendance.csv", import.meta.url);
const COORDINATOR_EMAIL = "coordinatorsbims1@grr.la";
const EXPECTED_EVALUATION_READY_STUDENTS = [
  "studentsbims1@grr.la",
  "studentsbims3@grr.la",
  "studentsbims4@grr.la",
] as const;

function parseCsv(text: string): AttendanceSeedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) throw new Error("Attendance CSV is empty.");

  const expectedHeader =
    "student_email,attendance_date,time_in,time_out,validation_status,validated_by_email,validated_at";

  if (lines[0].toLowerCase() !== expectedHeader) {
    throw new Error("Attendance CSV has an invalid header.");
  }

  return lines.slice(1).map((line, index) => {
    const values = line.split(",");
    if (values.length !== 7) {
      throw new Error(
        `Attendance CSV row ${index + 2} must contain 7 columns.`,
      );
    }

    const [
      studentEmail,
      attendanceDate,
      timeIn,
      timeOut,
      validationStatus,
      validatedByEmail,
      validatedAt,
    ] = values.map((value) => value.trim());

    return {
      studentEmail: normalizeEmail(studentEmail),
      attendanceDate,
      timeIn,
      timeOut,
      validationStatus: validationStatus as AttendanceValidationStatus,
      validatedByEmail: validatedByEmail || null,
      validatedAt: validatedAt || null,
    };
  });
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isValidTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function timeToSeconds(value: string): number {
  const [hours, minutes, seconds = "00"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function parseCsvValidation(rows: AttendanceSeedRow[]): void {
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;

    if (!row.studentEmail) {
      throw new Error(`CSV row ${rowNumber}: student_email is required.`);
    }
    if (!isValidDate(row.attendanceDate)) {
      throw new Error(`CSV row ${rowNumber}: invalid attendance_date.`);
    }
    if (!isValidTime(row.timeIn) || !isValidTime(row.timeOut)) {
      throw new Error(`CSV row ${rowNumber}: invalid time_in/time_out.`);
    }
    if (timeToSeconds(row.timeOut) <= timeToSeconds(row.timeIn)) {
      throw new Error(
        `CSV row ${rowNumber}: time_out must be later than time_in.`,
      );
    }
    if (
      !(["pending", "validated", "rejected"] as string[]).includes(
        row.validationStatus,
      )
    ) {
      throw new Error(`CSV row ${rowNumber}: invalid validation_status.`);
    }

    if (row.validationStatus === "pending") {
      if (row.validatedByEmail || row.validatedAt) {
        throw new Error(
          `CSV row ${rowNumber}: pending attendance cannot be validated.`,
        );
      }
    } else if (!row.validatedByEmail || !row.validatedAt) {
      throw new Error(
        `CSV row ${rowNumber}: validated/rejected attendance requires validator data.`,
      );
    }

    const key = `${row.studentEmail}:${row.attendanceDate}`;
    if (seen.has(key)) throw new Error(`Duplicate attendance date: ${key}`);
    seen.add(key);
  }
}

async function loadSeedRows(): Promise<AttendanceSeedRow[]> {
  const csv = await Deno.readTextFile(CSV_URL);
  const rows = parseCsv(csv);
  parseCsvValidation(rows);
  return rows;
}

async function resolveStudents(
  emails: string[],
): Promise<Map<string, StudentRow>> {
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id, profiles!inner(email)")
    .in("profiles.email", emails);

  if (error) throw seedError("attendance.resolve-students", error);

  const result = new Map<string, StudentRow>();
  for (const row of data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (profile?.email) {
      result.set(normalizeEmail(profile.email), {
        id: row.id,
        email: normalizeEmail(profile.email),
      });
    }
  }

  for (const email of emails) {
    if (!result.has(email)) {
      throw new Error(`Student profile not found: ${email}`);
    }
  }

  return result;
}

async function resolveInternships(
  studentIds: string[],
): Promise<Map<string, InternshipRow>> {
  const { data, error } = await supabaseAdmin
    .from("internships")
    .select("id, student_id, start_date, end_date, status, created_at")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });

  if (error) throw seedError("attendance.resolve-internships", error);

  const result = new Map<string, InternshipRow>();

  for (const row of data ?? []) {
    const current = result.get(row.student_id);
    if (!current) {
      result.set(row.student_id, row as InternshipRow);
    }
  }

  for (const studentId of studentIds) {
    const internship = result.get(studentId);
    if (!internship) {
      throw new Error(`Internship not found for student: ${studentId}`);
    }
    if (!internship.start_date || !internship.end_date) {
      throw new Error(
        `Internship ${internship.id} has no valid internship period.`,
      );
    }
    if (internship.status !== "active" && internship.status !== "completed") {
      throw new Error(
        `Internship ${internship.id} is ${internship.status} and cannot receive attendance.`,
      );
    }
  }

  return result;
}

async function resolveCoordinator(): Promise<CoordinatorRow> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_active")
    .eq("email", COORDINATOR_EMAIL)
    .eq("role", "internship_coordinator")
    .maybeSingle();

  if (error) throw seedError("attendance.resolve-coordinator", error);
  if (!data) {
    throw new Error(
      `Internship coordinator profile not found: ${COORDINATOR_EMAIL}`,
    );
  }
  if (!data.is_active) {
    throw new Error(`Internship coordinator ${COORDINATOR_EMAIL} is inactive.`);
  }

  return data as CoordinatorRow;
}

async function loadExistingAttendance(
  internshipIds: string[],
): Promise<Map<string, ExistingAttendanceRow>> {
  const { data, error } = await supabaseAdmin
    .from("attendance_records")
    .select(
      "id, internship_id, attendance_date, validation_status, validated_by, validated_at",
    )
    .in("internship_id", internshipIds);

  if (error) throw seedError("attendance.load-existing", error);

  const result = new Map<string, ExistingAttendanceRow>();
  for (const row of data ?? []) {
    result.set(
      `${row.internship_id}:${row.attendance_date}`,
      row as ExistingAttendanceRow,
    );
  }
  return result;
}

function buildInsertRows(
  seeds: AttendanceSeedRow[],
  students: Map<string, StudentRow>,
  internships: Map<string, InternshipRow>,
  coordinator: CoordinatorRow,
  existing: Map<string, ExistingAttendanceRow>,
): AttendanceInsertRow[] {
  return seeds.map((seed) => {
    const student = students.get(seed.studentEmail)!;
    const internship = internships.get(student.id)!;

    if (
      seed.attendanceDate < internship.start_date! ||
      seed.attendanceDate > internship.end_date!
    ) {
      throw new Error(
        `Attendance date ${seed.attendanceDate} for ${seed.studentEmail} ` +
          `is outside internship period ${internship.start_date}..${internship.end_date}.`,
      );
    }

    const key = `${internship.id}:${seed.attendanceDate}`;
    const previous = existing.get(key);

    return {
      internship_id: internship.id,
      attendance_date: seed.attendanceDate,
      time_in: seed.timeIn,
      time_out: seed.timeOut,
      // Preserve an existing lifecycle state on rerun, matching the previous
      // seed behavior. Seed data never silently resets validated/rejected rows.
      validation_status: previous?.validation_status ?? seed.validationStatus,
      validated_by: previous?.validated_by ??
        (seed.validatedByEmail ? coordinator.id : null),
      validated_at: previous?.validated_at ?? seed.validatedAt,
    };
  });
}

function assertEvaluationReadyAttendance(
  seeds: AttendanceSeedRow[],
  students: Map<string, StudentRow>,
  internships: Map<string, InternshipRow>,
): void {
  for (const email of EXPECTED_EVALUATION_READY_STUDENTS) {
    const student = students.get(email);
    if (!student) {
      throw new Error(`Evaluation-ready student was not resolved: ${email}`);
    }

    const internship = internships.get(student.id);
    if (!internship) {
      throw new Error(`Evaluation-ready internship missing: ${email}`);
    }

    const validatedRows = seeds.filter(
      (row) => row.studentEmail === email && row.validationStatus === "validated",
    );

    const renderedHours = validatedRows.reduce((total, row) => {
      const elapsedHours = (timeToSeconds(row.timeOut) - timeToSeconds(row.timeIn)) / 3600;
      return total + Math.max(0, elapsedHours - 1);
    }, 0);

    if (renderedHours !== 150) {
      throw new Error(
        `Evaluation-ready student ${email} must have exactly 150 seeded validated rendered hours; received ${renderedHours}.`,
      );
    }

    if (internship.status !== "completed") {
      throw new Error(
        `Evaluation-ready internship for ${email} must be completed.`,
      );
    }
  }
}

async function seed(): Promise<void> {
  const seeds = await loadSeedRows();
  const emails = [...new Set(seeds.map((row) => row.studentEmail))];
  const students = await resolveStudents(emails);
  const internships = await resolveInternships(
    [...students.values()].map((row) => row.id),
  );
  const coordinator = await resolveCoordinator();
  const existing = await loadExistingAttendance(
    [...internships.values()].map((row) => row.id),
  );

  assertEvaluationReadyAttendance(seeds, students, internships);

  const rows = buildInsertRows(
    seeds,
    students,
    internships,
    coordinator,
    existing,
  );

  const { error } = await supabaseAdmin
    .from("attendance_records")
    .upsert(rows, { onConflict: "internship_id,attendance_date" });

  if (error) throw seedError("attendance.bulk-upsert", error);

  const createdOrReconciled = rows.length;
  const readyCount = EXPECTED_EVALUATION_READY_STUDENTS.length;

  console.log("========================================");
  console.log("SBIMS Development Attendance Seed");
  console.log("========================================");
  console.log(`Rows upserted:       ${createdOrReconciled}`);
  console.log(`Students covered:    ${emails.length}`);
  console.log(`Evaluation-ready:    ${readyCount}`);
  console.log("Validated hours:     150 each for the 3 ready interns");
  console.log(
    "Near-completion:     136 validated hours for the 7 active interns",
  );
  console.log("Historical OJT:      300 validated hours");
  console.log("Attendance seeding completed successfully.");
}

if (import.meta.main) {
  await seed();
}
