import { createSeedAdminClient, getSeedPassword, normalizeEmail } from "./_shared/seed-utils.ts";

const supabaseAdmin = createSeedAdminClient();
const seedPassword = getSeedPassword();

type UserRole =
  | "administrator"
  | "internship_coordinator"
  | "faculty_adviser"
  | "student"
  | "hte_supervisor";

interface SeedUser {
  seedKey: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string | null;
  role: UserRole;
  mustChangePassword: boolean;
}

interface ProfileRow {
  id: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  last_password_changed_at: string | null;
}

const seedUsers: readonly SeedUser[] = [
  // =====================================================
  // Administrator
  // =====================================================
  {
    seedKey: "administrator-01",
    email: "adminsbims1@grr.la",
    firstName: "Isaac",
    middleName: "Maradona",
    lastName: "Clarke",
    suffix: null,
    role: "administrator",
    mustChangePassword: false,
  },
  // =====================================================
  // Internship Coordinators
  // =====================================================
  {
    seedKey: "internship-coordinator-01",
    email: "coordinatorsbims1@grr.la",
    firstName: "Elise",
    middleName: "Manansala",
    lastName: "Quijano",
    suffix: null,
    role: "internship_coordinator",
    mustChangePassword: false,
  },
  {
    seedKey: "internship-coordinator-02",
    email: "coordinatorsbims2@grr.la",
    firstName: "Gabriel",
    middleName: "Santos",
    lastName: "Villanueva",
    suffix: null,
    role: "internship_coordinator",
    mustChangePassword: true,
  },
  // =====================================================
  // Faculty Advisers
  // =====================================================
  {
    seedKey: "faculty-adviser-01",
    email: "facultysbims1@grr.la",
    firstName: "Nathaniel Andres",
    middleName: "Sarmiento",
    lastName: "Nacpil",
    suffix: "Jr.",
    role: "faculty_adviser",
    mustChangePassword: false,
  },
  {
    seedKey: "faculty-adviser-02",
    email: "facultysbims2@grr.la",
    firstName: "Camille",
    middleName: "Reyes",
    lastName: "Mendoza",
    suffix: null,
    role: "faculty_adviser",
    mustChangePassword: true,
  },
  {
    seedKey: "faculty-adviser-03",
    email: "facultysbims3@grr.la",
    firstName: "Adrian Miguel",
    middleName: "Torres",
    lastName: "Santiago",
    suffix: null,
    role: "faculty_adviser",
    mustChangePassword: false,
  },
  // =====================================================
  // Students
  // =====================================================
  {
    seedKey: "student-01",
    email: "studentsbims1@grr.la",
    firstName: "Rafael Joaquin",
    middleName: "Bondoc",
    lastName: "Dimalanta",
    suffix: "III",
    role: "student",
    mustChangePassword: false,
  },
  {
    seedKey: "student-02",
    email: "studentsbims2@grr.la",
    firstName: "Sofia",
    middleName: "Luna",
    lastName: "Cabrera",
    suffix: null,
    role: "student",
    mustChangePassword: true,
  },
  {
    seedKey: "student-03",
    email: "studentsbims3@grr.la",
    firstName: "Daniel",
    middleName: "Jose",
    lastName: "Navarro",
    suffix: null,
    role: "student",
    mustChangePassword: false,
  },
  {
    seedKey: "student-04",
    email: "studentsbims4@grr.la",
    firstName: "Mikaela",
    middleName: "Diaz",
    lastName: "Flores",
    suffix: null,
    role: "student",
    mustChangePassword: false,
  },
  {
    seedKey: "student-05",
    email: "studentsbims5@grr.la",
    firstName: "Lucas",
    middleName: "David",
    lastName: "Pascual",
    suffix: null,
    role: "student",
    mustChangePassword: false,
  },
  {
    seedKey: "student-06",
    email: "studentsbims6@grr.la",
    firstName: "Bea Bianca",
    middleName: "Sánchez",
    lastName: "Mallari",
    suffix: null,
    role: "student",
    mustChangePassword: false,
  },
  // =====================================================
  // HTE Supervisors
  // =====================================================
  {
    seedKey: "hte-supervisor-01",
    email: "htesbims1@grr.la",
    firstName: "Roberto Luis",
    middleName: "Fernandez",
    lastName: "Valderama",
    suffix: null,
    role: "hte_supervisor",
    mustChangePassword: false,
  },
  {
    seedKey: "hte-supervisor-02",
    email: "htesbims2@grr.la",
    firstName: "Patricia Anne",
    middleName: "Ramirez",
    lastName: "Dominguez",
    suffix: null,
    role: "hte_supervisor",
    mustChangePassword: true,
  },
  {
    seedKey: "hte-supervisor-03",
    email: "htesbims3@grr.la",
    firstName: "Marco Luis",
    middleName: "Corpuz",
    lastName: "Bautista",
    suffix: null,
    role: "hte_supervisor",
    mustChangePassword: false,
  },
  {
    seedKey: "hte-supervisor-04",
    email: "htesbims4@grr.la",
    firstName: "Elena",
    middleName: "Santos",
    lastName: "Fajardo",
    suffix: null,
    role: "hte_supervisor",
    mustChangePassword: false,
  },
];

async function findUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    throw new Error(`Unable to list Auth users: ${error.message}`);
  }
  return data.users.find(
    (user) => normalizeEmail(user.email ?? "") === normalizedEmail,
  );
}

