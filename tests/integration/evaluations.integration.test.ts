import { assertEquals, assertExists } from "@std/assert";

import type { User } from "@supabase/supabase-js";

import { createApp } from "../../src/app.ts";
import { createSupabaseClients } from "../../src/lib/supabase.ts";
import { loadEnv } from "../../src/config/env.ts";
import { getDenoEnv } from "../../src/config/runtime.ts";

import { setupTestUsers } from "../helpers/test-user.setup.ts";
import { TEST_USERS } from "../fixtures/test-users.ts";

const env = {
  ...loadEnv(getDenoEnv()),
  ENVIRONMENT: "test" as const,
  RATE_LIMIT_ENABLED: false,
};

const app = createApp(env);

const { supabaseAdmin } = createSupabaseClients(env);

const FACULTY_ADVISER = {
  email: "sbims-test-faculty-adviser@maildrop.cc",
  password: "TestPassword2026!",
  firstName: "Test",
  lastName: "Faculty Adviser",
};

type Scenario = {
  studentId: string;
  hteId: string;
  hteSupervisorId: string;
  facultyAdviserId: string;
  internshipId: string;
};

type MockEligibilityService = {
  checkFinalEligibility: (
    internshipId: string,
  ) => Promise<{
    eligible: boolean;
    reason?: string;
  }>;
};

async function login(email: string, password: string) {
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

  return {
    response,
    body: await response.json(),
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

async function findAuthUser(email: string): Promise<User | undefined> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    throw error;
  }

  return data.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
}

async function ensureFacultyAdviser(config: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  let user = await findAuthUser(config.email);

  if (!user) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: config.email,
      password: config.password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw error ?? new Error("Unable to create faculty adviser test user.");
    }

    user = data.user;
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: user.id,
      email: config.email,
      first_name: config.firstName,
      middle_name: null,
      last_name: config.lastName,
      suffix: null,
      role: "faculty_adviser",
      is_active: true,
      must_change_password: false,
    },
    {
      onConflict: "id",
    },
  );

  if (profileError) {
    throw profileError;
  }

  return user.id;
}

async function getTestUserId(email: string): Promise<string> {
  const user = await findAuthUser(email);

  if (!user) {
    throw new Error(`Test user not found: ${email}`);
  }

  return user.id;
}

