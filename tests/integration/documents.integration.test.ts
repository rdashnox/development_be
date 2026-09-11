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
  status: string;
};

async function login(
  email: string = TEST_USERS.admin.email,
  password: string = TEST_USERS.admin.password,
) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();

  return { response, body };
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

async function ensureTestStudentProfile() {
  const studentId = await getTestUserId(TEST_USERS.student.email);

  // Keep this fixture isolated from old integration-test data.
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

async function createTestHte(token: string) {
  const response = await authenticatedRequest("/api/v1/htes", token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
): Promise<TestInternship> {
  const response = await authenticatedRequest("/api/v1/internships", token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      studentId,
      hteId,
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data as TestInternship;
}

async function activateInternship(
  token: string,
  internshipId: string,
): Promise<TestInternship> {
  const response = await authenticatedRequest(
    `/api/v1/internships/${internshipId}/status`,
    token,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "active",
      }),
    },
  );

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.data.status, "active");

  return body.data as TestInternship;
}

async function createTestFixture(): Promise<{
  student: { id: string };
  internship: TestInternship;
  hteId: string;
}> {
  await setupTestUsers();

  const student = await ensureTestStudentProfile();
  const adminLogin = await login();

  assertEquals(adminLogin.response.status, 200);
  assertEquals(adminLogin.body.success, true);

  const hte = await createTestHte(adminLogin.body.data.accessToken);
  const internship = await createTestInternship(
    adminLogin.body.data.accessToken,
    student.id,
    hte.id,
  );
  const activeInternship = await activateInternship(
    adminLogin.body.data.accessToken,
    internship.id,
  );

  return {
    student,
    internship: activeInternship,
    hteId: hte.id,
  };
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

  if (file) {
    form.append("file", file);
  }

  return form;
}

async function uploadDocument(
  token: string,
  internshipId: string,
  documentType: string,
  file: File = createTestFile(),
) {
  const form = createMultipartBody(internshipId, documentType, file);

  const response = await authenticatedRequest("/api/v1/documents", token, {
    method: "POST",
    body: form,
  });

  const body = await response.json();

  return { response, body };
}

async function getDocumentFromDatabase(
  documentId: string,
): Promise<DocumentRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

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

  if (error) {
    throw error;
  }

  return (data ?? []) as DocumentRecord[];
}

async function cleanupFixture(
  internshipId: string,
  hteId: string,
): Promise<void> {
  const documents = await getDocumentsForInternship(internshipId);

  const storagePaths = [
    ...new Set(documents.map((document) => document.storage_path)),
  ];

  if (storagePaths.length > 0) {
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove(storagePaths);

    if (error) {
      console.error("DOCUMENT TEST STORAGE CLEANUP FAILED:", error);
    }
  }

  const { error: internshipError } = await supabaseAdmin
    .from("internships")
    .delete()
    .eq("id", internshipId);

  if (internshipError) {
    console.error("DOCUMENT TEST INTERNSHIP CLEANUP FAILED:", internshipError);
  }

  // The fixture creates the HTE directly for this test.
  // Delete it after the internship is gone so tests do not accumulate HTE rows.
  const { error: hteError } = await supabaseAdmin
    .from("hte_profiles")
    .delete()
    .eq("id", hteId);

  if (hteError) {
    console.error("DOCUMENT TEST HTE CLEANUP FAILED:", hteError);
  }
}

/*
 * ---------------------------------------------------------
 * AUTHENTICATION
 * ---------------------------------------------------------
 */

Deno.test("Documents - unauthenticated request returns 401", async () => {
  const response = await app.request("/api/v1/documents");

  assertEquals(response.status, 401);
});

/*
 * ---------------------------------------------------------
 * UPLOAD
 * ---------------------------------------------------------
 */