async function findProfileById(id: string): Promise<ProfileRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(
      [
        "id",
        "email",
        "first_name",
        "middle_name",
        "last_name",
        "suffix",
        "role",
        "is_active",
        "must_change_password",
        "last_password_changed_at",
      ].join(", "),
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load profile ${id}: ${error.message}`);
  }
  return data as ProfileRow | null;
}

async function createAuthUser(user: SeedUser): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: normalizeEmail(user.email),
    password: seedPassword,
    email_confirm: true,
    user_metadata: {
      seed_key: user.seedKey,
      first_name: user.firstName,
      middle_name: user.middleName ?? null,
      last_name: user.lastName,
      suffix: user.suffix ?? null,
      role: user.role,
    },
  });

  if (error || !data.user) {
    throw new Error(
      error?.message ?? `Unable to create Auth user ${user.email}`,
    );
  }
  return data.user.id;
}

async function createProfile(userId: string, user: SeedUser): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    email: normalizeEmail(user.email),
    first_name: user.firstName,
    middle_name: user.middleName ?? null,
    last_name: user.lastName,
    suffix: user.suffix ?? null,
    role: user.role,
    is_active: true,
    must_change_password: user.mustChangePassword,
    last_password_changed_at: user.mustChangePassword ? null : now,
    created_by: null,
  });

  if (error) {
    throw new Error(
      `Unable to create profile for ${user.email}: ${error.message}`,
    );
  }
}

async function reconcileExistingProfile(
  userId: string,
  user: SeedUser,
): Promise<void> {
  const existingProfile = await findProfileById(userId);
  if (!existingProfile) {
    console.log("  Profile missing; creating profile");
    await createProfile(userId, user);
    return;
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      email: normalizeEmail(user.email),
      first_name: user.firstName,
      middle_name: user.middleName ?? null,
      last_name: user.lastName,
      suffix: user.suffix ?? null,
      role: user.role,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(
      `Unable to reconcile profile for ${user.email}: ${error.message}`,
    );
  }

  console.log(
    `  Existing state preserved: ` +
      `is_active=${existingProfile.is_active}, ` +
      `must_change_password=${existingProfile.must_change_password}, ` +
      `last_password_changed_at=` +
      `${existingProfile.last_password_changed_at ?? "null"}`,
  );
}

async function createSeedUser(user: SeedUser): Promise<void> {
  const normalizedEmail = normalizeEmail(user.email);
  console.log(`\nProcessing ${normalizedEmail}`);

  const existingAuthUser = await findUserByEmail(normalizedEmail);
  if (!existingAuthUser) {
    console.log("  Auth user does not exist; creating");
    const userId = await createAuthUser(user);

    try {
      await createProfile(userId, user);
    } catch (error) {
      console.error(
        `  Profile creation failed; rolling back Auth user ${userId}`,
      );

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (deleteError) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} ` +
            `Additionally failed to roll back Auth user: ` +
            `${deleteError.message}`,
        );
      }

      throw error;
    }

    console.log(
      `  ✓ Created ${normalizedEmail} ` +
        `(seed_key=${user.seedKey}, ` +
        `role=${user.role}, ` +
        `must_change_password=${user.mustChangePassword})`,
    );

    return;
  }

  console.log(`  Auth user already exists: ${existingAuthUser.id}`);

  const existingMetadata = existingAuthUser.user_metadata ?? {};
  if (existingMetadata.seed_key !== user.seedKey) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      existingAuthUser.id,
      {
        user_metadata: {
          ...existingMetadata,
          seed_key: user.seedKey,
        },
      },
    );

    if (error) {
      throw new Error(
        `Unable to update seed metadata for ${normalizedEmail}: ` +
          error.message,
      );
    }
  }

  await reconcileExistingProfile(existingAuthUser.id, user);
  console.log(`  ✓ Reconciled ${normalizedEmail}`);
}

function validateSeedUsers(): void {
  const seenEmails = new Set<string>();
  const seenSeedKeys = new Set<string>();

  for (const user of seedUsers) {
    const email = normalizeEmail(user.email);
    if (seenEmails.has(email)) {
      throw new Error(`Duplicate seed user email: ${email}`);
    }

    if (seenSeedKeys.has(user.seedKey)) {
      throw new Error(`Duplicate seed user key: ${user.seedKey}`);
    }

    seenEmails.add(email);
    seenSeedKeys.add(user.seedKey);
  }

  const roles: UserRole[] = [
    "administrator",
    "internship_coordinator",
    "faculty_adviser",
    "student",
    "hte_supervisor",
  ];

  for (const role of roles) {
    const usersForRole = seedUsers.filter((user) => user.role === role);
    const usersRequiringPasswordChange = usersForRole.filter(
      (user) => user.mustChangePassword,
    );

    if (role === "administrator") {
      if (usersRequiringPasswordChange.length > 1) {
        throw new Error(
          `Expected at most one ${role} seed user with ` +
            `mustChangePassword=true, found ` +
            `${usersRequiringPasswordChange.length}.`,
        );
      }
      continue;
    }

    if (usersRequiringPasswordChange.length !== 1) {
      throw new Error(
        `Expected exactly one ${role} seed user with ` +
          `mustChangePassword=true, found ` +
          `${usersRequiringPasswordChange.length}.`,
      );
    }
  }
}

async function seed(): Promise<void> {
  validateSeedUsers();
  console.log("========================================");
  console.log("SBIMS Development User Seed");
  console.log("========================================");
  console.log(`Users to process: ${seedUsers.length}`);

  let successCount = 0;
  let failureCount = 0;

  for (const user of seedUsers) {
    try {
      await createSeedUser(user);
      successCount++;
    } catch (error) {
      failureCount++;
      console.error(
        `✗ Failed to seed ${user.email}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\n========================================");
  console.log("Seed complete");
  console.log(`Successful: ${successCount}`);
  console.log(`Failed:     ${failureCount}`);
  console.log("========================================");

  if (failureCount > 0) {
    throw new Error(`User seed completed with ${failureCount} failure(s).`);
  }
}

if (import.meta.main) {
  await seed();
}
