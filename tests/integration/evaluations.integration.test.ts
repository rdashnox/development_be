import { assertEquals, assertExists } from "@std/assert";

import { createApp } from "../../src/app.ts";
import { createSupabaseClients } from "../../src/lib/supabase.ts";
import { loadEnv } from "../../src/config/env.ts";
import { getDenoEnv } from "../../src/config/runtime.ts";

import { setupTestUsers } from "../helpers/test-user.setup.ts";
import { TEST_USERS } from "../fixtures/test-users.ts";

const env = loadEnv(getDenoEnv());
const app = createApp(env);
const { supabaseAdmin } = createSupabaseClients(env);

async function login(email: string, password: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
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

async function getTestUserId(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) throw error;

  const user = data.users.find(
    (item) => item.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!user) throw new Error(`Test user not found: ${email}`);

  return user.id;
}

async function ensureTestStudent() {
  const studentId = await getTestUserId(TEST_USERS.student.email);

  // The test student has a unique internship constraint.
  await supabaseAdmin.from("internships").delete().eq("student_id", studentId);

  const { data, error } = await supabaseAdmin
    .from("student_profiles")
    .upsert(
      {
        id: studentId,
        student_number: `FR08-${crypto.randomUUID()}`,
        program: "BSIT",
        year_level: 4,
        section: "A",
        contact_number: "09171234567",
        address: "Test Address, Bulacan",
        emergency_contact_name: "Test Emergency Contact",
        emergency_contact_number: "09179876543",
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create test student profile.");
  }

  return data;
}

async function createTestHte(adminToken: string) {
  const response = await authenticatedRequest("/api/v1/htes", adminToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: `FR08 Integration HTE ${crypto.randomUUID()}`,
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

async function assignSupervisorForTest(hteId: string, supervisorId: string) {
  /*
   * hte_profiles.supervisor_id is UNIQUE.
   *
   * Clear an old FR-08 assignment first so a previous interrupted test
   * cannot make the next fixture fail.
   */
  const { error: clearError } = await supabaseAdmin
    .from("hte_profiles")
    .update({ supervisor_id: null })
    .eq("supervisor_id", supervisorId);

  if (clearError) throw clearError;

  const { data, error } = await supabaseAdmin
    .from("hte_profiles")
    .update({ supervisor_id: supervisorId })
    .eq("id", hteId)
    .select("id, supervisor_id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to assign test HTE supervisor.");
  }
}

async function createTestInternship(
  adminToken: string,
  studentId: string,
  hteId: string,
) {
  const response = await authenticatedRequest(
    "/api/v1/internships",
    adminToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        hteId,
      }),
    },
  );

  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data;
}

async function activateInternship(adminToken: string, internshipId: string) {
  const response = await authenticatedRequest(
    `/api/v1/internships/${internshipId}/status`,
    adminToken,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    },
  );

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.data.status, "active");
}

async function createScenario() {
  await setupTestUsers();

  const student = await ensureTestStudent();

  const { response: adminResponse, body: adminBody } = await login(
    TEST_USERS.admin.email,
    TEST_USERS.admin.password,
  );

  assertEquals(adminResponse.status, 200);

  const adminToken = adminBody.data.accessToken;
  const supervisorId = await getTestUserId(TEST_USERS.hteSupervisor.email);

  const hte = await createTestHte(adminToken);
  await assignSupervisorForTest(hte.id, supervisorId);

  const internship = await createTestInternship(adminToken, student.id, hte.id);

  await activateInternship(adminToken, internship.id);

  return {
    adminToken,
    hteId: hte.id,
    internshipId: internship.id,
  };
}

async function cleanupScenario(internshipId: string, hteId: string) {
  await supabaseAdmin.from("internships").delete().eq("id", internshipId);

  await supabaseAdmin.from("hte_profiles").delete().eq("id", hteId);
}

async function withScenario(
  test: (scenario: Awaited<ReturnType<typeof createScenario>>) => Promise<void>,
) {
  const scenario = await createScenario();

  try {
    await test(scenario);
  } finally {
    await cleanupScenario(scenario.internshipId, scenario.hteId);
  }
}

async function createEvaluation(
  token: string,
  internshipId: string,
  responses: Record<string, number> = {
    criterion_1: 5,
    criterion_2: 4,
  },
) {
  return await authenticatedRequest("/api/v1/evaluations", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      internship_id: internshipId,
      evaluation_type: "hte_supervisor",
      responses,
      comments: "Good performance.",
    }),
  });
}

Deno.test("FR-08 unauthenticated request is rejected", async () => {
  const response = await app.request("/api/v1/evaluations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      internship_id: crypto.randomUUID(),
      responses: { criterion_1: 5 },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        internship_id: crypto.randomUUID(),
        responses: { criterion_1: 5 },
      }),
    },
  );

  assertEquals(evaluationResponse.status, 403);
});

