import { assertEquals, assertExists } from "@std/assert";

import { createApp } from "../../src/app.ts";

import { setupTestUsers } from "../helpers/test-user.setup.ts";
import { TEST_USERS } from "../fixtures/test-users.ts";
import { createSupabaseClients } from "../../src/lib/supabase.ts";

import { loadEnv } from "../../src/config/env.ts";
import { getDenoEnv } from "../../src/config/runtime.ts";

const env = loadEnv(getDenoEnv());

const app = createApp(env);

const { supabaseAdmin } = createSupabaseClients(env);

// ============================================================
// Test constants
// ============================================================

const TEST_FACULTY_ADVISER = {
  email: "sbims-test-faculty-adviser@maildrop.cc",
  password: "TestPassword2026!",
  firstName: "Test",
  lastName: "Faculty Adviser",
};

const REQUIRED_HOURS = 486;

// ============================================================
// Types
// ============================================================

type InternshipRecord = {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  required_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  status: "pending" | "active" | "completed";
  created_at?: string;
  updated_at?: string;
};

// ============================================================
// HTTP helpers
// ============================================================

async function login(
  email: string = TEST_USERS.admin.email,
  password: string = TEST_USERS.admin.password,
) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const body = await response.json();

  return {
    response,
    body,
  };
}

async function authenticatedRequest(
  path: string,
  token: string,
  options: RequestInit = {},
) {
  return await app.request(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

// ============================================================
// Date helpers
// ============================================================

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

function yesterday(): string {
  return addDays(-1);
}

function today(): string {
  return addDays(0);
}

function tomorrow(): string {
  return addDays(1);
}

function daysFromNow(days: number): string {
  return addDays(days);
}

// ============================================================
// Database helpers
// ============================================================

async function getTestUserId(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    throw error;
  }

  const user = data.users.find(
    (item) => item.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!user) {
    throw new Error(`Test user not found: ${email}`);
  }

  return user.id;
}

/**
 * The normal TEST_USERS fixture intentionally does not contain
 * a faculty adviser user.
 *
 * Internship creation now requires facultyAdviserId, so this test
 * creates one dedicated faculty adviser fixture independently.
 */
async function ensureTestFacultyAdviser(): Promise<string> {
  let userId: string;

  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

  if (listError) {
    throw listError;
  }

  const existingUser = existingUsers.users.find(
    (user) => user.email?.toLowerCase() === TEST_FACULTY_ADVISER.email.toLowerCase(),
  );

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: TEST_FACULTY_ADVISER.email,
      password: TEST_FACULTY_ADVISER.password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw error ?? new Error("Unable to create test faculty adviser.");
    }

    userId = data.user.id;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email: TEST_FACULTY_ADVISER.email,
        first_name: TEST_FACULTY_ADVISER.firstName,
        last_name: TEST_FACULTY_ADVISER.lastName,
        role: "faculty_adviser",
        is_active: true,
        must_change_password: false,
      },
      {
        onConflict: "id",
      },
    )
    .select(
      `
        id,
        role,
        is_active
      `,
    )
    .single();

  if (profileError || !profile) {
    throw (
      profileError ??
        new Error("Unable to create test faculty adviser profile.")
    );
  }

  assertEquals(profile.role, "faculty_adviser");
  assertEquals(profile.is_active, true);

  return userId;
}

/**
 * Reset only the student internship data used by this integration suite.
 *
 * The internship FK is configured with ON DELETE CASCADE for attendance,
 * evaluations, and documents in the current database design, so deleting
 * the internship records is sufficient for test isolation.
 */
async function ensureTestStudentProfile() {
  const studentId = await getTestUserId(TEST_USERS.student.email);

  const { error: internshipError } = await supabaseAdmin
    .from("internships")
    .delete()
    .eq("student_id", studentId);

  if (internshipError) {
    throw internshipError;
  }

  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .upsert(
      {
        id: studentId,
        student_number: `FR05-${crypto.randomUUID()}`,
        program: "BSIT",
        year_level: 4,
        section: "A",
        contact_number: "09171234567",
        address: "Test Address, Bulacan",
        emergency_contact_name: "Test Emergency Contact",
        emergency_contact_number: "09179876543",
      },
      {
        onConflict: "id",
      },
    )
    .select(
      `
        id,
        student_number,
        program,
        year_level,
        section
      `,
    )
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create test student profile.");
  }

  return data;
}