Deno.test("Documents - student can upload a PDF", async () => {
  const { student, internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

    const file = createTestFile(
      "endorsement.pdf",
      "application/pdf",
      "Student endorsement document",
    );

    const { response, body } = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "endorsement",
      file,
    );

    assertEquals(response.status, 201);
    assertEquals(body.success, true);
    assertExists(body.data);

    assertExists(body.data.id);
    assertEquals(body.data.internship_id, internship.id);
    assertEquals(body.data.document_type, "endorsement");
    assertEquals(body.data.file_name, "endorsement.pdf");
    assertEquals(body.data.mime_type, "application/pdf");
    assertEquals(body.data.file_size, file.size);
    assertEquals(body.data.status, "pending");
    assertEquals(body.data.uploaded_by, student.id);
    assertExists(body.data.storage_path);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test("Documents - upload requires a file", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const form = createMultipartBody(internship.id, "endorsement");

    const response = await authenticatedRequest(
      "/api/v1/documents",
      studentLogin.body.data.accessToken,
      {
        method: "POST",
        body: form,
      },
    );

    const body = await response.json();

    assertEquals(response.status, 400);
    assertEquals(body.success, false);
    assertEquals(body.message, "A document file is required.");
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test(
  "Documents - upload rejects an unsupported document type",
  async () => {
    const { internship, hteId } = await createTestFixture();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const form = createMultipartBody(
        internship.id,
        "not_a_document_type",
        createTestFile(),
      );

      const response = await authenticatedRequest(
        "/api/v1/documents",
        studentLogin.body.data.accessToken,
        {
          method: "POST",
          body: form,
        },
      );

      const body = await response.json();

      assertEquals(response.status, 400);
      assertEquals(body.success, false);
      assertEquals(body.message, "Invalid document upload data.");
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test("Documents - upload rejects an unsupported MIME type", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const file = createTestFile(
      "malicious.exe",
      "application/octet-stream",
      "not supported",
    );

    const { response, body } = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "agreement",
      file,
    );

    assertEquals(response.status, 400);
    assertEquals(body.success, false);
    assertEquals(
      body.message,
      "Unsupported file type. Allowed types are PDF, DOC, DOCX, JPEG, and PNG.",
    );
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test("Documents - upload rejects an empty file", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const file = new File([], "empty.pdf", {
      type: "application/pdf",
    });

    const { response, body } = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "agreement",
      file,
    );

    assertEquals(response.status, 400);
    assertEquals(body.success, false);
    assertEquals(body.message, "The uploaded file is empty.");
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test("Documents - upload rejects files larger than 10 MiB", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const file = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      "oversized.pdf",
      { type: "application/pdf" },
    );

    const { response, body } = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "agreement",
      file,
    );

    assertEquals(response.status, 400);
    assertEquals(body.success, false);
    assertEquals(body.message, "The uploaded file must not exceed 10 MiB.");
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test("Documents - administrator cannot upload", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const adminLogin = await login();

    assertEquals(adminLogin.response.status, 200);

    const { response } = await uploadDocument(
      adminLogin.body.data.accessToken,
      internship.id,
      "endorsement",
    );

    assertEquals(response.status, 403);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

/*
 * ---------------------------------------------------------
 * RETRIEVAL
 * ---------------------------------------------------------
 */

Deno.test("Documents - student can list internship documents", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const first = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "endorsement",
      createTestFile("endorsement.pdf"),
    );

    const second = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "agreement",
      createTestFile("agreement.pdf"),
    );

    assertEquals(first.response.status, 201);
    assertEquals(second.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/internship/${internship.id}`,
      studentLogin.body.data.accessToken,
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.length, 2);
    assertEquals(body.data[0].internship_id, internship.id);
    assertEquals(body.data[1].internship_id, internship.id);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test(
  "Documents - student can retrieve a document with a signed URL",
  async () => {
    const { internship, hteId } = await createTestFixture();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "resume",
        createTestFile("resume.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const response = await authenticatedRequest(
        `/api/v1/documents/${upload.body.data.id}`,
        studentLogin.body.data.accessToken,
      );

      const body = await response.json();

      assertEquals(response.status, 200);
      assertEquals(body.success, true);
      assertExists(body.data.document);
      assertExists(body.data.url);
      assertEquals(body.data.document.id, upload.body.data.id);
      assertEquals(body.data.document.internship_id, internship.id);
      assertEquals(body.data.document.document_type, "resume");
      assertStringIncludes(body.data.url, "http");
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

/*
 * ---------------------------------------------------------
 * DUPLICATES / RE-UPLOAD
 * ---------------------------------------------------------
 */

Deno.test(
  "Documents - duplicate non-rejected document returns 409",
  async () => {
    const { internship, hteId } = await createTestFixture();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const first = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "consent",
        createTestFile("consent.pdf"),
      );

      const second = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "consent",
        createTestFile("consent-second.pdf"),
      );

      assertEquals(first.response.status, 201);
      assertEquals(second.response.status, 409);
      assertEquals(second.body.success, false);
      assertEquals(
        second.body.message,
        "A document of this type already exists for this internship.",
      );

      const documents = await getDocumentsForInternship(internship.id);
      assertEquals(documents.length, 1);
      assertEquals(documents[0].id, first.body.data.id);
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test("Documents - rejected document can be re-uploaded", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );
    const coordinatorLogin = await login(
      TEST_USERS.coordinator.email,
      TEST_USERS.coordinator.password,
    );

    const first = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "internship_report",
      createTestFile("first-report.pdf"),
    );

    assertEquals(first.response.status, 201);

    const rejectResponse = await authenticatedRequest(
      `/api/v1/documents/${first.body.data.id}/reject`,
      coordinatorLogin.body.data.accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "The internship report is incomplete.",
        }),
      },
    );

    assertEquals(rejectResponse.status, 200);

    const replacement = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "internship_report",
      createTestFile("corrected-report.pdf"),
    );

    assertEquals(replacement.response.status, 201);
    assertEquals(replacement.body.success, true);
    assertEquals(replacement.body.data.id, first.body.data.id);
    assertEquals(replacement.body.data.status, "pending");
    assertEquals(replacement.body.data.file_name, "corrected-report.pdf");
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

/*
 * ---------------------------------------------------------
 * REVIEW
 * ---------------------------------------------------------
 */

Deno.test(
  "Documents - coordinator can approve a pending document",
  async () => {
    const { internship, hteId } = await createTestFixture();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      const coordinatorLogin = await login(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "endorsement",
        createTestFile("endorsement.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const response = await authenticatedRequest(
        `/api/v1/documents/${upload.body.data.id}/approve`,
        coordinatorLogin.body.data.accessToken,
        { method: "PATCH" },
      );

      const body = await response.json();

      assertEquals(response.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.data.id, upload.body.data.id);
      assertEquals(body.data.status, "approved");
      assertEquals(body.data.rejection_reason, null);
      assertEquals(body.data.reviewed_by, coordinatorLogin.body.data.user.id);
      assertExists(body.data.reviewed_at);
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

Deno.test("Documents - coordinator can reject with a reason", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );
    const coordinatorLogin = await login(
      TEST_USERS.coordinator.email,
      TEST_USERS.coordinator.password,
    );

    const upload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "consent",
      createTestFile("consent.pdf"),
    );

    assertEquals(upload.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/${upload.body.data.id}/reject`,
      coordinatorLogin.body.data.accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Please submit the signed version.",
        }),
      },
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.status, "rejected");
    assertEquals(
      body.data.rejection_reason,
      "Please submit the signed version.",
    );
    assertEquals(body.data.reviewed_by, coordinatorLogin.body.data.user.id);
    assertExists(body.data.reviewed_at);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test("Documents - rejection requires a reason", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );
    const coordinatorLogin = await login(
      TEST_USERS.coordinator.email,
      TEST_USERS.coordinator.password,
    );

    const upload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "consent",
      createTestFile("consent.pdf"),
    );

    assertEquals(upload.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/${upload.body.data.id}/reject`,
      coordinatorLogin.body.data.accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "   ",
        }),
      },
    );

    const body = await response.json();

    assertEquals(response.status, 400);
    assertEquals(body.success, false);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test("Documents - student cannot review a document", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const upload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "resume",
      createTestFile("resume.pdf"),
    );

    assertEquals(upload.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/${upload.body.data.id}/approve`,
      studentLogin.body.data.accessToken,
      { method: "PATCH" },
    );

    assertEquals(response.status, 403);

    const document = await getDocumentFromDatabase(upload.body.data.id);
    assertExists(document);
    assertEquals(document?.status, "pending");
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});

