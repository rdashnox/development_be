import { assertEquals, assertExists, assertNotEquals, assertStringIncludes } from "@std/assert";

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

type LoginResult = {
  response: Response;
  body: {
    success: boolean;
    data: {
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        email: string;
      };
    };
  };
};

type DocumentRecord = {
  id: string;
  internship_id: string;
  document_type:
    | "endorsement"
    | "agreement"
    | "resume"
    | "consent"
    | "internship_report"
    | "other";
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  status: "pending" | "approved" | "rejected";
  uploaded_by: string;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
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
): Promise<LoginResult> {
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
): Promise<Response> {
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
    (item: { email?: string | null }) => item.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!user) {
    throw new Error(`Test user not found: ${email}`);
  }

  return user.id;
}

async function ensureTestStudentProfile(): Promise<{
  id: string;
  student_number: string;
  program: string;
  year_level: number;
  section: string;
}> {
  const studentId = await getTestUserId(TEST_USERS.student.email);

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
      contactEmail: "documents-test@example.com",
      contactNumber: "09171234567",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data;
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

  return body.data;
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

  return body.data;
}

async function createActiveInternship(): Promise<{
  student: {
    id: string;
    student_number: string;
    program: string;
    year_level: number;
    section: string;
  };
  internship: TestInternship;
  adminToken: string;
  hteSupervisorId: string;
}> {
  await setupTestUsers();

  const student = await ensureTestStudentProfile();

  const { response: loginResponse, body: loginBody } = await login();

  assertEquals(loginResponse.status, 200);
  assertEquals(loginBody.success, true);

  const adminToken = loginBody.data.accessToken;

  const hte = await createTestHte(adminToken);

  /*
   * IMPORTANT:
   * Documents resource authorization for an HTE supervisor
   * depends on hte_profiles.supervisor_id.
   *
   * Creating the HTE alone is not enough.
   */
  const hteSupervisorId = await getTestUserId(TEST_USERS.hteSupervisor.email);

  await assignHteSupervisor(adminToken, hte.id, hteSupervisorId);

  const internship = await createTestInternship(adminToken, student.id, hte.id);

  const activeInternship = await activateInternship(adminToken, internship.id);

  return {
    student,
    internship: activeInternship,
    adminToken,
    hteSupervisorId,
  };
}

function createTestFile(
  name = "endorsement.pdf",
  type = "application/pdf",
  contents = "SBIMS documents integration test",
): File {
  return new File([contents], name, {
    type,
  });
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
): Promise<{
  response: Response;
  body: {
    success: boolean;
    data: DocumentRecord;
    message?: string;
  };
}> {
  const form = createMultipartBody(internshipId, documentType, file);

  const response = await authenticatedRequest("/api/v1/documents", token, {
    method: "POST",
    body: form,
  });

  const body = await response.json();

  return {
    response,
    body,
  };
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

async function removeStorageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const uniquePaths = [...new Set(paths)];

  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .remove(uniquePaths);

  if (error) {
    console.error("DOCUMENT TEST STORAGE CLEANUP FAILED:", error);
  }
}

async function cleanupInternship(internshipId: string): Promise<void> {
  const documents = await getDocumentsForInternship(internshipId);

  await removeStorageObjects(
    documents.map((document) => document.storage_path),
  );

  const { error } = await supabaseAdmin
    .from("internships")
    .delete()
    .eq("id", internshipId);

  if (error) {
    console.error("DOCUMENT TEST INTERNSHIP CLEANUP FAILED:", error);
  }
}

async function assignHteSupervisor(
  token: string,
  hteId: string,
  supervisorId: string,
) {
  const response = await authenticatedRequest(
    `/api/v1/htes/${hteId}/supervisor`,
    token,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supervisorId,
      }),
    },
  );

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertExists(body.data);

  return body.data;
}

/*
 * ---------------------------------------------------------
 * AUTHENTICATION
 * ---------------------------------------------------------
 */

Deno.test("FR-09 unauthenticated document request should fail", async () => {
  const response = await app.request("/api/v1/documents");

  assertEquals(response.status, 401);
});

/*
 * ---------------------------------------------------------
 * UPLOAD
 * ---------------------------------------------------------
 */

