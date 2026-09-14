import { createSeedAdminClient, normalizeEmail, seedError } from "./_shared/seed-utils.ts";

const supabaseAdmin = createSeedAdminClient();

type InternshipStatus = "pending" | "active" | "completed";

interface SeedInternship {
  seedKey: string;
  studentEmail: string;
  hteCompanyName: string;
  facultyAdviserEmail: string;
  startDate: string;
  endDate: string;
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
  start_date: string | null;
  end_date: string | null;
  status: InternshipStatus;
}

const DEMO_REQUIRED_HOURS = 150;
const HISTORICAL_REQUIRED_HOURS = 300;

/*
 * Development/demo dataset.
 *
 * The API/database do not define 150 hours as a universal academic rule.
 * This seed intentionally uses a smaller requirement so the complete
 * evaluation workflow can be demonstrated quickly.
 *
 * Three completed internships are evaluation-ready as of 2026-09-13:
 * - end date: 2026-09-12
 * - required hours: 150
 * - attendance seed: exactly 150 validated rendered hours
 *
 * Seven active internships are deliberately near completion:
 * - required hours: 150
 * - attendance seed: 136 validated rendered hours
 *
 * Four pending internships have no attendance records.
 * One historical Summer OJT remains at 300 hours.
 */
const seedInternships: readonly SeedInternship[] = [
  {
    seedKey: "internship-01",
    studentEmail: "studentsbims1@grr.la",
    hteCompanyName: "ABC Computing Solutions, Inc.",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-09-12",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "completed",
  },
  {
    seedKey: "internship-02",
    studentEmail: "studentsbims3@grr.la",
    hteCompanyName: "DEF Engineering Corporation",
    facultyAdviserEmail: "facultysbims3@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-09-12",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "completed",
  },
  {
    seedKey: "internship-03",
    studentEmail: "studentsbims4@grr.la",
    hteCompanyName: "GHI Applied Technologies, Inc.",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-09-12",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "completed",
  },
  {
    seedKey: "internship-04",
    studentEmail: "studentsbims6@grr.la",
    hteCompanyName: "Jupiter Digital Systems, Inc.",
    facultyAdviserEmail: "facultysbims3@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-12-19",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "active",
  },
  {
    seedKey: "internship-05",
    studentEmail: "studentsbims7@grr.la",
    hteCompanyName: "Northstar Software Labs",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-12-19",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "active",
  },
  {
    seedKey: "internship-06",
    studentEmail: "studentsbims8@grr.la",
    hteCompanyName: "Manila Cloudworks Corporation",
    facultyAdviserEmail: "facultysbims3@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-12-19",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "active",
  },
  {
    seedKey: "internship-07",
    studentEmail: "studentsbims9@grr.la",
    hteCompanyName: "Cavite Technology Solutions",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-12-19",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "active",
  },
  {
    seedKey: "internship-08",
    studentEmail: "studentsbims10@grr.la",
    hteCompanyName: "Metro Data Services Philippines",
    facultyAdviserEmail: "facultysbims3@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-12-19",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "active",
  },
  {
    seedKey: "internship-09",
    studentEmail: "studentsbims11@grr.la",
    hteCompanyName: "ABC Computing Solutions, Inc.",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-12-19",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "active",
  },
  {
    seedKey: "internship-10",
    studentEmail: "studentsbims12@grr.la",
    hteCompanyName: "DEF Engineering Corporation",
    facultyAdviserEmail: "facultysbims3@grr.la",
    startDate: "2026-08-17",
    endDate: "2026-12-19",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "active",
  },
  {
    seedKey: "internship-11",
    studentEmail: "studentsbims13@grr.la",
    hteCompanyName: "GHI Applied Technologies, Inc.",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2027-01-18",
    endDate: "2027-05-22",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "pending",
  },
  {
    seedKey: "internship-12",
    studentEmail: "studentsbims14@grr.la",
    hteCompanyName: "Jupiter Digital Systems, Inc.",
    facultyAdviserEmail: "facultysbims3@grr.la",
    startDate: "2027-01-18",
    endDate: "2027-05-22",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "pending",
  },
  {
    seedKey: "internship-13",
    studentEmail: "studentsbims15@grr.la",
    hteCompanyName: "Northstar Software Labs",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2027-01-18",
    endDate: "2027-05-22",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "pending",
  },
  {
    seedKey: "internship-14",
    studentEmail: "studentsbims16@grr.la",
    hteCompanyName: "Manila Cloudworks Corporation",
    facultyAdviserEmail: "facultysbims3@grr.la",
    startDate: "2027-01-18",
    endDate: "2027-05-22",
    requiredHours: DEMO_REQUIRED_HOURS,
    status: "pending",
  },
  {
    seedKey: "internship-15",
    studentEmail: "studentsbims5@grr.la",
    hteCompanyName: "ABC Computing Solutions, Inc.",
    facultyAdviserEmail: "facultysbims1@grr.la",
    startDate: "2026-06-01",
    endDate: "2026-08-07",
    requiredHours: HISTORICAL_REQUIRED_HOURS,
    status: "completed",
  },
];