async function ensureTestStudent(): Promise<string> {
  const studentId = await getTestUserId(TEST_USERS.student.email);

  const { error } = await supabaseAdmin.from("student_profiles").upsert(
    {
      id: studentId,
      student_number: `FR08-${crypto.randomUUID()}`,
      program: "BSIT",
      year_level: 4,
      section: "A",
      contact_number: "09171234567",
      address: "Test Address",
      emergency_contact_name: "Test Emergency Contact",
      emergency_contact_number: "09179876543",
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    throw error;
  }

  return studentId;
}

async function createTestHte(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("hte_profiles")
    .insert({
      company_name: `FR08 Evaluation HTE ${crypto.randomUUID()}`,
      address: "Test Address",
      contact_person: "Test Contact",
      contact_email: "contact@example.com",
      contact_number: "09171234567",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create test HTE.");
  }

  return data.id;
}

async function assignHteSupervisor(hteId: string, supervisorId: string) {
  const { error: clearError } = await supabaseAdmin
    .from("hte_profiles")
    .update({
      supervisor_id: null,
    })
    .eq("supervisor_id", supervisorId);

  if (clearError) {
    throw clearError;
  }

  const { error } = await supabaseAdmin
    .from("hte_profiles")
    .update({
      supervisor_id: supervisorId,
    })
    .eq("id", hteId);

  if (error) {
    throw error;
  }
}

async function createEligibleInternship(
  studentId: string,
  hteId: string,
  facultyAdviserId: string,
) {
  /*
   * The current date is 2026-09-13.
   *
   * End date is 2026-09-12, so the internship period
   * has already ended.
   *
   * One validated 08:00-17:00 record produces
   * 8 rendered hours after the standard 1-hour
   * meal break.
   */
  const { data, error } = await supabaseAdmin
    .from("internships")
    .insert({
      student_id: studentId,
      hte_id: hteId,
      faculty_adviser_id: facultyAdviserId,
      start_date: "2026-08-01",
      end_date: "2026-09-12",
      required_hours: 8,
      status: "completed",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create eligible internship.");
  }

  const { error: attendanceError } = await supabaseAdmin
    .from("attendance_records")
    .insert({
      internship_id: data.id,
      attendance_date: "2026-09-12",
      time_in: "08:00:00",
      time_out: "17:00:00",
      validation_status: "validated",
      validated_by: studentId,
      validated_at: "2026-09-12T17:00:00+08:00",
    });

  if (attendanceError) {
    throw attendanceError;
  }

  return data;
}

async function createScenario(): Promise<Scenario> {
  await setupTestUsers();

  const studentId = await ensureTestStudent();

  const hteSupervisorId = await getTestUserId(TEST_USERS.hteSupervisor.email);

  const facultyAdviserId = await ensureFacultyAdviser(FACULTY_ADVISER);

  const hteId = await createTestHte();

  await assignHteSupervisor(hteId, hteSupervisorId);

  const internship = await createEligibleInternship(
    studentId,
    hteId,
    facultyAdviserId,
  );

  return {
    studentId,
    hteId,
    hteSupervisorId,
    facultyAdviserId,
    internshipId: internship.id,
  };
}

async function cleanupScenario(scenario: Scenario) {
  await supabaseAdmin
    .from("internships")
    .delete()
    .eq("id", scenario.internshipId);

  await supabaseAdmin
    .from("hte_profiles")
    .update({
      supervisor_id: null,
    })
    .eq("id", scenario.hteId);

  await supabaseAdmin.from("hte_profiles").delete().eq("id", scenario.hteId);
}

async function withScenario(test: (scenario: Scenario) => Promise<void>) {
  const scenario = await createScenario();

  try {
    await test(scenario);
  } finally {
    await cleanupScenario(scenario);
  }
}

async function createEvaluation(
  token: string,
  internshipId: string,
  evaluationType: "hte_supervisor" | "faculty_adviser",
) {
  return await authenticatedRequest("/api/v1/evaluations", token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      internship_id: internshipId,
      evaluation_type: evaluationType,
      responses: {
        criterion_1: 5,
        criterion_2: 4,
      },
      comments: "Good performance.",
    }),
  });
}

/*
 * =========================================================
 * AUTHORIZATION
 * =========================================================
 */

Deno.test("FR-08 unauthenticated evaluation request is rejected", async () => {
  const response = await app.request("/api/v1/evaluations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      internship_id: crypto.randomUUID(),
      responses: {
        criterion_1: 5,
      },
    }),
  });

  assertEquals(response.status, 401);
});

Deno.test("FR-08 student cannot create an evaluation", async () => {
  await setupTestUsers();

  const { response, body } = await login(
    TEST_USERS.student.email,
    TEST_USERS.student.password,
  );

  assertEquals(response.status, 200);

  const evaluationResponse = await authenticatedRequest(
    "/api/v1/evaluations",
    body.data.accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        internship_id: crypto.randomUUID(),
        evaluation_type: "hte_supervisor",
        responses: {
          criterion_1: 5,
        },
      }),
    },
  );

  assertEquals(evaluationResponse.status, 403);
});

/*
 * =========================================================
 * CREATE
 * =========================================================
 */

Deno.test("FR-08 HTE Supervisor can create HTE evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const evaluationResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const result = await evaluationResponse.json();

    assertEquals(evaluationResponse.status, 201);

    assertEquals(result.success, true);

    assertEquals(result.data.internship_id, internshipId);

    assertEquals(result.data.evaluation_type, "hte_supervisor");

    assertEquals(result.data.status, "draft");
  });
});

Deno.test(
  "FR-08 Faculty Adviser can create Faculty Adviser evaluation",
  async () => {
    await withScenario(async ({ internshipId }) => {
      const { response, body } = await login(
        FACULTY_ADVISER.email,
        FACULTY_ADVISER.password,
      );

      assertEquals(response.status, 200);

      const evaluationResponse = await createEvaluation(
        body.data.accessToken,
        internshipId,
        "faculty_adviser",
      );

      const result = await evaluationResponse.json();

      assertEquals(evaluationResponse.status, 201);

      assertEquals(result.success, true);

      assertEquals(result.data.evaluation_type, "faculty_adviser");

      assertEquals(result.data.status, "draft");
    });
  },
);