Deno.test("FR-09 student can upload an internship document", async () => {
  const { student, internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

    const file = createTestFile(
      "my-endorsement.pdf",
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
    assertEquals(body.data.file_name, "my-endorsement.pdf");
    assertEquals(body.data.mime_type, "application/pdf");
    assertEquals(body.data.file_size, file.size);
    assertEquals(body.data.status, "pending");
    assertEquals(body.data.uploaded_by, student.id);
    assertExists(body.data.storage_path);

    assertStringIncludes(
      body.data.storage_path,
      `${internship.id}/${body.data.id}-`,
    );

    const databaseDocument = await getDocumentFromDatabase(body.data.id);

    assertExists(databaseDocument);
    assertEquals(databaseDocument?.id, body.data.id);
    assertEquals(databaseDocument?.status, "pending");
    assertEquals(databaseDocument?.uploaded_by, student.id);
  } finally {
    await cleanupInternship(internship.id);
  }
});

Deno.test(
  "FR-09 administrator cannot upload an internship document",
  async () => {
    const { internship } = await createActiveInternship();

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
      await cleanupInternship(internship.id);
    }
  },
);

Deno.test("FR-09 document upload requires a file", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

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
    await cleanupInternship(internship.id);
  }
});

Deno.test("FR-09 document upload rejects invalid internship data", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

    const form = createMultipartBody(
      "not-a-valid-uuid",
      "endorsement",
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
    await cleanupInternship(internship.id);
  }
});

Deno.test(
  "FR-09 document upload rejects unsupported document type",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      assertEquals(studentLogin.response.status, 200);

      const form = createMultipartBody(
        internship.id,
        "invalid_document_type",
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
      await cleanupInternship(internship.id);
    }
  },
);

Deno.test("FR-09 document upload rejects unsupported MIME type", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

    const file = createTestFile(
      "malicious.exe",
      "application/octet-stream",
      "not a supported document",
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
    await cleanupInternship(internship.id);
  }
});

Deno.test("FR-09 document upload rejects an empty file", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

    const emptyFile = new File([], "empty.pdf", {
      type: "application/pdf",
    });

    const { response, body } = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "agreement",
      emptyFile,
    );

    assertEquals(response.status, 400);
    assertEquals(body.success, false);
    assertEquals(body.message, "The uploaded file is empty.");
  } finally {
    await cleanupInternship(internship.id);
  }
});

Deno.test(
  "FR-09 document upload rejects files larger than 10 MiB",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      assertEquals(studentLogin.response.status, 200);

      const oversizedFile = new File(
        [new Uint8Array(10 * 1024 * 1024 + 1)],
        "oversized.pdf",
        {
          type: "application/pdf",
        },
      );

      const { response, body } = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "agreement",
        oversizedFile,
      );

      assertEquals(response.status, 400);
      assertEquals(body.success, false);
      assertEquals(body.message, "The uploaded file must not exceed 10 MiB.");
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

/*
 * ---------------------------------------------------------
 * RETRIEVAL
 * ---------------------------------------------------------
 */

