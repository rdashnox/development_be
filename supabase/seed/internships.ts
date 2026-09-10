// supabase/seed/internships.ts

import { createSeedAdminClient, normalizeEmail, seedError } from "./_shared/seed-utils.ts";

const supabaseAdmin = createSeedAdminClient();

type InternshipStatus = "pending" | "active" | "completed";

interface SeedInternship {
  seedKey: string;
  studentEmail: string;
  hteCompanyName: string;
  facultyAdviserEmail: string;
  requiredHours: number;
  status: InternshipStatus;
}

interface StudentRow {
  id: string;
  email: string;
  program: string;
}

interface HteRow {
  id: string;
  company_name: string;
  is_active: boolean;
}

interface FacultyAdviserRow {
  id: string;
  email: string;
  role: "faculty_adviser";
  is_active: boolean;
}

interface InternshipRow {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  required_hours: number | null;
  status: InternshipStatus;
}

const PROGRAM_HOURS: Readonly<Record<string, number>> = {
  "Bachelor of Science in Computer Science": 300,
  "Bachelor of Science in Computer Engineering": 350,
  "Bachelor of Science in Information Technology": 300,
};

/*
 * Development-only synthetic internship assignments.
 *
 * The same degree program always receives the same required hours.
 *
 * Student 01 - CS      - active
 * Student 03 - CpE     - active
 * Student 04 - IT      - active
 * Student 05 - IT      - completed
 * Student 06 - CS      - pending
 *
 * This intentionally demonstrates:
 * - active internships
 * - a pending internship
 * - a completed historical internship
 * - multiple students from the same program sharing the same hours
 */
const seedInternships: readonly SeedInternship[] = [
  {
    seedKey: "internship-01",
    studentEmail: "studentsbims1@grr.la",
    hteCompanyName: "ABC Computing Solutions, Inc.",
    facultyAdviserEmail: "facultysbims1@grr.la",
    requiredHours: 300,
    status: "active",
  },
  {
    seedKey: "internship-02",
    studentEmail: "studentsbims3@grr.la",
    hteCompanyName: "DEF Engineering Corporation",
    facultyAdviserEmail: "facultysbims2@grr.la",
    requiredHours: 350,
    status: "active",
  },
  {
    seedKey: "internship-03",
    studentEmail: "studentsbims4@grr.la",
    hteCompanyName: "GHI Applied Technologies, Inc.",
    facultyAdviserEmail: "facultysbims3@grr.la",
    requiredHours: 300,
    status: "active",
  },
  {
    seedKey: "internship-04",
    studentEmail: "studentsbims5@grr.la",
    hteCompanyName: "ABC Computing Solutions, Inc.",
    facultyAdviserEmail: "facultysbims1@grr.la",
    requiredHours: 300,
    status: "completed",
  },
  {
    seedKey: "internship-05",
    studentEmail: "studentsbims6@grr.la",
    hteCompanyName: "GHI Applied Technologies, Inc.",
    facultyAdviserEmail: "facultysbims3@grr.la",
    requiredHours: 300,
    status: "pending",
  },
];

const INTERNSHIP_SELECT = `
  id,
  student_id,
  hte_id,
  faculty_adviser_id,
  required_hours,
  status
`;

async function findStudentByEmail(email: string): Promise<StudentRow | null> {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select(
      `
      id,
      program,
      profiles!inner (
        email
      )
    `,
    )
    .eq("profiles.email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw seedError(`internships.find-student:${normalizedEmail}`, error);
  }

  if (!data) {
    return null;
  }

  const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

  if (!profile) {
    return null;
  }

  return {
    id: data.id,
    email: normalizeEmail(profile.email),
    program: data.program,
  };
}

async function findHteByCompanyName(
  companyName: string,
): Promise<HteRow | null> {
  const { data, error } = await supabaseAdmin
    .from("hte_profiles")
    .select("id, company_name, is_active")
    .eq("company_name", companyName)
    .maybeSingle();

  if (error) {
    throw seedError(`internships.find-hte:${companyName}`, error);
  }

  return data as HteRow | null;
}

async function findFacultyAdviserByEmail(
  email: string,
): Promise<FacultyAdviserRow | null> {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("email", normalizedEmail)
    .eq("role", "faculty_adviser")
    .maybeSingle();

  if (error) {
    throw seedError(`internships.find-adviser:${normalizedEmail}`, error);
  }

  return data as FacultyAdviserRow | null;
}

async function resolveStudent(email: string): Promise<StudentRow> {
  const student = await findStudentByEmail(email);

  if (!student) {
    throw new Error(`Student profile not found: ${normalizeEmail(email)}`);
  }

  return student;
}

async function resolveHte(companyName: string): Promise<HteRow> {
  const hte = await findHteByCompanyName(companyName);

  if (!hte) {
    throw new Error(`HTE not found: ${companyName}`);
  }

  if (!hte.is_active) {
    throw new Error(`HTE ${companyName} is inactive and cannot be assigned.`);
  }

  return hte;
}

async function resolveFacultyAdviser(
  email: string,
): Promise<FacultyAdviserRow> {
  const adviser = await findFacultyAdviserByEmail(email);

  if (!adviser) {
    throw new Error(
      `Faculty adviser profile not found: ${normalizeEmail(email)}`,
    );
  }

  if (!adviser.is_active) {
    throw new Error(
      `Faculty adviser ${normalizeEmail(email)} is inactive and cannot be assigned.`,
    );
  }

  return adviser;
}

