import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";

import { createApp } from "../../src/app.ts";
import { createSupabaseClients } from "../../src/lib/supabase.ts";
import { loadEnv } from "../../src/config/env.ts";
import { getDenoEnv } from "../../src/config/runtime.ts";

import { setupTestUsers } from "../helpers/test-user.setup.ts";
import { TEST_USERS } from "../fixtures/test-users.ts";

const env = loadEnv(getDenoEnv());
const app = createApp(env);
const { supabaseAdmin } = createSupabaseClients(env);

const STORAGE_BUCKET = "internship-documents";
const TEST_START_DATE = "2026-08-17";
const TEST_END_DATE = "2026-12-19";
const TEST_REQUIRED_HOURS = 150;

type DocumentRecord = {
  id: string;
  internship_id: string;
  document_type: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  status: string;
  uploaded_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
};

type TestInternship = {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  status: string;
};

async function login(
  email: string = TEST_USERS.admin.email,
  password: string = TEST_USERS.admin.password,
) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return { response, body: await response.json() };
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

async function getTestUserId(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;

  const user = data.users.find(
    (item) => item.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!user) throw new Error(`Test user not found: ${email}`);
  return user.id;
}

async function prepareStudent() {
  const studentId = await getTestUserId(TEST_USERS.student.email);

  const { error } = await supabaseAdmin
    .from("internships")
    .delete()
    .eq("student_id", studentId);

  if (error) throw error;

  const { data, error: profileError } = await supabaseAdmin
    .from("student_profiles")
    .upsert(
      {
        id: studentId,
        student_number: `DOC-${crypto.randomUUID()}`,
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

  if (profileError || !data) {
    throw profileError ?? new Error("Unable to prepare student profile.");
  }

  return data as { id: string };
}

async function createTestHte(token: string) {
  const response = await authenticatedRequest("/api/v1/htes", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: `Documents Test HTE ${crypto.randomUUID()}`,
      address: "Test Address, Bulacan",
      contactPerson: "Test Contact Person",
      contactEmail: `documents-${crypto.randomUUID()}@example.com`,
      contactNumber: "09171234567",
    }),
  });

  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data as { id: string };
}

async function createTestInternship(
  token: string,
  studentId: string,
  hteId: string,
  facultyAdviserId: string,
): Promise<TestInternship> {
  const response = await authenticatedRequest("/api/v1/internships", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId,
      hteId,
      facultyAdviserId,
      startDate: TEST_START_DATE,
      endDate: TEST_END_DATE,
      requiredHours: TEST_REQUIRED_HOURS,
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data as TestInternship;
}

async function activateInternship(token: string, internshipId: string) {
  const response = await authenticatedRequest(
    `/api/v1/internships/${internshipId}/status`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    },
  );

  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.data.status, "active");

  return body.data as TestInternship;
}

async function createTestFixture(
  requestedStatus: "pending" | "active" | "completed" = "active",
) {
  await setupTestUsers();

  const student = await prepareStudent();
  const adminLogin = await login();
  assertEquals(adminLogin.response.status, 200);
  assertEquals(adminLogin.body.success, true);

  const facultyAdviserId = await getTestUserId(TEST_USERS.facultyAdviser.email);
  const hte = await createTestHte(adminLogin.body.data.accessToken);

  let internship = await createTestInternship(
    adminLogin.body.data.accessToken,
    student.id,
    hte.id,
    facultyAdviserId,
  );

  if (requestedStatus !== "pending") {
    internship = await activateInternship(
      adminLogin.body.data.accessToken,
      internship.id,
    );
  }

  if (requestedStatus === "completed") {
    const { data, error } = await supabaseAdmin
      .from("internships")
      .update({ status: "completed" })
      .eq("id", internship.id)
      .select("*")
      .single();

    if (error || !data) {
      throw (
        error ?? new Error("Unable to prepare completed internship fixture.")
      );
    }

    internship = data as TestInternship;
  }

  return { student, internship, hteId: hte.id };
}

function createTestFile(
  name = "endorsement.pdf",
  type = "application/pdf",
  contents = "SBIMS documents integration test",
): File {
  return new File([contents], name, { type });
}

function createMultipartBody(
  internshipId: string,
  documentType: string,
  file?: File,
): FormData {
  const form = new FormData();
  form.append("internship_id", internshipId);
  form.append("document_type", documentType);
  if (file) form.append("file", file);
  return form;
}

