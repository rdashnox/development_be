import { createSeedAdminClient, normalizeEmail } from "./_shared/seed-utils.ts";

const supabaseAdmin = createSeedAdminClient();

type ProfileRow = {
  id: string;
  email: string;
  role:
    | "administrator"
    | "internship_coordinator"
    | "faculty_adviser"
    | "student"
    | "hte_supervisor";
  is_active: boolean;
  must_change_password: boolean;
};

type HteRow = {
  id: string;
  company_name: string;
  address: string;
  contact_person: string;
  contact_email: string | null;
  contact_number: string | null;
  supervisor_id: string | null;
  is_active: boolean;
};

interface SeedHte {
  seedKey: string;
  companyName: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactNumber: string;
  supervisorEmail: string | null;
}

const seedHtes: readonly SeedHte[] = [
  {
    seedKey: "hte-01",
    companyName: "ABC Computing Solutions, Inc.",
    address:
      "Unit 804, Meridian Corporate Center, 18 Emerald Avenue, Barangay San Antonio, Pasig City, Metro Manila",
    contactPerson: "Roberto Luis F. Valderama",
    contactEmail: "roberto.valderama@abccomputing.io",
    contactNumber: "0917-845-2613",
    supervisorEmail: "htesbims1@grr.la",
  },

  {
    seedKey: "hte-02",
    companyName: "DEF Engineering Corporation",
    address:
      "2/F Eastgate Commercial Building, 42 Magsaysay Avenue, Barangay Bagong Ilog, Pasig City, Metro Manila",
    contactPerson: "Marco Luis C. Bautista",
    contactEmail: "marco.bautista@def-engineering.co",
    contactNumber: "0918-632-4795",
    supervisorEmail: "htesbims3@grr.la",
  },

  {
    seedKey: "hte-03",
    companyName: "GHI Applied Technologies, Inc.",
    address:
      "3/F Crestline Business Hub, 27 Governor's Drive, Barangay San Agustin, Dasmariñas City, Cavite",
    contactPerson: "Elena S. Fajardo",
    contactEmail: "elena.fajardo@ghi-applied-tech.tech",
    contactNumber: "0917-524-8136",
    supervisorEmail: "htesbims4@grr.la",
  },

  {
    seedKey: "hte-04",
    companyName: "Jupiter Digital Systems, Inc.",
    address:
      "5/F Jupiter Technology Center, 12 Jupiter Street, Barangay Bel-Air, Makati City, Metro Manila",
    contactPerson: "Joshua Miguel R. Santos",
    contactEmail: "joshua.santos@jupiterdigital.ph",
    contactNumber: "0917-634-2185",
    supervisorEmail: "htesbims5@grr.la",
  },

  {
    seedKey: "hte-05",
    companyName: "Northstar Software Labs",
    address: "8/F Northstar Tower, 88 EDSA, Barangay Wack-Wack, Mandaluyong City, Metro Manila",
    contactPerson: "Angela Mae C. Mendoza",
    contactEmail: "angela.mendoza@northstarlabs.ph",
    contactNumber: "0918-745-3296",
    supervisorEmail: "htesbims6@grr.la",
  },

  {
    seedKey: "hte-06",
    companyName: "Manila Cloudworks Corporation",
    address:
      "10/F Cloudworks Building, 101 Dela Rosa Street, Barangay San Lorenzo, Makati City, Metro Manila",
    contactPerson: "Christian P. Rivera",
    contactEmail: "christian.rivera@manilacloudworks.ph",
    contactNumber: "0919-856-4317",
    supervisorEmail: "htesbims7@grr.la",
  },

  {
    seedKey: "hte-07",
    companyName: "Cavite Technology Solutions",
    address:
      "2/F CTS Innovation Hub, 45 Governor's Drive, Barangay San Agustin, Dasmariñas City, Cavite",
    contactPerson: "Katrina A. Torres",
    contactEmail: "katrina.torres@cavitetecsolutions.ph",
    contactNumber: "0920-967-5428",
    supervisorEmail: "htesbims8@grr.la",
  },

  {
    seedKey: "hte-08",
    companyName: "Metro Data Services Philippines",
    address:
      "6/F Metro Data Center, 26 Ortigas Avenue Extension, Barangay Rosario, Pasig City, Metro Manila",
    contactPerson: "Patricia Anne R. Dominguez",
    contactEmail: "patricia.dominguez@metrodata.ph",
    contactNumber: "0921-178-6539",
    supervisorEmail: "htesbims2@grr.la",
  },
];

const HTE_SELECT = `
  id,
  company_name,
  address,
  contact_person,
  contact_email,
  contact_number,
  supervisor_id,
  is_active
`;

async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, is_active, must_change_password")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to find profile ${normalizedEmail}: ${error.message}`,
    );
  }

  return data as ProfileRow | null;
}