// ============================================================
// HTE fixture
// ============================================================

async function createTestHte(token: string) {
  const response = await authenticatedRequest("/api/v1/htes", token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      companyName: `FR05 Test HTE ${crypto.randomUUID()}`,
      address: "Test Address, Bulacan",
      contactPerson: "Test Contact Person",
      contactEmail: "contact@example.com",
      contactNumber: "09171234567",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data;
}

// ============================================================
// Internship fixture
// ============================================================

async function createTestInternship(
  token: string,
  studentId: string,
  hteId: string,
  facultyAdviserId: string,
  options: {
    startDate?: string;
    endDate?: string;
    requiredHours?: number;
  } = {},
): Promise<InternshipRecord> {
  const startDate = options.startDate ?? yesterday();
  const endDate = options.endDate ?? tomorrow();
  const requiredHours = options.requiredHours ?? REQUIRED_HOURS;

  const response = await authenticatedRequest("/api/v1/internships", token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      studentId,
      hteId,
      facultyAdviserId,
      startDate,
      endDate,
      requiredHours,
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data as InternshipRecord;
}

async function updateInternship(
  token: string,
  internshipId: string,
  data: Record<string, unknown>,
) {
  const response = await authenticatedRequest(
    `/api/v1/internships/${internshipId}`,
    token,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  );

  const body = await response.json();

  return {
    response,
    body,
  };
}

async function updateInternshipStatus(
  token: string,
  internshipId: string,
  status: "pending" | "active" | "completed",
) {
  const response = await authenticatedRequest(
    `/api/v1/internships/${internshipId}/status`,
    token,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status,
      }),
    },
  );

  const body = await response.json();

  return {
    response,
    body,
  };
}

// ============================================================
// Completion fixtures
// ============================================================

/**
 * Creates one validated 8-hour attendance record.
 *
 * 08:00 -> 17:00 = 9 elapsed hours
 * minus standard 1-hour meal break
 * = 8 rendered hours.
 */
async function createValidatedAttendance(
  internshipId: string,
  validatedBy: string,
  attendanceDate: string,
) {
  const { data, error } = await supabaseAdmin
    .from("attendance_records")
    .insert({
      internship_id: internshipId,
      attendance_date: attendanceDate,
      time_in: "08:00",
      time_out: "17:00",
      validation_status: "validated",
      validated_by: validatedBy,
      validated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create validated attendance fixture.");
  }

  return data;
}

/**
 * Changes the end date directly in the test database.
 *
 * This is intentionally test-fixture setup. It allows the test to move
 * an already-active internship into the "period has ended" state without
 * waiting for the actual calendar date.
 */
async function setInternshipEndDate(
  internshipId: string,
  endDate: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("internships")
    .update({
      end_date: endDate,
    })
    .eq("id", internshipId);

  if (error) {
    throw error;
  }
}

// ============================================================
// Test 1 — List
// ============================================================

Deno.test("FR-05 administrator can list internships", async () => {
  await setupTestUsers();
  await ensureTestFacultyAdviser();
  await ensureTestStudentProfile();

  const { response: loginResponse, body: loginBody } = await login();

  assertEquals(loginResponse.status, 200);
  assertEquals(loginBody.success, true);

  const response = await authenticatedRequest(
    "/api/v1/internships",
    loginBody.data.accessToken,
  );

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertExists(body.data);
});

// ============================================================
// Test 2 — Create
// ============================================================

Deno.test(
  "FR-05 administrator can create an internship with complete assignment data",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const startDate = yesterday();
    const endDate = tomorrow();

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate,
        endDate,
        requiredHours: REQUIRED_HOURS,
      },
    );

    assertExists(internship.id);
    assertEquals(internship.student_id, student.id);
    assertEquals(internship.hte_id, hte.id);
    assertEquals(internship.faculty_adviser_id, facultyAdviserId);
    assertEquals(internship.required_hours, REQUIRED_HOURS);
    assertEquals(internship.start_date, startDate);
    assertEquals(internship.end_date, endDate);
    assertEquals(internship.status, "pending");
    assertExists(internship.created_at);
    assertExists(internship.updated_at);
  },
);