async function findExistingInternshipForStudent(
  studentId: string,
): Promise<InternshipRow | null> {
  const { data, error } = await supabaseAdmin
    .from("internships")
    .select(INTERNSHIP_SELECT)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw seedError(`internships.find-student-history:${studentId}`, error);
  }

  return data as InternshipRow | null;
}

async function createInternship(
  seed: SeedInternship,
  student: StudentRow,
  hte: HteRow,
  adviser: FacultyAdviserRow,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("internships")
    .insert({
      student_id: student.id,
      hte_id: hte.id,
      faculty_adviser_id: adviser.id,
      required_hours: seed.requiredHours,
      status: seed.status,
    })
    .select(INTERNSHIP_SELECT)
    .single();

  if (error || !data) {
    throw seedError(`internships.create:${seed.seedKey}`, error);
  }

  console.log(
    `  ✓ Created internship ${data.id} ` +
      `(student=${student.email}, ` +
      `hte=${hte.company_name}, ` +
      `adviser=${adviser.email}, ` +
      `hours=${seed.requiredHours}, ` +
      `status=${seed.status})`,
  );
}

async function reconcileInternship(
  seed: SeedInternship,
  existing: InternshipRow,
  hte: HteRow,
  adviser: FacultyAdviserRow,
): Promise<void> {
  /*
   * Do not change lifecycle state during reconciliation.
   *
   * Status represents real internship history. A completed record
   * must not be turned back into active simply because the seed says
   * "active".
   */
  const { error } = await supabaseAdmin
    .from("internships")
    .update({
      hte_id: hte.id,
      faculty_adviser_id: adviser.id,
      required_hours: seed.requiredHours,
    })
    .eq("id", existing.id);

  if (error) {
    throw seedError(`internships.reconcile:${seed.seedKey}`, error);
  }

  console.log(
    `  ✓ Reconciled internship ${existing.id} ` +
      `(status preserved=${existing.status}, ` +
      `hours=${seed.requiredHours})`,
  );
}

async function seedInternship(seed: SeedInternship): Promise<void> {
  console.log(`\nProcessing ${seed.seedKey}`);

  const student = await resolveStudent(seed.studentEmail);
  const hte = await resolveHte(seed.hteCompanyName);
  const adviser = await resolveFacultyAdviser(seed.facultyAdviserEmail);

  const expectedHours = PROGRAM_HOURS[student.program];

  if (expectedHours === undefined) {
    throw new Error(
      `No internship hour mapping exists for program: ${student.program}`,
    );
  }

  if (seed.requiredHours !== expectedHours) {
    throw new Error(
      `Invalid required hours for ${student.program}: ` +
        `expected ${expectedHours}, received ${seed.requiredHours}.`,
    );
  }

  const existing = await findExistingInternshipForStudent(student.id);

  if (!existing) {
    await createInternship(seed, student, hte, adviser);
    return;
  }

  /*
   * A student may have multiple completed records, but only one
   * pending/active record.
   */
  if (existing.status !== "completed" && seed.status !== "completed") {
    await reconcileInternship(seed, existing, hte, adviser);
    return;
  }

  /*
   * If the existing record is completed and the seed wants another
   * completed record, we can create historical data.
   *
   * For this initial seed set, however, we avoid creating duplicate
   * completed records on every run.
   */
  if (existing.status === "completed") {
    console.log(`  Existing completed internship found: ${existing.id}`);
    console.log("  Skipping duplicate historical record.");
    return;
  }

  throw new Error(
    `Student ${student.email} already has an operational ` +
      `internship with status=${existing.status}.`,
  );
}

function validateSeedInternships(): void {
  const seenSeedKeys = new Set<string>();
  const seenStudents = new Set<string>();

  for (const internship of seedInternships) {
    if (seenSeedKeys.has(internship.seedKey)) {
      throw new Error(`Duplicate internship seed key: ${internship.seedKey}`);
    }

    const studentEmail = normalizeEmail(internship.studentEmail);

    if (seenStudents.has(studentEmail)) {
      throw new Error(
        `Student ${studentEmail} appears in multiple internship seeds.`,
      );
    }

    if (internship.requiredHours < 150 || internship.requiredHours > 350) {
      throw new Error(
        `Invalid required hours for ${internship.seedKey}: ` +
          `${internship.requiredHours}. Expected 150-350.`,
      );
    }

    seenSeedKeys.add(internship.seedKey);
    seenStudents.add(studentEmail);
  }
}

async function seed(): Promise<void> {
  validateSeedInternships();

  console.log("========================================");
  console.log("SBIMS Internship Seed");
  console.log("========================================");
  console.log(`Internships to process: ${seedInternships.length}`);

  let successCount = 0;
  let failureCount = 0;

  for (const internship of seedInternships) {
    try {
      await seedInternship(internship);
      successCount++;
    } catch (error) {
      failureCount++;

      console.error(
        `✗ Failed to seed ${internship.seedKey}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\n========================================");
  console.log("Internship seed complete");
  console.log(`Successful: ${successCount}`);
  console.log(`Failed:     ${failureCount}`);
  console.log("========================================");

  if (failureCount > 0) {
    throw new Error(
      `Internship seed completed with ${failureCount} failure(s).`,
    );
  }
}

if (import.meta.main) {
  await seed();
}