Deno.test(
  "Documents - already reviewed document cannot be reviewed again",
  async () => {
    const { internship, hteId } = await createTestFixture();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );
      const coordinatorLogin = await login(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "agreement",
        createTestFile("agreement.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const firstReview = await authenticatedRequest(
        `/api/v1/documents/${upload.body.data.id}/approve`,
        coordinatorLogin.body.data.accessToken,
        { method: "PATCH" },
      );

      assertEquals(firstReview.status, 200);

      const secondReview = await authenticatedRequest(
        `/api/v1/documents/${upload.body.data.id}/reject`,
        coordinatorLogin.body.data.accessToken,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "This document was already approved.",
          }),
        },
      );

      const body = await secondReview.json();

      assertEquals(secondReview.status, 400);
      assertEquals(body.success, false);
      assertEquals(body.message, "Only pending documents can be reviewed.");

      const document = await getDocumentFromDatabase(upload.body.data.id);
      assertExists(document);
      assertEquals(document?.status, "approved");
    } finally {
      await cleanupFixture(internship.id, hteId);
    }
  },
);

/*
 * ---------------------------------------------------------
 * DELETE
 * ---------------------------------------------------------
 */

Deno.test("Documents - student can delete their own document", async () => {
  const { internship, hteId } = await createTestFixture();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const upload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "other",
      createTestFile("delete-me.pdf"),
    );

    assertEquals(upload.response.status, 201);

    const documentId = upload.body.data.id;
    const storagePath = upload.body.data.storage_path;

    const response = await authenticatedRequest(
      `/api/v1/documents/${documentId}`,
      studentLogin.body.data.accessToken,
      { method: "DELETE" },
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);

    const databaseDocument = await getDocumentFromDatabase(documentId);
    assertEquals(databaseDocument, null);

    const signedUrlResult = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60);

    assertEquals(signedUrlResult.data, null);
    assertExists(signedUrlResult.error);
  } finally {
    await cleanupFixture(internship.id, hteId);
  }
});