// ============================================================
// Test 3 — Retrieve
// ============================================================

Deno.test("FR-05 administrator can retrieve an internship", async () => {
  await setupTestUsers();

  const facultyAdviserId = await ensureTestFacultyAdviser();
  const student = await ensureTestStudentProfile();

  const { response: loginResponse, body: loginBody } = await login();

  assertEquals(loginResponse.status, 200);

  const hte = await createTestHte(loginBody.data.accessToken);

  const internship = await createTestInternship(
    loginBody.data.accessToken,
    student.id,
    hte.id,
    facultyAdviserId,
  );

  const response = await authenticatedRequest(
    `/api/v1/internships/${internship.id}`,
    loginBody.data.accessToken,
  );

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.data.id, internship.id);
  assertEquals(body.data.student_id, student.id);
  assertEquals(body.data.hte_id, hte.id);
  assertEquals(body.data.faculty_adviser_id, facultyAdviserId);
  assertEquals(body.data.required_hours, REQUIRED_HOURS);
});

// ============================================================
// Test 4 — Student retrieve own
// ============================================================

Deno.test("FR-05 student can retrieve own internship", async () => {
  await setupTestUsers();

  const facultyAdviserId = await ensureTestFacultyAdviser();
  const student = await ensureTestStudentProfile();

  const { response: adminLoginResponse, body: adminLoginBody } = await login();

  assertEquals(adminLoginResponse.status, 200);

  const hte = await createTestHte(adminLoginBody.data.accessToken);

  const internship = await createTestInternship(
    adminLoginBody.data.accessToken,
    student.id,
    hte.id,
    facultyAdviserId,
  );

  const { response: studentLoginResponse, body: studentLoginBody } = await login(
    TEST_USERS.student.email,
    TEST_USERS.student.password,
  );

  assertEquals(studentLoginResponse.status, 200);

  const response = await authenticatedRequest(
    "/api/v1/internships/me",
    studentLoginBody.data.accessToken,
  );

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.data.id, internship.id);
  assertEquals(body.data.student_id, student.id);
});

// ============================================================
// Test 5 — Update required hours
// ============================================================

Deno.test(
  "FR-05 administrator can update required internship hours",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
    );

    const { response, body } = await updateInternship(
      loginBody.data.accessToken,
      internship.id,
      {
        requiredHours: 500,
      },
    );

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.id, internship.id);
    assertEquals(body.data.required_hours, 500);
  },
);

// ============================================================
// Test 6 — Update HTE
// ============================================================

Deno.test(
  "FR-05 administrator can update internship HTE assignment",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const firstHte = await createTestHte(loginBody.data.accessToken);
    const secondHte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      firstHte.id,
      facultyAdviserId,
    );

    const { response, body } = await updateInternship(
      loginBody.data.accessToken,
      internship.id,
      {
        hteId: secondHte.id,
      },
    );

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.id, internship.id);
    assertEquals(body.data.hte_id, secondHte.id);
  },
);

// ============================================================
// Test 7 — Update complete assignment fields
// ============================================================

Deno.test(
  "FR-05 administrator can update faculty adviser, dates, and required hours",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
    );

    const newStartDate = today();
    const newEndDate = daysFromNow(7);
    const newRequiredHours = 500;

    const { response, body } = await updateInternship(
      loginBody.data.accessToken,
      internship.id,
      {
        facultyAdviserId,
        startDate: newStartDate,
        endDate: newEndDate,
        requiredHours: newRequiredHours,
      },
    );

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.id, internship.id);
    assertEquals(body.data.faculty_adviser_id, facultyAdviserId);
    assertEquals(body.data.start_date, newStartDate);
    assertEquals(body.data.end_date, newEndDate);
    assertEquals(body.data.required_hours, newRequiredHours);
  },
);