Deno.test("FR-09 student can list documents for their internship", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

    const firstUpload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "endorsement",
      createTestFile("endorsement.pdf"),
    );

    assertEquals(firstUpload.response.status, 201);

    const secondUpload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "agreement",
      createTestFile("agreement.pdf"),
    );

    assertEquals(secondUpload.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/internship/${internship.id}`,
      studentLogin.body.data.accessToken,
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertExists(body.data);
    assertEquals(body.data.length, 2);

    assertEquals(body.data[0].internship_id, internship.id);
    assertEquals(body.data[0].document_type, "endorsement");

    assertEquals(body.data[1].internship_id, internship.id);
    assertEquals(body.data[1].document_type, "agreement");
  } finally {
    await cleanupInternship(internship.id);
  }
});

Deno.test(
  "FR-09 student can retrieve a document with a signed download URL",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      assertEquals(studentLogin.response.status, 200);

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "resume",
        createTestFile("resume.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const documentId = upload.body.data.id;

      const response = await authenticatedRequest(
        `/api/v1/documents/${documentId}`,
        studentLogin.body.data.accessToken,
      );

      const body = await response.json();

      assertEquals(response.status, 200);
      assertEquals(body.success, true);
      assertExists(body.data);
      assertExists(body.data.document);
      assertExists(body.data.url);

      assertEquals(body.data.document.id, documentId);
      assertEquals(body.data.document.internship_id, internship.id);
      assertEquals(body.data.document.document_type, "resume");

      assertEquals(typeof body.data.url, "string");
      assertNotEquals(body.data.url, "");
      assertStringIncludes(body.data.url, "http");
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

/*
 * ---------------------------------------------------------
 * DUPLICATE / RE-UPLOAD
 * ---------------------------------------------------------
 */

Deno.test(
  "FR-09 duplicate non-rejected document upload should fail with 409",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      assertEquals(studentLogin.response.status, 200);

      const firstUpload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "consent",
        createTestFile("consent.pdf"),
      );

      assertEquals(firstUpload.response.status, 201);

      const secondUpload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "consent",
        createTestFile("consent-second.pdf"),
      );

      assertEquals(secondUpload.response.status, 409);
      assertEquals(secondUpload.body.success, false);
      assertEquals(
        secondUpload.body.message,
        "A document of this type already exists for this internship.",
      );

      const documents = await getDocumentsForInternship(internship.id);

      assertEquals(documents.length, 1);
      assertEquals(documents[0].id, firstUpload.body.data.id);
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

Deno.test(
  "FR-09 rejected document can be re-uploaded and returns to pending",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const coordinatorLogin = await login(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );

      assertEquals(studentLogin.response.status, 200);
      assertEquals(coordinatorLogin.response.status, 200);

      const firstUpload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "internship_report",
        createTestFile("first-report.pdf", "application/pdf", "first report"),
      );

      assertEquals(firstUpload.response.status, 201);

      const originalDocumentId = firstUpload.body.data.id;
      const originalStoragePath = firstUpload.body.data.storage_path;

      const rejectResponse = await authenticatedRequest(
        `/api/v1/documents/${originalDocumentId}/reject`,
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

      const rejectBody = await rejectResponse.json();

      assertEquals(rejectResponse.status, 200);
      assertEquals(rejectBody.success, true);
      assertEquals(rejectBody.data.id, originalDocumentId);
      assertEquals(rejectBody.data.status, "rejected");
      assertEquals(
        rejectBody.data.rejection_reason,
        "The internship report is incomplete.",
      );
      assertEquals(
        rejectBody.data.reviewed_by,
        coordinatorLogin.body.data.user.id,
      );
      assertExists(rejectBody.data.reviewed_at);

      const replacementFile = createTestFile(
        "corrected-report.pdf",
        "application/pdf",
        "corrected report",
      );

      const replacementUpload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "internship_report",
        replacementFile,
      );

      assertEquals(replacementUpload.response.status, 201);
      assertEquals(replacementUpload.body.success, true);

      const replacementDocument = replacementUpload.body.data;

      /*
       * Re-uploading a rejected document intentionally updates
       * the same metadata record rather than creating a new one.
       */
      assertEquals(replacementDocument.id, originalDocumentId);
      assertEquals(replacementDocument.internship_id, internship.id);
      assertEquals(replacementDocument.document_type, "internship_report");

      assertEquals(replacementDocument.file_name, "corrected-report.pdf");
      assertEquals(replacementDocument.mime_type, replacementFile.type);
      assertEquals(replacementDocument.file_size, replacementFile.size);

      assertEquals(replacementDocument.status, "pending");
      assertEquals(
        replacementDocument.uploaded_by,
        studentLogin.body.data.user.id,
      );

      assertEquals(replacementDocument.reviewed_by, null);
      assertEquals(replacementDocument.reviewed_at, null);
      assertEquals(replacementDocument.rejection_reason, null);

      assertNotEquals(replacementDocument.storage_path, originalStoragePath);

      const databaseDocument = await getDocumentFromDatabase(originalDocumentId);

      assertExists(databaseDocument);
      assertEquals(databaseDocument?.id, originalDocumentId);
      assertEquals(databaseDocument?.status, "pending");
      assertEquals(
        databaseDocument?.storage_path,
        replacementDocument.storage_path,
      );
      assertEquals(databaseDocument?.file_name, "corrected-report.pdf");
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

/*
 * ---------------------------------------------------------
 * REVIEW
 * ---------------------------------------------------------
 */

Deno.test(
  "FR-09 authorized coordinator can approve a pending document",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const coordinatorLogin = await login(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );

      assertEquals(studentLogin.response.status, 200);
      assertEquals(coordinatorLogin.response.status, 200);

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "agreement",
        createTestFile("agreement.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const documentId = upload.body.data.id;

      const response = await authenticatedRequest(
        `/api/v1/documents/${documentId}/approve`,
        coordinatorLogin.body.data.accessToken,
        {
          method: "PATCH",
        },
      );

      const body = await response.json();

      assertEquals(response.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.data.id, documentId);
      assertEquals(body.data.status, "approved");
      assertEquals(body.data.reviewed_by, coordinatorLogin.body.data.user.id);
      assertExists(body.data.reviewed_at);
      assertEquals(body.data.rejection_reason, null);

      const databaseDocument = await getDocumentFromDatabase(documentId);

      assertExists(databaseDocument);
      assertEquals(databaseDocument?.status, "approved");
      assertEquals(
        databaseDocument?.reviewed_by,
        coordinatorLogin.body.data.user.id,
      );
      assertExists(databaseDocument?.reviewed_at);
      assertEquals(databaseDocument?.rejection_reason, null);
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

Deno.test(
  "FR-09 authorized coordinator can reject a pending document",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const coordinatorLogin = await login(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );

      assertEquals(studentLogin.response.status, 200);
      assertEquals(coordinatorLogin.response.status, 200);

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "consent",
        createTestFile("consent.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const documentId = upload.body.data.id;

      const response = await authenticatedRequest(
        `/api/v1/documents/${documentId}/reject`,
        coordinatorLogin.body.data.accessToken,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "The submitted consent form is incomplete.",
          }),
        },
      );

      const body = await response.json();

      assertEquals(response.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.data.id, documentId);
      assertEquals(body.data.status, "rejected");
      assertEquals(
        body.data.rejection_reason,
        "The submitted consent form is incomplete.",
      );
      assertEquals(body.data.reviewed_by, coordinatorLogin.body.data.user.id);
      assertExists(body.data.reviewed_at);

      const databaseDocument = await getDocumentFromDatabase(documentId);

      assertExists(databaseDocument);
      assertEquals(databaseDocument?.status, "rejected");
      assertEquals(
        databaseDocument?.rejection_reason,
        "The submitted consent form is incomplete.",
      );
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

Deno.test("FR-09 student cannot review a document", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

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
      {
        method: "PATCH",
      },
    );

    assertEquals(response.status, 403);

    const databaseDocument = await getDocumentFromDatabase(upload.body.data.id);

    assertExists(databaseDocument);
    assertEquals(databaseDocument?.status, "pending");
  } finally {
    await cleanupInternship(internship.id);
  }
});

Deno.test(
  "FR-09 reviewing an already reviewed document should fail",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const coordinatorLogin = await login(
        TEST_USERS.coordinator.email,
        TEST_USERS.coordinator.password,
      );

      assertEquals(studentLogin.response.status, 200);
      assertEquals(coordinatorLogin.response.status, 200);

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "endorsement",
        createTestFile("endorsement.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const documentId = upload.body.data.id;

      const firstReview = await authenticatedRequest(
        `/api/v1/documents/${documentId}/approve`,
        coordinatorLogin.body.data.accessToken,
        {
          method: "PATCH",
        },
      );

      assertEquals(firstReview.status, 200);

      const secondReview = await authenticatedRequest(
        `/api/v1/documents/${documentId}/reject`,
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

      const secondBody = await secondReview.json();

      assertEquals(secondReview.status, 400);
      assertEquals(secondBody.success, false);
      assertEquals(
        secondBody.message,
        "Only pending documents can be reviewed.",
      );

      const databaseDocument = await getDocumentFromDatabase(documentId);

      assertExists(databaseDocument);
      assertEquals(databaseDocument?.status, "approved");
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

Deno.test("FR-09 rejection requires a reason", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const coordinatorLogin = await login(
      TEST_USERS.coordinator.email,
      TEST_USERS.coordinator.password,
    );

    assertEquals(studentLogin.response.status, 200);
    assertEquals(coordinatorLogin.response.status, 200);

    const upload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "other",
      createTestFile("other.pdf"),
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

    /*
     * The route-level Zod validator and service both protect
     * this invariant. The exact route error payload is not
     * duplicated here; the important API contract is 400.
     */
  } finally {
    await cleanupInternship(internship.id);
  }
});

/*
 * ---------------------------------------------------------
 * DELETE
 * ---------------------------------------------------------
 */

Deno.test("FR-09 student can delete their own document", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    assertEquals(studentLogin.response.status, 200);

    const upload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "endorsement",
      createTestFile("delete-me.pdf"),
    );

    assertEquals(upload.response.status, 201);

    const documentId = upload.body.data.id;
    const storagePath = upload.body.data.storage_path;

    const response = await authenticatedRequest(
      `/api/v1/documents/${documentId}`,
      studentLogin.body.data.accessToken,
      {
        method: "DELETE",
      },
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);

    const databaseDocument = await getDocumentFromDatabase(documentId);

    assertEquals(databaseDocument, null);

    /*
     * The API implementation deletes Storage first and then
     * deletes document metadata. Verify the Storage object
     * can no longer be found through a signed URL request.
     */
    const signedUrlResult = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60);

    assertEquals(signedUrlResult.data, null);
    assertExists(signedUrlResult.error);
  } finally {
    await cleanupInternship(internship.id);
  }
});

Deno.test("FR-09 HTE supervisor cannot delete a document", async () => {
  const { internship } = await createActiveInternship();

  try {
    const studentLogin = await login(
      TEST_USERS.student.email,
      TEST_USERS.student.password,
    );

    const supervisorLogin = await login(
      TEST_USERS.hteSupervisor.email,
      TEST_USERS.hteSupervisor.password,
    );

    assertEquals(studentLogin.response.status, 200);
    assertEquals(supervisorLogin.response.status, 200);

    const upload = await uploadDocument(
      studentLogin.body.data.accessToken,
      internship.id,
      "agreement",
      createTestFile("agreement.pdf"),
    );

    assertEquals(upload.response.status, 201);

    const response = await authenticatedRequest(
      `/api/v1/documents/${upload.body.data.id}`,
      supervisorLogin.body.data.accessToken,
      {
        method: "DELETE",
      },
    );

    assertEquals(response.status, 403);

    const databaseDocument = await getDocumentFromDatabase(upload.body.data.id);

    assertExists(databaseDocument);
    assertEquals(databaseDocument?.status, "pending");
  } finally {
    await cleanupInternship(internship.id);
  }
});

/*
 * ---------------------------------------------------------
 * RESOURCE AUTHORIZATION
 * ---------------------------------------------------------
 */

Deno.test(
  "FR-09 HTE supervisor can access documents for the assigned internship",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const supervisorLogin = await login(
        TEST_USERS.hteSupervisor.email,
        TEST_USERS.hteSupervisor.password,
      );

      assertEquals(studentLogin.response.status, 200);
      assertEquals(supervisorLogin.response.status, 200);

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "agreement",
        createTestFile("agreement.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const response = await authenticatedRequest(
        `/api/v1/documents/internship/${internship.id}`,
        supervisorLogin.body.data.accessToken,
      );

      const body = await response.json();

      assertEquals(response.status, 200);
      assertEquals(body.success, true);
      assertExists(body.data);
      assertEquals(body.data.length, 1);
      assertEquals(body.data[0].id, upload.body.data.id);
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

Deno.test(
  "FR-09 second HTE supervisor cannot access another HTE's internship documents",
  async () => {
    const { internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      const otherSupervisorLogin = await login(
        TEST_USERS.otherHteSupervisor.email,
        TEST_USERS.otherHteSupervisor.password,
      );

      assertEquals(studentLogin.response.status, 200);
      assertEquals(otherSupervisorLogin.response.status, 200);

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "resume",
        createTestFile("resume.pdf"),
      );

      assertEquals(upload.response.status, 201);

      const response = await authenticatedRequest(
        `/api/v1/documents/internship/${internship.id}`,
        otherSupervisorLogin.body.data.accessToken,
      );

      assertEquals(response.status, 403);

      const documentResponse = await authenticatedRequest(
        `/api/v1/documents/${upload.body.data.id}`,
        otherSupervisorLogin.body.data.accessToken,
      );

      assertEquals(documentResponse.status, 403);
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);

/*
 * ---------------------------------------------------------
 * RESPONSE / DATABASE CONSISTENCY
 * ---------------------------------------------------------
 */

Deno.test(
  "FR-09 uploaded document response matches persisted metadata",
  async () => {
    const { student, internship } = await createActiveInternship();

    try {
      const studentLogin = await login(
        TEST_USERS.student.email,
        TEST_USERS.student.password,
      );

      assertEquals(studentLogin.response.status, 200);

      const file = createTestFile(
        "my document @ final.pdf",
        "application/pdf",
        "document contents",
      );

      const upload = await uploadDocument(
        studentLogin.body.data.accessToken,
        internship.id,
        "other",
        file,
      );

      assertEquals(upload.response.status, 201);

      const responseDocument = upload.body.data;

      const persistedDocument = await getDocumentFromDatabase(
        responseDocument.id,
      );

      assertExists(persistedDocument);

      assertEquals(persistedDocument?.id, responseDocument.id);
      assertEquals(persistedDocument?.internship_id, internship.id);
      assertEquals(persistedDocument?.document_type, "other");
      assertEquals(persistedDocument?.file_name, "my document @ final.pdf");
      assertEquals(persistedDocument?.mime_type, "application/pdf");
      assertEquals(persistedDocument?.file_size, file.size);
      assertEquals(persistedDocument?.status, "pending");
      assertEquals(persistedDocument?.uploaded_by, student.id);

      /*
       * The service intentionally stores the original filename
       * in file_name while sanitizing the filename used in
       * storage_path.
       */
      assertNotEquals(
        persistedDocument?.storage_path,
        `my document @ final.pdf`,
      );
      assertStringIncludes(
        persistedDocument?.storage_path ?? "",
        `${internship.id}/${responseDocument.id}-`,
      );
    } finally {
      await cleanupInternship(internship.id);
    }
  },
);
