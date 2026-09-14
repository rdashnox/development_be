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

  {
    seedKey: "student-07",
    email: "studentsbims7@grr.la",
    studentNumber: "2025-00718",
    program: "Bachelor of Science in Information Technology",
    yearLevel: 4,
    section: "BSIT-4A",
    contactNumber: "09661234567",
    address: "Blk 4 Lot 10, Brgy. Holy Spirit, Quezon City, Metro Manila",
    emergencyContactName: "Ramon Santos",
    emergencyContactNumber: "09561234567",
  },

  {
    seedKey: "student-08",
    email: "studentsbims8@grr.la",
    studentNumber: "2025-00829",
    program: "Bachelor of Science in Computer Science",
    yearLevel: 4,
    section: "BSCS-4B",
    contactNumber: "09771234567",
    address: "Blk 12 Lot 8, Brgy. Fairview, Quezon City, Metro Manila",
    emergencyContactName: "Liza Mendoza",
    emergencyContactNumber: "09671234567",
  },

  {
    seedKey: "student-09",
    email: "studentsbims9@grr.la",
    studentNumber: "2025-00934",
    program: "Bachelor of Science in Computer Engineering",
    yearLevel: 4,
    section: "BSCPE-4B",
    contactNumber: "09881234567",
    address: "Blk 7 Lot 19, Brgy. Novaliches Proper, Quezon City, Metro Manila",
    emergencyContactName: "Antonio Rivera",
    emergencyContactNumber: "09781234567",
  },

  {
    seedKey: "student-10",
    email: "studentsbims10@grr.la",
    studentNumber: "2025-01045",
    program: "Bachelor of Science in Information Technology",
    yearLevel: 4,
    section: "BSIT-4B",
    contactNumber: "09991234567",
    address: "Blk 2 Lot 14, Brgy. Bagong Ilog, Pasig City, Metro Manila",
    emergencyContactName: "Teresa Torres",
    emergencyContactNumber: "09891234567",
  },

  {
    seedKey: "student-11",
    email: "studentsbims11@grr.la",
    studentNumber: "2025-01156",
    program: "Bachelor of Science in Computer Science",
    yearLevel: 4,
    section: "BSCS-4A",
    contactNumber: "09181239876",
    address: "House 22, Sampaguita Street, Brgy. Commonwealth, Quezon City, Metro Manila",
    emergencyContactName: "Maribel Cruz",
    emergencyContactNumber: "09081239876",
  },

  {
    seedKey: "student-12",
    email: "studentsbims12@grr.la",
    studentNumber: "2025-01267",
    program: "Bachelor of Science in Information Technology",
    yearLevel: 4,
    section: "BSIT-4C",
    contactNumber: "09282345671",
    address: "Blk 15 Lot 6, Brgy. San Isidro, Parañaque City, Metro Manila",
    emergencyContactName: "Rogelio Reyes",
    emergencyContactNumber: "09182345671",
  },

  {
    seedKey: "student-13",
    email: "studentsbims13@grr.la",
    studentNumber: "2025-01378",
    program: "Bachelor of Science in Computer Engineering",
    yearLevel: 4,
    section: "BSCPE-4A",
    contactNumber: "09383456712",
    address: "Blk 3 Lot 11, Brgy. San Agustin, Dasmariñas City, Cavite",
    emergencyContactName: "Nora Garcia",
    emergencyContactNumber: "09283456712",
  },

  {
    seedKey: "student-14",
    email: "studentsbims14@grr.la",
    studentNumber: "2025-01489",
    program: "Bachelor of Science in Information Technology",
    yearLevel: 4,
    section: "BSIT-4D",
    contactNumber: "09484567823",
    address: "Unit 5C, 17 Ortigas Avenue Extension, Pasig City, Metro Manila",
    emergencyContactName: "Cynthia Villanueva",
    emergencyContactNumber: "09384567823",
  },

  {
    seedKey: "student-15",
    email: "studentsbims15@grr.la",
    studentNumber: "2025-01590",
    program: "Bachelor of Science in Computer Science",
    yearLevel: 4,
    section: "BSCS-4B",
    contactNumber: "09585678934",
    address: "Blk 8 Lot 3, Brgy. Bagong Silang, Caloocan City, Metro Manila",
    emergencyContactName: "Eduardo Cabrera",
    emergencyContactNumber: "09485678934",
  },

  {
    seedKey: "student-16",
    email: "studentsbims16@grr.la",
    studentNumber: "2025-01601",
    program: "Bachelor of Science in Information Technology",
    yearLevel: 4,
    section: "BSIT-4A",
    contactNumber: "09686789045",
    address: "Blk 10 Lot 17, Brgy. San Antonio, Pasig City, Metro Manila",
    emergencyContactName: "Grace Dela Cruz",
    emergencyContactNumber: "09586789045",
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