async function uploadDocument(
  token: string,
  internshipId: string,
  documentType: string,
  file: File = createTestFile(),
) {
  const response = await authenticatedRequest("/api/v1/documents", token, {
    method: "POST",
    body: createMultipartBody(internshipId, documentType, file),
  });

  return { response, body: await response.json() };
}

async function getDocumentFromDatabase(
  documentId: string,
): Promise<DocumentRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  return data as DocumentRecord | null;
}

async function getDocumentsForInternship(
  internshipId: string,
): Promise<DocumentRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("internship_id", internshipId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DocumentRecord[];
}

async function cleanupFixture(internshipId: string, hteId: string) {
  const documents = await getDocumentsForInternship(internshipId);
  const storagePaths = [
    ...new Set(documents.map((document) => document.storage_path)),
  ];

  if (storagePaths.length > 0) {
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove(storagePaths);
    if (error) console.error("DOCUMENT TEST STORAGE CLEANUP FAILED:", error);
  }

  const { error: internshipError } = await supabaseAdmin
    .from("internships")
    .delete()
    .eq("id", internshipId);
  if (internshipError) {
    console.error("DOCUMENT TEST INTERNSHIP CLEANUP FAILED:", internshipError);
  }

  const { error: hteError } = await supabaseAdmin
    .from("hte_profiles")
    .delete()
    .eq("id", hteId);
  if (hteError) console.error("DOCUMENT TEST HTE CLEANUP FAILED:", hteError);
}

async function loginAs(email: string, password: string) {
  const result = await login(email, password);
  assertEquals(result.response.status, 200);
  assertEquals(result.body.success, true);
  return result.body.data.accessToken as string;
}

Deno.test("Documents - unauthenticated request returns 401", async () => {
  const response = await app.request("/api/v1/documents");
  assertEquals(response.status, 401);
});