Deno.test(
  "FR-08 HTE Supervisor cannot create Faculty Adviser evaluation",
  async () => {
    await withScenario(async ({ internshipId }) => {
      const { response, body } = await login(
        TEST_USERS.hteSupervisor.email,
        TEST_USERS.hteSupervisor.password,
      );

      assertEquals(response.status, 200);

      const evaluationResponse = await createEvaluation(
        body.data.accessToken,
        internshipId,
        "faculty_adviser",
      );

      assertEquals(evaluationResponse.status, 403);
    });
  },
);

Deno.test(
  "FR-08 Faculty Adviser cannot create HTE Supervisor evaluation",
  async () => {
    await withScenario(async ({ internshipId }) => {
      const { response, body } = await login(
        FACULTY_ADVISER.email,
        FACULTY_ADVISER.password,
      );

      assertEquals(response.status, 200);

      const evaluationResponse = await createEvaluation(
        body.data.accessToken,
        internshipId,
        "hte_supervisor",
      );

      assertEquals(evaluationResponse.status, 403);
    });
  },
);

Deno.test(
  "FR-08 unrelated HTE Supervisor cannot create evaluation",
  async () => {
    await withScenario(async ({ internshipId }) => {
      const { response, body } = await login(
        TEST_USERS.otherHteSupervisor.email,
        TEST_USERS.otherHteSupervisor.password,
      );

      assertEquals(response.status, 200);

      const evaluationResponse = await createEvaluation(
        body.data.accessToken,
        internshipId,
        "hte_supervisor",
      );

      assertEquals(evaluationResponse.status, 403);
    });
  },
);

/* Deno.test(
  "FR-08 evaluation cannot be created before internship eligibility",
  async () => {
    await setupTestUsers();

    const studentId = await ensureTestStudent();

    const hteSupervisorId = await getTestUserId(TEST_USERS.hteSupervisor.email);

    const facultyAdviserId = await ensureFacultyAdviser(FACULTY_ADVISER);

    const hteId = await createTestHte();

    await assignHteSupervisor(hteId, hteSupervisorId);

    const { data: internship, error } = await supabaseAdmin
      .from("internships")
      .insert({
        student_id: studentId,
        hte_id: hteId,
        faculty_adviser_id: facultyAdviserId,
        start_date: "2026-08-01",
        end_date: "2026-09-30",
        required_hours: 8,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !internship) {
      throw error ?? new Error("Unable to create test internship.");
    }

    try {
      const { response, body } = await login(
        TEST_USERS.hteSupervisor.email,
        TEST_USERS.hteSupervisor.password,
      );

      assertEquals(response.status, 200);

      const evaluationResponse = await createEvaluation(
        body.data.accessToken,
        internship.id,
        "hte_supervisor",
      );

      assertEquals(evaluationResponse.status, 400);
    } finally {
      await supabaseAdmin.from("internships").delete().eq("id", internship.id);

      await supabaseAdmin
        .from("hte_profiles")
        .update({
          supervisor_id: null,
        })
        .eq("id", hteId);

      await supabaseAdmin.from("hte_profiles").delete().eq("id", hteId);
    }
  },
); */

/*
 * =========================================================
 * DUPLICATES
 * =========================================================
 */

Deno.test("FR-08 same evaluation type cannot be created twice", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const first = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    assertEquals(first.status, 201);

    const second = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    assertEquals(second.status, 409);
  });
});

Deno.test("FR-08 HTE and Faculty Adviser evaluations can coexist", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response: hteResponse, body: hteBody } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(hteResponse.status, 200);

    const hteEvaluation = await createEvaluation(
      hteBody.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    assertEquals(hteEvaluation.status, 201);

    const { response: facultyResponse, body: facultyBody } = await login(
      FACULTY_ADVISER.email,
      FACULTY_ADVISER.password,
    );

    assertEquals(facultyResponse.status, 200);

    const facultyEvaluation = await createEvaluation(
      facultyBody.data.accessToken,
      internshipId,
      "faculty_adviser",
    );

    assertEquals(facultyEvaluation.status, 201);
  });
});

/*
 * =========================================================
 * READ
 * =========================================================
 */