// ============================================================
// Test 8 — Student cannot update
// ============================================================

Deno.test("FR-05 student cannot update an internship assignment", async () => {
  await setupTestUsers();

  const facultyAdviserId = await ensureTestFacultyAdviser();
  const student = await ensureTestStudentProfile();

  const { response: adminLoginResponse, body: adminLoginBody } = await login();

  assertEquals(adminLoginResponse.status, 200);

  const hte = await createTestHte(adminLoginBody.data.accessToken);

  const internship = await createTestInternship(
    adminLoginBody.data.accessToken,
    student.id,
    hte.id,
    facultyAdviserId,
  );

  const { response: studentLoginResponse, body: studentLoginBody } = await login(
    TEST_USERS.student.email,
    TEST_USERS.student.password,
  );

  assertEquals(studentLoginResponse.status, 200);

  const { response } = await updateInternship(
    studentLoginBody.data.accessToken,
    internship.id,
    {
      requiredHours: 500,
    },
  );

  assertEquals(response.status, 403);
});

// ============================================================
// Test 9 — Pending -> active inside period
// ============================================================

Deno.test(
  "FR-05 pending internship can become active when today is within the internship period",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: yesterday(),
        endDate: tomorrow(),
      },
    );

    const { response, body } = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.status, "active");
  },
);

// ============================================================
// Test 10 — Activation before start
// ============================================================

Deno.test(
  "FR-05 pending internship cannot become active before its start date",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: tomorrow(),
        endDate: daysFromNow(7),
      },
    );

    const { response } = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(response.status, 400);
  },
);

// ============================================================
// Test 11 — Activation after end
// ============================================================

Deno.test(
  "FR-05 pending internship cannot become active after its end date",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: daysFromNow(-7),
        endDate: yesterday(),
      },
    );

    const { response } = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(response.status, 400);
  },
);

// ============================================================
// Test 12 — Active -> completed before end
// ============================================================

Deno.test(
  "FR-05 active internship cannot become completed before its end date",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: yesterday(),
        endDate: tomorrow(),
      },
    );

    const activated = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(activated.response.status, 200);

    const completed = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "completed",
    );

    assertEquals(completed.response.status, 400);
  },
);

// ============================================================
// Test 13 — Active -> completed after end but insufficient hours
// ============================================================

Deno.test(
  "FR-05 active internship cannot become completed after end date when required hours are not met",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: daysFromNow(-10),
        endDate: tomorrow(),
        requiredHours: REQUIRED_HOURS,
      },
    );

    const activated = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(activated.response.status, 200);

    await setInternshipEndDate(internship.id, yesterday());

    const completed = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "completed",
    );

    assertEquals(completed.response.status, 400);
  },
);

// ============================================================
// Test 14 — Active -> completed after end with enough hours
// ============================================================

Deno.test(
  "FR-05 active internship can become completed after end date when validated rendered hours meet requirements",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: daysFromNow(-10),
        endDate: tomorrow(),
        requiredHours: 8,
      },
    );

    const activated = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(activated.response.status, 200);

    const adminId = await getTestUserId(TEST_USERS.admin.email);

    await createValidatedAttendance(internship.id, adminId, yesterday());

    await setInternshipEndDate(internship.id, yesterday());

    const completed = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "completed",
    );

    assertEquals(completed.response.status, 200);
    assertEquals(completed.body.success, true);
    assertEquals(completed.body.data.status, "completed");
  },
);

// ============================================================
// Test 15 — No automatic completion
// ============================================================

Deno.test(
  "FR-05 active internship is not automatically completed when its end date passes",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: daysFromNow(-10),
        endDate: tomorrow(),
      },
    );

    const activated = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(activated.response.status, 200);

    await setInternshipEndDate(internship.id, yesterday());

    const response = await authenticatedRequest(
      `/api/v1/internships/${internship.id}`,
      loginBody.data.accessToken,
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.status, "active");
  },
);

// ============================================================
// Test 16 — Pending -> completed invalid
// ============================================================

Deno.test(
  "FR-05 invalid pending to completed transition should be rejected",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
    );

    const { response } = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "completed",
    );

    assertEquals(response.status, 400);
  },
);

