import { createSeedAdminClient, normalizeEmail, seedError } from "./_shared/seed-utils.ts";

const supabaseAdmin = createSeedAdminClient();

interface SeedStudent {
  seedKey: string;
  email: string;
  studentNumber: string;
  program: string;
  yearLevel: number;
  section: string;
  contactNumber: string;
  address: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
}

const seedStudents: readonly SeedStudent[] = [
  // =====================================================
  // Student 01
  // =====================================================
  {
    seedKey: "student-01",
    email: "studentsbims1@grr.la",
    studentNumber: "2023-00124",
    program: "Bachelor of Science in Computer Science",
    yearLevel: 4,
    section: "BSCS-4A",
    contactNumber: "09171234567",
    address: "Unit 4B, 28 P. Tuazon Boulevard, Barangay Socorro, Quezon City, Metro Manila",
    emergencyContactName: "Marissa Dimalanta",
    emergencyContactNumber: "09181234567",
  },

  // student-02 is intentionally excluded because
  // must_change_password=true.

  // =====================================================
  // Student 03
  // =====================================================
  {
    seedKey: "student-03",
    email: "studentsbims3@grr.la",
    studentNumber: "2023-00387",
    program: "Bachelor of Science in Computer Engineering",
    yearLevel: 4,
    section: "BSCPE-4A",
    contactNumber: "09201234567",
    address: "Blk 18 Lot 7, Phase 2, Bagong Silang, Caloocan City, Metro Manila",
    emergencyContactName: "Jose Navarro",
    emergencyContactNumber: "09191234567",
  },

  // =====================================================
  // Student 04
  // =====================================================
  {
    seedKey: "student-04",
    email: "studentsbims4@grr.la",
    studentNumber: "2024-00416",
    program: "Bachelor of Science in Information Technology",
    yearLevel: 3,
    section: "BSIT-3B",
    contactNumber: "09351234567",
    address: "Blk 9 Lot 15, Phase 1, Brgy. San Isidro, Parañaque City, Metro Manila",
    emergencyContactName: "Lourdes Flores",
    emergencyContactNumber: "09221234567",
  },

  // =====================================================
  // Student 05
  // =====================================================
  {
    seedKey: "student-05",
    email: "studentsbims5@grr.la",
    studentNumber: "2024-00542",
    program: "Bachelor of Science in Information Technology",
    yearLevel: 3,
    section: "BSIT-3A",
    contactNumber: "09451234567",
    address: "House 16, 2nd Street, Brgy. Holy Spirit, Quezon City, Metro Manila",
    emergencyContactName: "David Pascual",
    emergencyContactNumber: "09321234567",
  },

  // =====================================================
  // Student 06
  // =====================================================
  {
    seedKey: "student-06",
    email: "studentsbims6@grr.la",
    studentNumber: "2025-00631",
    program: "Bachelor of Science in Computer Science",
    yearLevel: 3,
    section: "BSCS-3A",
    contactNumber: "09551234567",
    address: "Blk 6 Lot 21, Phase 3, Brgy. Commonwealth, Quezon City, Metro Manila",
    emergencyContactName: "Bianca Mallari",
    emergencyContactNumber: "09421234567",
  },
];

interface SeedUserProfile {
  id: string;
  email: string;
  role: "student";
  is_active: boolean;
  must_change_password: boolean;
}

async function findSeedUserByEmail(
  email: string,
): Promise<SeedUserProfile | null> {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, is_active, must_change_password")
    .eq("email", normalizedEmail)
    .eq("role", "student")
    .maybeSingle();

  if (error) {
    throw seedError(`students.find-user:${normalizedEmail}`, error);
  }

  return data as SeedUserProfile | null;
}

async function findStudentProfile(
  userId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw seedError(`students.find-profile:${userId}`, error);
  }

  return data;
}

async function createStudentProfile(
  userId: string,
  student: SeedStudent,
): Promise<void> {
  const { error } = await supabaseAdmin.from("student_profiles").insert({
    id: userId,
    student_number: student.studentNumber,
    program: student.program,
    year_level: student.yearLevel,
    section: student.section,
    contact_number: student.contactNumber,
    address: student.address,
    emergency_contact_name: student.emergencyContactName,
    emergency_contact_number: student.emergencyContactNumber,
  });

  if (error) {
    throw seedError(`students.create-profile:${student.seedKey}`, error);
  }
}

async function seedStudent(
  student: SeedStudent,
): Promise<"created" | "exists" | "skipped"> {
  console.log(`\nProcessing ${student.seedKey}`);

  const profile = await findSeedUserByEmail(student.email);

  if (!profile) {
    console.log(
      `  Skipped: student user ${normalizeEmail(student.email)} does not exist.`,
    );
    return "skipped";
  }

  if (!profile.is_active) {
    console.log("  Skipped: student account is inactive.");
    return "skipped";
  }

  if (profile.must_change_password) {
    console.log("  Skipped: student account requires password change.");
    return "skipped";
  }

  const existingStudent = await findStudentProfile(profile.id);

  if (existingStudent) {
    console.log(`  Student profile already exists: ${existingStudent.id}`);
    return "exists";
  }

  await createStudentProfile(profile.id, student);

  console.log(
    `  ✓ Created student profile ` +
      `(student_number=${student.studentNumber}, ` +
      `year_level=${student.yearLevel}, ` +
      `section=${student.section})`,
  );

  return "created";
}

function validateSeedStudents(): void {
  const seenSeedKeys = new Set<string>();
  const seenEmails = new Set<string>();
  const seenStudentNumbers = new Set<string>();

  for (const student of seedStudents) {
    const email = normalizeEmail(student.email);

    if (seenSeedKeys.has(student.seedKey)) {
      throw new Error(`Duplicate student seed key: ${student.seedKey}`);
    }

    if (seenEmails.has(email)) {
      throw new Error(`Duplicate student seed email: ${email}`);
    }

    if (seenStudentNumbers.has(student.studentNumber)) {
      throw new Error(`Duplicate student number: ${student.studentNumber}`);
    }

    seenSeedKeys.add(student.seedKey);
    seenEmails.add(email);
    seenStudentNumbers.add(student.studentNumber);
  }
}

async function seed(): Promise<void> {
  validateSeedStudents();

  console.log("========================================");
  console.log("SBIMS Development Student Seed");
  console.log("========================================");
  console.log(`Students to process: ${seedStudents.length}`);

  let createdCount = 0;
  let existingCount = 0;
  let skippedCount = 0;
  let failureCount = 0;

  for (const student of seedStudents) {
    try {
      const result = await seedStudent(student);

      switch (result) {
        case "created":
          createdCount++;
          break;

        case "exists":
          existingCount++;
          break;

        case "skipped":
          skippedCount++;
          break;
      }
    } catch (error) {
      failureCount++;

      console.error(
        `✗ Failed to seed ${student.seedKey}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\n========================================");
  console.log("Student seed complete");
  console.log(`Created:  ${createdCount}`);
  console.log(`Existing: ${existingCount}`);
  console.log(`Skipped:  ${skippedCount}`);
  console.log(`Failed:   ${failureCount}`);
  console.log("========================================");

  if (failureCount > 0) {
    throw new Error(`Student seed completed with ${failureCount} failure(s).`);
  }
}

if (import.meta.main) {
  await seed();
}