Deno.test("FR-08 administrator can retrieve evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response: hteResponse, body: hteBody } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(hteResponse.status, 200);

    const createResponse = await createEvaluation(
      hteBody.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const { response: adminResponse, body: adminBody } = await login(
      TEST_USERS.admin.email,
      TEST_USERS.admin.password,
    );

    assertEquals(adminResponse.status, 200);

    const response = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      adminBody.data.accessToken,
    );

    const result = await response.json();

    assertEquals(response.status, 200);

    assertEquals(result.success, true);

    assertEquals(result.data.id, createBody.data.id);
  });
});

Deno.test("FR-08 internship coordinator can retrieve evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const { response: coordinatorResponse, body: coordinatorBody } = await login(
      TEST_USERS.coordinator.email,
      TEST_USERS.coordinator.password,
    );

    assertEquals(coordinatorResponse.status, 200);

    const coordinatorEvaluationResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      coordinatorBody.data.accessToken,
    );

    assertEquals(coordinatorEvaluationResponse.status, 200);
  });
});

/*
 * =========================================================
 * UPDATE
 * =========================================================
 */

Deno.test("FR-08 HTE Supervisor can update own draft", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const updateResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      body.data.accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          responses: {
            criterion_1: 5,
            criterion_2: 5,
          },
          comments: "Updated evaluation.",
        }),
      },
    );

    const result = await updateResponse.json();

    assertEquals(updateResponse.status, 200);

    assertEquals(result.success, true);

    assertEquals(result.data.status, "draft");

    assertEquals(result.data.responses.criterion_1, 5);
  });
});

Deno.test("FR-08 Faculty Adviser can update own draft", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      FACULTY_ADVISER.email,
      FACULTY_ADVISER.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "faculty_adviser",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const updateResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      body.data.accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comments: "Faculty update.",
        }),
      },
    );

    assertEquals(updateResponse.status, 200);
  });
});

/*
 * =========================================================
 * SUBMIT
 * =========================================================
 */

Deno.test("FR-08 HTE Supervisor can submit eligible evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const submitResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      {
        method: "POST",
      },
    );

    const result = await submitResponse.json();

    assertEquals(submitResponse.status, 200);

    assertEquals(result.success, true);

    assertEquals(result.data.status, "submitted");

    assertExists(result.data.submitted_at);
  });
});

Deno.test("FR-08 Faculty Adviser can submit eligible evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      FACULTY_ADVISER.email,
      FACULTY_ADVISER.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "faculty_adviser",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const submitResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      {
        method: "POST",
      },
    );

    const result = await submitResponse.json();

    assertEquals(submitResponse.status, 200);

    assertEquals(result.success, true);

    assertEquals(result.data.status, "submitted");
  });
});

Deno.test("FR-08 student can retrieve submitted evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response: hteResponse, body: hteBody } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(hteResponse.status, 200);

    const createResponse = await createEvaluation(
      hteBody.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const submitResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      hteBody.data.accessToken,
      {
        method: "POST",
      },
    );

    assertEquals(submitResponse.status, 200);

    const { response: studentResponse, body: studentBody } = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentResponse.status, 200);

    const response = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      studentBody.data.accessToken,
    );

    const result = await response.json();

    assertEquals(response.status, 200);

    assertEquals(result.success, true);

    assertEquals(result.data.status, "submitted");
  });
});

Deno.test("FR-08 student cannot retrieve draft evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response: hteResponse, body: hteBody } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(hteResponse.status, 200);

    const createResponse = await createEvaluation(
      hteBody.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const { response: studentResponse, body: studentBody } = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentResponse.status, 200);

    const response = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      studentBody.data.accessToken,
    );

    assertEquals(response.status, 403);
  });
});

Deno.test("FR-08 submitted evaluation cannot be updated", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const submitResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      {
        method: "POST",
      },
    );

    assertEquals(submitResponse.status, 200);

    const updateResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      body.data.accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comments: "Should fail.",
        }),
      },
    );

    assertEquals(updateResponse.status, 400);
  });
});

Deno.test("FR-08 submitted evaluation cannot be submitted again", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      "hte_supervisor",
    );

    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const firstSubmit = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      {
        method: "POST",
      },
    );

    assertEquals(firstSubmit.status, 200);

    const secondSubmit = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      {
        method: "POST",
      },
    );

    assertEquals(secondSubmit.status, 400);
  });
});