const INTERNSHIP_SELECT = `
  id,
  student_id,
  hte_id,
  faculty_adviser_id,
  required_hours,
  start_date,
  end_date,
  status
`;

async function findStudentByEmail(email: string): Promise<StudentRow | null> {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select(`id, program, profiles!inner(email)`)
    .eq("profiles.email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw seedError(`internships.find-student:${normalizedEmail}`, error);
  }

  if (!data) return null;

  const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
  if (!profile) return null;

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

  if (error) throw seedError(`internships.find-hte:${companyName}`, error);
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
  if (!hte) throw new Error(`HTE not found: ${companyName}`);
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
      start_date: seed.startDate,
      end_date: seed.endDate,
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
      `(student=${student.email}, hours=${seed.requiredHours}, status=${seed.status})`,
  );
}

async function reconcileInternship(
  seed: SeedInternship,
  existing: InternshipRow,
  hte: HteRow,
  adviser: FacultyAdviserRow,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    hte_id: hte.id,
    faculty_adviser_id: adviser.id,
    start_date: seed.startDate,
    end_date: seed.endDate,
    required_hours: seed.requiredHours,
  };

  /*
   * This is a development seed, not an API lifecycle operation.
   * If an older seed left one of the three demo interns active, the new
   * dataset must reconcile it to completed so the evaluation seed can run.
   */
  if (seed.status === "completed" && existing.status !== "completed") {
    updateData.status = "completed";
  }

  const { error } = await supabaseAdmin
    .from("internships")
    .update(updateData)
    .eq("id", existing.id);

  if (error) throw seedError(`internships.reconcile:${seed.seedKey}`, error);

  console.log(
    `  ✓ Reconciled internship ${existing.id} ` +
      `(status=${existing.status} -> ${seed.status}, hours=${seed.requiredHours})`,
  );
}

async function seedInternship(seed: SeedInternship): Promise<void> {
  const student = await resolveStudent(seed.studentEmail);
  const hte = await resolveHte(seed.hteCompanyName);
  const adviser = await resolveFacultyAdviser(seed.facultyAdviserEmail);

  const existing = await findExistingInternshipForStudent(student.id);

  if (!existing) {
    await createInternship(seed, student, hte, adviser);
    return;
  }

  await reconcileInternship(seed, existing, hte, adviser);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validateSeedInternships(): void {
  const seenSeedKeys = new Set<string>();
  const seenStudents = new Set<string>();

  for (const internship of seedInternships) {
    const studentEmail = normalizeEmail(internship.studentEmail);

    if (seenSeedKeys.has(internship.seedKey)) {
      throw new Error(`Duplicate internship seed key: ${internship.seedKey}`);
    }
    if (seenStudents.has(studentEmail)) {
      throw new Error(
        `Student ${studentEmail} appears in multiple internship seeds.`,
      );
    }
    if (
      !isValidDate(internship.startDate) ||
      !isValidDate(internship.endDate)
    ) {
      throw new Error(`Invalid internship period for ${internship.seedKey}.`);
    }
    if (internship.startDate >= internship.endDate) {
      throw new Error(
        `Internship start date must be before end date for ${internship.seedKey}.`,
      );
    }
    if (internship.requiredHours < 150 || internship.requiredHours > 350) {
      throw new Error(
        `Invalid required hours for ${internship.seedKey}: ${internship.requiredHours}.`,
      );
    }

    seenSeedKeys.add(internship.seedKey);
    seenStudents.add(studentEmail);
  }
}

async function seed(): Promise<void> {
  validateSeedInternships();

  console.log("========================================");
  console.log("SBIMS Development Internship Seed");
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
  console.log("Internship Seed Summary");
  console.log("========================================");
  console.log(`Successful: ${successCount}`);
  console.log(`Failed:     ${failureCount}`);

  if (failureCount > 0) {
    throw new Error(
      `Internship seeding completed with ${failureCount} failure(s).`,
    );
  }
}

if (import.meta.main) {
  await seed();
}