// ============================================================
// Test 17 — Completed cannot transition
// ============================================================

Deno.test(
  "FR-05 completed internship cannot transition to another status",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: daysFromNow(-10),
        endDate: tomorrow(),
        requiredHours: 8,
      },
    );

    const activated = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(activated.response.status, 200);

    const adminId = await getTestUserId(TEST_USERS.admin.email);

    await createValidatedAttendance(internship.id, adminId, yesterday());

    await setInternshipEndDate(internship.id, yesterday());

    const completed = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "completed",
    );

    assertEquals(completed.response.status, 200);

    const { response } = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(response.status, 400);
  },
);

// ============================================================
// Test 18 — Unauthenticated list
// ============================================================

Deno.test("FR-05 unauthenticated user cannot list internships", async () => {
  await setupTestUsers();

  const response = await app.request("/api/v1/internships");

  assertEquals(response.status, 401);
});

// ============================================================
// Test 19 — Student cannot list
// ============================================================

Deno.test("FR-05 student cannot manage internship list", async () => {
  await setupTestUsers();
  await ensureTestStudentProfile();

  const { response: studentLoginResponse, body: studentLoginBody } = await login(
    TEST_USERS.student.email,
    TEST_USERS.student.password,
  );

  assertEquals(studentLoginResponse.status, 200);

  const response = await authenticatedRequest(
    "/api/v1/internships",
    studentLoginBody.data.accessToken,
  );

  assertEquals(response.status, 403);
});

// ============================================================
// Test 20 — Student cannot create
// ============================================================

Deno.test("FR-05 student cannot create an internship assignment", async () => {
  await setupTestUsers();

  const facultyAdviserId = await ensureTestFacultyAdviser();
  const student = await ensureTestStudentProfile();

  const { response: adminLoginResponse, body: adminLoginBody } = await login();

  assertEquals(adminLoginResponse.status, 200);

  const hte = await createTestHte(adminLoginBody.data.accessToken);

  const { response: studentLoginResponse, body: studentLoginBody } = await login(
    TEST_USERS.student.email,
    TEST_USERS.student.password,
  );

  assertEquals(studentLoginResponse.status, 200);

  const response = await authenticatedRequest(
    "/api/v1/internships",
    studentLoginBody.data.accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentId: student.id,
        hteId: hte.id,
        facultyAdviserId,
        startDate: yesterday(),
        endDate: tomorrow(),
        requiredHours: REQUIRED_HOURS,
      }),
    },
  );

  assertEquals(response.status, 403);
});

// ============================================================
// Test 21 — One operational internship
// ============================================================

Deno.test(
  "FR-05 student cannot have more than one operational internship",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const firstHte = await createTestHte(loginBody.data.accessToken);
    const secondHte = await createTestHte(loginBody.data.accessToken);

    await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      firstHte.id,
      facultyAdviserId,
    );

    const response = await authenticatedRequest(
      "/api/v1/internships",
      loginBody.data.accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: student.id,
          hteId: secondHte.id,
          facultyAdviserId,
          startDate: yesterday(),
          endDate: tomorrow(),
          requiredHours: REQUIRED_HOURS,
        }),
      },
    );

    assertEquals(response.status, 409);
  },
);

// ============================================================
// Test 22 — Completed internship can be historical
// ============================================================

Deno.test(
  "FR-05 student can have another internship after a previous internship is completed",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const firstHte = await createTestHte(loginBody.data.accessToken);
    const secondHte = await createTestHte(loginBody.data.accessToken);

    const firstInternship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      firstHte.id,
      facultyAdviserId,
      {
        startDate: daysFromNow(-10),
        endDate: tomorrow(),
        requiredHours: 8,
      },
    );

    const activated = await updateInternshipStatus(
      loginBody.data.accessToken,
      firstInternship.id,
      "active",
    );

    assertEquals(activated.response.status, 200);

    const adminId = await getTestUserId(TEST_USERS.admin.email);

    await createValidatedAttendance(firstInternship.id, adminId, yesterday());

    await setInternshipEndDate(firstInternship.id, yesterday());

    const completed = await updateInternshipStatus(
      loginBody.data.accessToken,
      firstInternship.id,
      "completed",
    );

    assertEquals(completed.response.status, 200);

    const secondInternship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      secondHte.id,
      facultyAdviserId,
      {
        startDate: today(),
        endDate: daysFromNow(30),
        requiredHours: REQUIRED_HOURS,
      },
    );

    assertExists(secondInternship.id);
    assertEquals(secondInternship.student_id, student.id);
    assertEquals(secondInternship.status, "pending");
  },
);