Deno.test("Documents - student can upload a PDF", async () => {
  const { student, internship, hteId } = await createTestFixture();
  try {
    const token = await loginAs(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );
    const file = createTestFile("endorsement.pdf");
    const result = await uploadDocument(
      token,
      internship.id,
      "endorsement",
      file,
    );

    assertEquals(result.response.status, 201);
    assertEquals(result.body.success, true);
    assertEquals(result.body.data.internship_id, internship.id);
    assertEquals(result.body.data.document_type, "endorsement");
    assertEquals(result.body.data.file_name, "endorsement.pdf");
    assertEquals(result.body.data.mime_type, "application/pdf");
    assertEquals(result.body.data.file_size, file.size);
    assertEquals(result.body.data.status, "pending");
    assertEquals(result.body.data.uploaded_by, student.id);
    assertExists(result.body.data.storage_path);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test(
  "Documents - upload validation rejects missing and invalid input",
  async () => {
    const { internship, hteId } = await createTestFixture();
    try {
      const token = await loginAs(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const missingFile = await authenticatedRequest(
        "/api/v1/documents",
        token,
        {
          method: "POST",
          body: createMultipartBody(internship.id, "endorsement"),
        },
      );
      const missingBody = await missingFile.json();
      assertEquals(missingFile.status, 400);
      assertEquals(missingBody.message, "A document file is required.");

      const invalidType = await uploadDocument(
        token,
        internship.id,
        "not_a_document_type",
      );
      assertEquals(invalidType.response.status, 400);
      assertEquals(invalidType.body.message, "Invalid document upload data.");

      const invalidMime = await uploadDocument(
        token,
        internship.id,
        "agreement",
        createTestFile("malicious.exe", "application/octet-stream"),
      );
      assertEquals(invalidMime.response.status, 400);
      assertEquals(
        invalidMime.body.message,
        "Unsupported file type. Allowed types are PDF, DOC, DOCX, JPEG, and PNG.",
      );

      const empty = await uploadDocument(
        token,
        internship.id,
        "agreement",
        new File([], "empty.pdf", { type: "application/pdf" }),
      );
      assertEquals(empty.response.status, 400);
      assertEquals(empty.body.message, "The uploaded file is empty.");

      const oversized = await uploadDocument(
        token,
        internship.id,
        "agreement",
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
          type: "application/pdf",
        }),
      );
      assertEquals(oversized.response.status, 400);
      assertEquals(
        oversized.body.message,
        "The uploaded file must not exceed 10 MiB.",
      );
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test("Documents - administrator cannot upload", async () => {
  const { internship, hteId } = await createTestFixture();
  try {
    const token = await loginAs(
      TEST_USERS.admin.email,
      TEST_USERS.admin.password,
    );
    const result = await uploadDocument(token, internship.id, "endorsement");
    assertEquals(result.response.status, 403);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test("Documents - student can list and retrieve documents", async () => {
  const { internship, hteId } = await createTestFixture();
  try {
    const token = await loginAs(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const first = await uploadDocument(
      token,
      internship.id,
      "endorsement",
      createTestFile("endorsement.pdf"),
    );
    const second = await uploadDocument(
      token,
      internship.id,
      "resume",
      createTestFile("resume.pdf"),
    );
    assertEquals(first.response.status, 201);
    assertEquals(second.response.status, 201);

    const list = await authenticatedRequest(
      `/api/v1/documents/internship/${internship.id}`,
      token,
    );
    const listBody = await list.json();
    assertEquals(list.status, 200);
    assertEquals(listBody.success, true);
    assertEquals(listBody.data.length, 2);

    const get = await authenticatedRequest(
      `/api/v1/documents/${first.body.data.id}`,
      token,
    );
    const getBody = await get.json();
    assertEquals(get.status, 200);
    assertEquals(getBody.success, true);
    assertEquals(getBody.data.document.id, first.body.data.id);
    assertEquals(getBody.data.document.internship_id, internship.id);
    assertExists(getBody.data.url);
    assertStringIncludes(getBody.data.url, "http");
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test(
  "Documents - duplicate non-rejected document returns 409",
  async () => {
    const { internship, hteId } = await createTestFixture();
    try {
      const token = await loginAs(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      const first = await uploadDocument(token, internship.id, "consent");
      const second = await uploadDocument(
        token,
        internship.id,
        "consent",
        createTestFile("consent-second.pdf"),
      );

      assertEquals(first.response.status, 201);
      assertEquals(second.response.status, 409);
      assertEquals(
        second.body.message,
        "A document of this type already exists for this internship.",
      );

      const documents = await getDocumentsForInternship(internship.id);
      assertEquals(documents.length, 1);
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test("Documents - rejected document can be re-uploaded", async () => {
  const { internship, hteId } = await createTestFixture();
  try {
    const studentToken = await loginAs(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );
    const coordinatorToken = await loginAs(
      TEST_USERS.coordinator.email,
      TEST_USERS.coordinator.password,
    );

    const first = await uploadDocument(
      studentToken,
      internship.id,
      "internship_report",
      createTestFile("first-report.pdf"),
    );
    assertEquals(first.response.status, 201);

    const reject = await authenticatedRequest(
      `/api/v1/documents/${first.body.data.id}/reject`,
      coordinatorToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Incomplete report." }),
      },
    );
    assertEquals(reject.status, 200);

    const replacement = await uploadDocument(
      studentToken,
      internship.id,
      "internship_report",
      createTestFile("corrected-report.pdf"),
    );
    assertEquals(replacement.response.status, 201);
    assertEquals(replacement.body.data.id, first.body.data.id);
    assertEquals(replacement.body.data.status, "pending");
    assertEquals(replacement.body.data.file_name, "corrected-report.pdf");
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test(
  "Documents - coordinator can approve and reject pending documents",
  async () => {
    const { internship, hteId } = await createTestFixture();
    try {
      const studentToken = await loginAs(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      const coordinatorToken = await loginAs(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );

      const approveUpload = await uploadDocument(
        studentToken,
        internship.id,
        "endorsement",
      );
      assertEquals(approveUpload.response.status, 201);

      const approve = await authenticatedRequest(
        `/api/v1/documents/${approveUpload.body.data.id}/approve`,
        coordinatorToken,
        { method: "PATCH" },
      );
      const approveBody = await approve.json();
      assertEquals(approve.status, 200);
      assertEquals(approveBody.data.status, "approved");
      assertEquals(approveBody.data.rejection_reason, null);
      assertExists(approveBody.data.reviewed_by);
      assertExists(approveBody.data.reviewed_at);

      const rejectUpload = await uploadDocument(
        studentToken,
        internship.id,
        "consent",
      );
      assertEquals(rejectUpload.response.status, 201);

      const reject = await authenticatedRequest(
        `/api/v1/documents/${rejectUpload.body.data.id}/reject`,
        coordinatorToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Please submit the signed version." }),
        },
      );
      const rejectBody = await reject.json();
      assertEquals(reject.status, 200);
      assertEquals(rejectBody.data.status, "rejected");
      assertEquals(
        rejectBody.data.rejection_reason,
        "Please submit the signed version.",
      );
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test("Documents - rejection requires a reason", async () => {
  const { internship, hteId } = await createTestFixture();
  try {
    const studentToken = await loginAs(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );
    const coordinatorToken = await loginAs(
      TEST_USERS.coordinator.email,
      TEST_USERS.coordinator.password,
    );
    const upload = await uploadDocument(studentToken, internship.id, "consent");
    assertEquals(upload.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/${upload.body.data.id}/reject`,
      coordinatorToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "   " }),
      },
    );
    const body = await response.json();
    assertEquals(response.status, 400);
    assertEquals(body.success, false);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test(
  "Documents - only the internship coordinator can review",
  async () => {
    const { internship, hteId } = await createTestFixture();
    try {
      const studentToken = await loginAs(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      const facultyToken = await loginAs(
        TEST_USERS.facultyAdviser.email,
        TEST_USERS.facultyAdviser.password,
      );
      const hteToken = await loginAs(
        TEST_USERS.hteSupervisor.email,
        TEST_USERS.hteSupervisor.password,
      );
      const adminToken = await loginAs(
        TEST_USERS.admin.email,
        TEST_USERS.admin.password,
      );

      const upload = await uploadDocument(
        studentToken,
        internship.id,
        "resume",
      );
      assertEquals(upload.response.status, 201);

      for (const token of [studentToken, facultyToken, hteToken, adminToken]) {
        const response = await authenticatedRequest(
          `/api/v1/documents/${upload.body.data.id}/approve`,
          token,
          { method: "PATCH" },
        );
        assertEquals(response.status, 403);
      }

      const document = await getDocumentFromDatabase(upload.body.data.id);
      assertExists(document);
      assertEquals(document.status, "pending");
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test(
  "Documents - already reviewed documents cannot be reviewed again",
  async () => {
    const { internship, hteId } = await createTestFixture();
    try {
      const studentToken = await loginAs(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      const coordinatorToken = await loginAs(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );
      const upload = await uploadDocument(
        studentToken,
        internship.id,
        "agreement",
      );
      assertEquals(upload.response.status, 201);

      const first = await authenticatedRequest(
        `/api/v1/documents/${upload.body.data.id}/approve`,
        coordinatorToken,
        { method: "PATCH" },
      );
      assertEquals(first.status, 200);

      const second = await authenticatedRequest(
        `/api/v1/documents/${upload.body.data.id}/reject`,
        coordinatorToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Already approved." }),
        },
      );
      const body = await second.json();
      assertEquals(second.status, 400);
      assertEquals(body.message, "Only pending documents can be reviewed.");
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test(
  "Documents - required prototype document types are accepted",
  async () => {
    const { internship, hteId } = await createTestFixture();
    try {
      const token = await loginAs(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      for (
        const [index, documentType] of [
          "signed_internship_agreement",
          "fit_to_work",
          "consent",
        ].entries()
      ) {
        const result = await uploadDocument(
          token,
          internship.id,
          documentType,
          createTestFile(`${index}-${documentType}.pdf`),
        );
        assertEquals(result.response.status, 201);
        assertEquals(result.body.data.document_type, documentType);
      }
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test(
  "Documents - student can upload for pending internships",
  async () => {
    const { internship, hteId } = await createTestFixture("pending");
    try {
      const token = await loginAs(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      const result = await uploadDocument(
        token,
        internship.id,
        "signed_internship_agreement",
        createTestFile("signed-internship-agreement.pdf"),
      );
      assertEquals(result.response.status, 201);
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

/* Deno.test("Documents - student cannot upload for completed internships", async () => {
  const { internship, hteId } = await createTestFixture("completed");
  try {
    const token = await loginAs(TEST_USERS.student.email, TEST_USERS.student.password);
    const result = await uploadDocument(
      token,
      internship.id,
      "fit_to_work",
      createTestFile("fit-to-work.pdf"),
    );
    assertEquals(result.response.status, 400);
    assertEquals(
      result.body.message,
      "Students can only upload documents for pending or active internships.",
    );
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
}); */

Deno.test("Documents - student can delete their own document", async () => {
  const { internship, hteId } = await createTestFixture();
  try {
    const token = await loginAs(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );
    const upload = await uploadDocument(
      token,
      internship.id,
      "other",
      createTestFile("delete-me.pdf"),
    );
    assertEquals(upload.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/${upload.body.data.id}`,
      token,
      { method: "DELETE" },
    );
    const body = await response.json();
    assertEquals(response.status, 200);
    assertEquals(body.success, true);

    const document = await getDocumentFromDatabase(upload.body.data.id);
    assertEquals(document, null);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});