Deno.test(
  "FR-08 HTE Supervisor can create an evaluation for assigned intern",
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
        {
          criterion_1: 5,
          criterion_2: 4,
          criterion_3: 5,
        },
      );

      const evaluation = await evaluationResponse.json();

      assertEquals(evaluationResponse.status, 201);
      assertEquals(evaluation.success, true);
      assertExists(evaluation.data);
      assertEquals(evaluation.data.internship_id, internshipId);
      assertEquals(evaluation.data.evaluator_id, body.data.user.id);
      assertEquals(evaluation.data.evaluation_type, "hte_supervisor");
      assertEquals(evaluation.data.status, "draft");
    });
  },
);

Deno.test(
  "FR-08 unrelated HTE Supervisor cannot create an evaluation",
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
        { criterion_1: 5 },
      );

      assertEquals(evaluationResponse.status, 403);
    });
  },
);

Deno.test("FR-08 duplicate evaluation is rejected", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const first = await createEvaluation(body.data.accessToken, internshipId);
    assertEquals(first.status, 201);

    const second = await createEvaluation(body.data.accessToken, internshipId);
    assertEquals(second.status, 409);
  });
});

Deno.test("FR-08 HTE Supervisor can retrieve own evaluations", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
    );
    assertEquals(createResponse.status, 201);

    const myEvaluationsResponse = await authenticatedRequest(
      "/api/v1/evaluations/me",
      body.data.accessToken,
    );

    const result = await myEvaluationsResponse.json();

    assertEquals(myEvaluationsResponse.status, 200);
    assertEquals(result.success, true);
    assertExists(result.data);
    assertEquals(
      result.data.some(
        (evaluation: { internship_id: string }) => evaluation.internship_id === internshipId,
      ),
      true,
    );
  });
});

Deno.test(
  "FR-08 HTE Supervisor can retrieve evaluation by internship",
  async () => {
    await withScenario(async ({ internshipId }) => {
      const { response, body } = await login(
        TEST_USERS.hteSupervisor.email,
        TEST_USERS.hteSupervisor.password,
      );

      assertEquals(response.status, 200);

      const createResponse = await createEvaluation(
        body.data.accessToken,
        internshipId,
      );
      assertEquals(createResponse.status, 201);

      const responseByInternship = await authenticatedRequest(
        `/api/v1/evaluations/internship/${internshipId}`,
        body.data.accessToken,
      );

      const result = await responseByInternship.json();

      assertEquals(responseByInternship.status, 200);
      assertEquals(result.success, true);
      assertEquals(result.data.length, 1);
      assertEquals(result.data[0].internship_id, internshipId);
    });
  },
);

Deno.test("FR-08 HTE Supervisor can update own draft evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
      { criterion_1: 4 },
    );
    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const updateResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      body.data.accessToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
    );
    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const submitResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      { method: "POST" },
    );

    assertEquals(submitResponse.status, 200);

    const updateResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}`,
      body.data.accessToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: "Should fail." }),
      },
    );

    assertEquals(updateResponse.status, 400);
  });
});

Deno.test("FR-08 HTE Supervisor can submit evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response, body } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(response.status, 200);

    const createResponse = await createEvaluation(
      body.data.accessToken,
      internshipId,
    );
    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const submitResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      { method: "POST" },
    );

    const result = await submitResponse.json();

    assertEquals(submitResponse.status, 200);
    assertEquals(result.success, true);
    assertEquals(result.data.status, "submitted");
    assertExists(result.data.submitted_at);
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
      { criterion_1: 5 },
    );
    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const firstSubmit = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      { method: "POST" },
    );
    assertEquals(firstSubmit.status, 200);

    const secondSubmit = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      body.data.accessToken,
      { method: "POST" },
    );

    assertEquals(secondSubmit.status, 400);
  });
});

Deno.test("FR-08 student can retrieve submitted evaluation", async () => {
  await withScenario(async ({ internshipId }) => {
    const { response: supervisorResponse, body: supervisorBody } = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(supervisorResponse.status, 200);

    const createResponse = await createEvaluation(
      supervisorBody.data.accessToken,
      internshipId,
    );
    const createBody = await createResponse.json();

    assertEquals(createResponse.status, 201);

    const submitResponse = await authenticatedRequest(
      `/api/v1/evaluations/${createBody.data.id}/submit`,
      supervisorBody.data.accessToken,
      { method: "POST" },
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
    assertEquals(result.data.id, createBody.data.id);
    assertEquals(result.data.status, "submitted");
  });
});