async function findHteByCompanyName(
  companyName: string,
): Promise<HteRow | null> {
  const { data, error } = await supabaseAdmin
    .from("hte_profiles")
    .select(HTE_SELECT)
    .eq("company_name", companyName)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to find HTE ${companyName}: ${error.message}`);
  }

  return data as HteRow | null;
}

/**
 * Resolve a seed supervisor email to profiles.id.
 *
 * This intentionally validates the business rules before assignment.
 */
async function resolveSupervisor(supervisorEmail: string): Promise<string> {
  const normalizedEmail = normalizeEmail(supervisorEmail);
  const profile = await findProfileByEmail(normalizedEmail);

  if (!profile) {
    throw new Error(`HTE supervisor profile not found: ${normalizedEmail}`);
  }

  if (profile.role !== "hte_supervisor") {
    throw new Error(
      `Profile ${normalizedEmail} does not have the hte_supervisor role.`,
    );
  }

  if (!profile.is_active) {
    throw new Error(
      `HTE supervisor ${normalizedEmail} is inactive and cannot be assigned.`,
    );
  }

  return profile.id;
}

async function createHte(
  hte: SeedHte,
  supervisorId: string | null,
): Promise<HteRow> {
  const { data, error } = await supabaseAdmin
    .from("hte_profiles")
    .insert({
      company_name: hte.companyName,
      address: hte.address,
      contact_person: hte.contactPerson,
      contact_email: hte.contactEmail,
      contact_number: hte.contactNumber,
      supervisor_id: supervisorId,
      is_active: true,
    })
    .select(HTE_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? `Unable to create HTE ${hte.companyName}`,
    );
  }

  return data as HteRow;
}

async function reconcileExistingHte(
  hte: SeedHte,
  existingHte: HteRow,
  supervisorId: string | null,
): Promise<void> {
  /*
   * The seed owns the development HTE records, so the business
   * fields are reconciled to the values declared above.
   */
  const { error } = await supabaseAdmin
    .from("hte_profiles")
    .update({
      address: hte.address,
      contact_person: hte.contactPerson,
      contact_email: hte.contactEmail,
      contact_number: hte.contactNumber,
      supervisor_id: supervisorId,
      is_active: true,
    })
    .eq("id", existingHte.id);

  if (error) {
    throw new Error(
      `Unable to reconcile HTE ${hte.companyName}: ${error.message}`,
    );
  }

  console.log(
    `  ✓ Reconciled ${hte.companyName} ` +
      `(supervisor=${supervisorId ?? "none"})`,
  );
}

async function seedHte(hte: SeedHte): Promise<void> {
  console.log(`\nProcessing ${hte.companyName}`);

  let supervisorId: string | null = null;

  if (hte.supervisorEmail) {
    supervisorId = await resolveSupervisor(hte.supervisorEmail);

    console.log(`  Supervisor: ${normalizeEmail(hte.supervisorEmail)}`);
  } else {
    console.log("  Supervisor: none");
  }

  const existingHte = await findHteByCompanyName(hte.companyName);

  if (!existingHte) {
    const created = await createHte(hte, supervisorId);

    console.log(
      `  ✓ Created ${created.company_name} ` +
        `(seed_key=${hte.seedKey}, ` +
        `supervisor=${supervisorId ?? "none"})`,
    );

    return;
  }

  /*
   * Do not unexpectedly replace a different supervisor that may have
   * been manually assigned during development.
   */
  if (
    supervisorId !== null &&
    existingHte.supervisor_id !== null &&
    existingHte.supervisor_id !== supervisorId
  ) {
    throw new Error(
      `HTE ${hte.companyName} already has a different supervisor. ` +
        `Refusing to replace supervisor ${existingHte.supervisor_id} ` +
        `with ${supervisorId}.`,
    );
  }

  await reconcileExistingHte(hte, existingHte, supervisorId);
}

function validateSeedHtes(): void {
  const seenSeedKeys = new Set<string>();
  const seenCompanyNames = new Set<string>();
  const seenSupervisorEmails = new Set<string>();

  for (const hte of seedHtes) {
    if (seenSeedKeys.has(hte.seedKey)) {
      throw new Error(`Duplicate HTE seed key: ${hte.seedKey}`);
    }

    if (seenCompanyNames.has(hte.companyName)) {
      throw new Error(`Duplicate HTE company name: ${hte.companyName}`);
    }

    if (hte.supervisorEmail) {
      const email = normalizeEmail(hte.supervisorEmail);

      if (seenSupervisorEmails.has(email)) {
        throw new Error(
          `Supervisor ${email} is assigned to multiple HTE seeds.`,
        );
      }

      seenSupervisorEmails.add(email);
    }

    seenSeedKeys.add(hte.seedKey);
    seenCompanyNames.add(hte.companyName);
  }
}

async function seed(): Promise<void> {
  validateSeedHtes();

  console.log("========================================");
  console.log("SBIMS HTE Seed");
  console.log("========================================");
  console.log(`HTEs to process: ${seedHtes.length}`);

  let successCount = 0;
  let failureCount = 0;

  for (const hte of seedHtes) {
    try {
      await seedHte(hte);
      successCount++;
    } catch (error) {
      failureCount++;

      console.error(
        `✗ Failed to seed ${hte.companyName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\n========================================");
  console.log("HTE seed complete");
  console.log(`Successful: ${successCount}`);
  console.log(`Failed:     ${failureCount}`);
  console.log("========================================");

  if (failureCount > 0) {
    throw new Error(`HTE seed completed with ${failureCount} failure(s).`);
  }
}

if (import.meta.main) {
  await seed();
}