// ============================================================
// Test 23 — Invalid date range
// ============================================================

Deno.test(
  "FR-05 invalid internship date range should be rejected",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const response = await authenticatedRequest(
      "/api/v1/internships",
      loginBody.data.accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: student.id,
          hteId: hte.id,
          facultyAdviserId,
          startDate: tomorrow(),
          endDate: yesterday(),
          requiredHours: REQUIRED_HOURS,
        }),
      },
    );

    assertEquals(response.status, 400);
  },
);

// ============================================================
// Test 24 — Missing required fields
// ============================================================

Deno.test(
  "FR-05 missing required internship assignment fields should be rejected",
  async () => {
    await setupTestUsers();

    await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const response = await authenticatedRequest(
      "/api/v1/internships",
      loginBody.data.accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: student.id,
          hteId: hte.id,
        }),
      },
    );

    assertEquals(response.status, 400);
  },
);

// ============================================================
// Test 25 — Invalid required hours
// ============================================================

Deno.test(
  "FR-05 invalid required internship hours should be rejected",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const response = await authenticatedRequest(
      "/api/v1/internships",
      loginBody.data.accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: student.id,
          hteId: hte.id,
          facultyAdviserId,
          startDate: yesterday(),
          endDate: tomorrow(),
          requiredHours: 0,
        }),
      },
    );

    assertEquals(response.status, 400);
  },
);

// ============================================================
// Test 26 — Non-existent internship
// ============================================================

Deno.test("FR-05 non-existent internship should return 404", async () => {
  await setupTestUsers();

  const { response: loginResponse, body: loginBody } = await login();

  assertEquals(loginResponse.status, 200);

  const response = await authenticatedRequest(
    "/api/v1/internships/00000000-0000-0000-0000-000000000000",
    loginBody.data.accessToken,
  );

  assertEquals(response.status, 404);
});

// ============================================================
// Test 27 — Empty update
// ============================================================

Deno.test("FR-05 empty internship update should be rejected", async () => {
  await setupTestUsers();

  const facultyAdviserId = await ensureTestFacultyAdviser();
  const student = await ensureTestStudentProfile();

  const { response: loginResponse, body: loginBody } = await login();

  assertEquals(loginResponse.status, 200);

  const hte = await createTestHte(loginBody.data.accessToken);

  const internship = await createTestInternship(
    loginBody.data.accessToken,
    student.id,
    hte.id,
    facultyAdviserId,
  );

  const { response } = await updateInternship(
    loginBody.data.accessToken,
    internship.id,
    {},
  );

  assertEquals(response.status, 400);
});

// ============================================================
// Test 28 — Invalid backward transition
// ============================================================

Deno.test(
  "FR-05 active internship cannot transition back to pending",
  async () => {
    await setupTestUsers();

    const facultyAdviserId = await ensureTestFacultyAdviser();
    const student = await ensureTestStudentProfile();

    const { response: loginResponse, body: loginBody } = await login();

    assertEquals(loginResponse.status, 200);

    const hte = await createTestHte(loginBody.data.accessToken);

    const internship = await createTestInternship(
      loginBody.data.accessToken,
      student.id,
      hte.id,
      facultyAdviserId,
      {
        startDate: yesterday(),
        endDate: tomorrow(),
      },
    );

    const activated = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "active",
    );

    assertEquals(activated.response.status, 200);

    const { response } = await updateInternshipStatus(
      loginBody.data.accessToken,
      internship.id,
      "pending",
    );

    assertEquals(response.status, 400);
  },
);
