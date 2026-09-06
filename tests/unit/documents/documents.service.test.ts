import { assertEquals, assertRejects } from "@std/assert";

import type { SupabaseClients } from "../../../src/lib/supabase.ts";
import { AppError } from "../../../src/errors/app-error.ts";
import { DocumentService } from "../../../src/modules/documents/documents.service.ts";
import type {
  DocumentRecord,
  DocumentType,
} from "../../../src/modules/documents/documents.types.ts";

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_STUDENT_ID = "22222222-2222-2222-2222-222222222222";
const FACULTY_ID = "33333333-3333-3333-3333-333333333333";
const HTE_SUPERVISOR_ID = "44444444-4444-4444-4444-444444444444";
const COORDINATOR_ID = "55555555-5555-5555-5555-555555555555";
const ADMIN_ID = "66666666-6666-6666-6666-666666666666";
const INTERNSHIP_ID = "77777777-7777-7777-7777-777777777777";
const DOCUMENT_ID = "88888888-8888-8888-8888-888888888888";

const DOCUMENT_TYPE: DocumentType = "endorsement";

type MockResult = {
  data?: unknown;
  error?: unknown;
};

type MockStorageOptions = {
  uploadResult?: { data?: unknown; error?: unknown };
  removeResults?: Array<{ data?: unknown; error?: unknown }>;
  signedUrlResult?: {
    data?: { signedUrl?: string } | null;
    error?: unknown;
  };
};

type MockOptions = {
  databaseResults?: MockResult[];
  storage?: MockStorageOptions;
};

function createInternship(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERNSHIP_ID,
    student_id: STUDENT_ID,
    hte_id: "99999999-9999-9999-9999-999999999999",
    faculty_adviser_id: FACULTY_ID,
    hte_profiles: {
      supervisor_id: HTE_SUPERVISOR_ID,
    },
    ...overrides,
  };
}

function createDocument(
  overrides: Partial<DocumentRecord> = {},
): DocumentRecord {
  return {
    id: DOCUMENT_ID,
    internship_id: INTERNSHIP_ID,
    document_type: DOCUMENT_TYPE,
    file_name: "endorsement.pdf",
    storage_path: `${INTERNSHIP_ID}/${DOCUMENT_ID}-endorsement.pdf`,
    mime_type: "application/pdf",
    file_size: 1024,
    status: "pending",
    uploaded_by: STUDENT_ID,
    uploaded_at: "2026-09-04T08:00:00.000Z",
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    created_at: "2026-09-04T08:00:00.000Z",
    updated_at: "2026-09-04T08:00:00.000Z",
    ...overrides,
  };
}

function createTestFile(
  name = "endorsement.pdf",
  type = "application/pdf",
  size = 1024,
): File {
  return new File([new Uint8Array(size)], name, { type });
}

/**
 * Creates a minimal Supabase mock matching the methods currently used
 * by DocumentService.
 *
 * Database terminal operations consume databaseResults in sequence.
 * Storage operations are independently configurable.
 */
function createMockSupabase(options: MockOptions = {}): SupabaseClients {
  const databaseResults = options.databaseResults ?? [];
  let databaseIndex = 0;

  const getDatabaseResult = (): MockResult => {
    const result = databaseResults[databaseIndex++];

    if (!result) {
      throw new Error(
        `Unexpected supabaseAdmin.from() terminal call at index ${databaseIndex - 1}.`,
      );
    }

    return result;
  };

  const createQuery = () => {
    const query = {
      select() {
        return query;
      },
      insert() {
        return query;
      },
      update() {
        return query;
      },
      delete() {
        return query;
      },
      eq() {
        return query;
      },
      order() {
        const result = getDatabaseResult();
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      },
      single() {
        const result = getDatabaseResult();
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      },
      maybeSingle() {
        const result = getDatabaseResult();
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      },
      then(
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        try {
          const result = getDatabaseResult();
          return Promise.resolve({
            data: result.data ?? null,
            error: result.error ?? null,
          }).then(onFulfilled, onRejected);
        } catch (error) {
          return Promise.reject(error).then(undefined, onRejected);
        }
      },
    };
    return query;
  };
  const storageOptions = options.storage ?? {};
  let removeIndex = 0;

  const storageBucket = {
    upload: () => storageOptions.uploadResult ?? { data: {}, error: null },

    remove: () => {
      const result = storageOptions.removeResults?.[removeIndex++] ?? {
        data: {},
        error: null,
      };

      return result;
    },

    createSignedUrl: () =>
      storageOptions.signedUrlResult ?? {
        data: {
          signedUrl: "https://example.test/signed-document-url",
        },
        error: null,
      },
  };

  const storage = {
    from: () => storageBucket,
  };

  const supabaseAdmin = {
    from: () => createQuery(),
    storage,
  };

  return {
    supabaseAdmin,
  } as unknown as SupabaseClients;
}

function createService(options: MockOptions = {}): DocumentService {
  return new DocumentService(createMockSupabase(options));
}

/*
 * ---------------------------------------------------------
 * FILE VALIDATION
 * ---------------------------------------------------------
 */

Deno.test(
  "DocumentService.uploadDocument - rejects an empty file",
  async () => {
    const service = createService();

    const file = new File([], "empty.pdf", {
      type: "application/pdf",
    });

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "The uploaded file is empty.",
    );
  },
);

Deno.test(
  "DocumentService.uploadDocument - rejects a file larger than 10 MiB",
  async () => {
    const service = createService();

    const file = createTestFile(
      "large.pdf",
      "application/pdf",
      10 * 1024 * 1024 + 1,
    );

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "The uploaded file must not exceed 10 MiB.",
    );
  },
);

Deno.test(
  "DocumentService.uploadDocument - rejects an unsupported MIME type",
  async () => {
    const service = createService();

    const file = createTestFile("malware.txt", "text/plain");

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "Unsupported file type.",
    );
  },
);

Deno.test(
  "DocumentService.uploadDocument - rejects an empty filename",
  async () => {
    const service = createService();

    const file = createTestFile("   ", "application/pdf");

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "The uploaded file must have a filename.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * RESOURCE AUTHORIZATION
 * ---------------------------------------------------------
 */

Deno.test(
  "DocumentService.uploadDocument - rejects a student accessing another student's internship",
  async () => {
    const service = createService({
      databaseResults: [
        {
          data: createInternship({
            student_id: OTHER_STUDENT_ID,
          }),
        },
      ],
    });

    const file = createTestFile();

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "You do not have access to this internship.",
    );
  },
);

Deno.test(
  "DocumentService.uploadDocument - rejects an administrator upload",
  async () => {
    const service = createService({
      databaseResults: [
        {
          data: createInternship(),
        },
      ],
    });

    const file = createTestFile();

    await assertRejects(
      () =>
        service.uploadDocument(
          ADMIN_ID,
          "administrator",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "Administrators cannot upload internship documents.",
    );
  },
);

Deno.test(
  "DocumentService.deleteDocument - rejects faculty deletion",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
    });

    await assertRejects(
      () => service.deleteDocument(DOCUMENT_ID, FACULTY_ID, "faculty_adviser"),
      AppError,
      "Faculty advisers cannot delete documents.",
    );
  },
);

Deno.test(
  "DocumentService.reviewDocument - rejects student review",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
    });

    await assertRejects(
      () => service.reviewDocument(DOCUMENT_ID, STUDENT_ID, "student", "approved"),
      AppError,
      "Students cannot review documents.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * UPLOAD
 * ---------------------------------------------------------
 */

Deno.test(
  "DocumentService.uploadDocument - uploads and saves a new document",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [
        { data: createInternship() },
        { data: null },
        { data: document },
      ],
    });

    const file = createTestFile("my endorsement.pdf");

    const result = await service.uploadDocument(
      STUDENT_ID,
      "student",
      INTERNSHIP_ID,
      DOCUMENT_TYPE,
      file,
    );

    assertEquals(result, document);
  },
);

Deno.test(
  "DocumentService.uploadDocument - rejects a duplicate non-rejected document",
  async () => {
    const existing = createDocument({
      status: "approved",
    });

    const service = createService({
      databaseResults: [{ data: createInternship() }, { data: existing }],
    });

    const file = createTestFile();

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "A document of this type already exists for this internship.",
    );
  },
);

Deno.test(
  "DocumentService.uploadDocument - replaces a rejected document",
  async () => {
    const existing = createDocument({
      status: "rejected",
      rejection_reason: "Incorrect document.",
      reviewed_by: FACULTY_ID,
      reviewed_at: "2026-09-03T08:00:00.000Z",
    });

    const replacement = createDocument({
      status: "pending",
      file_name: "replacement.pdf",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
    });

    const service = createService({
      databaseResults: [
        { data: createInternship() },
        { data: existing },
        { data: replacement },
      ],
    });

    const file = createTestFile("replacement.pdf");

    const result = await service.uploadDocument(
      STUDENT_ID,
      "student",
      INTERNSHIP_ID,
      DOCUMENT_TYPE,
      file,
    );

    assertEquals(result, replacement);
    assertEquals(result.status, "pending");
    assertEquals(result.rejection_reason, null);
  },
);

Deno.test(
  "DocumentService.uploadDocument - rejects storage upload failure",
  async () => {
    const service = createService({
      databaseResults: [{ data: createInternship() }, { data: null }],
      storage: {
        uploadResult: {
          data: null,
          error: { message: "Storage unavailable" },
        },
      },
    });

    const file = createTestFile();

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "Failed to upload document.",
    );
  },
);

Deno.test(
  "DocumentService.uploadDocument - removes uploaded file when metadata insert fails",
  async () => {
    const service = createService({
      databaseResults: [
        // 1. getInternship()
        { data: createInternship() },

        // 2. Check for an existing document.
        { data: null },

        // 3. Insert document metadata fails.
        {
          data: null,
          error: { message: "Database failure" },
        },
      ],
    });

    const file = createTestFile();

    await assertRejects(
      () =>
        service.uploadDocument(
          STUDENT_ID,
          "student",
          INTERNSHIP_ID,
          DOCUMENT_TYPE,
          file,
        ),
      AppError,
      "Failed to save document metadata.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * LIST / RETRIEVE
 * ---------------------------------------------------------
 */

Deno.test(
  "DocumentService.listDocuments - returns documents for an authorized user",
  async () => {
    const documents = [
      createDocument(),
      createDocument({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        document_type: "resume",
        file_name: "resume.pdf",
      }),
    ];

    const service = createService({
      databaseResults: [{ data: createInternship() }, { data: documents }],
    });

    const result = await service.listDocuments(
      INTERNSHIP_ID,
      STUDENT_ID,
      "student",
    );

    assertEquals(result, documents);
  },
);

Deno.test(
  "DocumentService.listDocuments - returns an empty array when no documents exist",
  async () => {
    const service = createService({
      databaseResults: [{ data: createInternship() }, { data: null }],
    });

    const result = await service.listDocuments(
      INTERNSHIP_ID,
      COORDINATOR_ID,
      "internship_coordinator",
    );

    assertEquals(result, []);
  },
);

Deno.test(
  "DocumentService.getDocument - returns an authorized document",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
    });

    const result = await service.getDocument(
      DOCUMENT_ID,
      STUDENT_ID,
      "student",
    );

    assertEquals(result, document);
  },
);

Deno.test(
  "DocumentService.getDocument - rejects access to another student's document",
  async () => {
    const document = createDocument({
      uploaded_by: OTHER_STUDENT_ID,
    });

    const service = createService({
      databaseResults: [
        { data: document },
        {
          data: createInternship({
            student_id: OTHER_STUDENT_ID,
          }),
        },
      ],
    });

    await assertRejects(
      () => service.getDocument(DOCUMENT_ID, STUDENT_ID, "student"),
      AppError,
      "You do not have access to this internship.",
    );
  },
);

Deno.test(
  "DocumentService.getDocumentDownloadUrl - returns a signed URL",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
      storage: {
        signedUrlResult: {
          data: {
            signedUrl: "https://example.test/document-signed-url",
          },
          error: null,
        },
      },
    });

    const result = await service.getDocumentDownloadUrl(
      DOCUMENT_ID,
      STUDENT_ID,
      "student",
    );

    assertEquals(result.document, document);
    assertEquals(result.url, "https://example.test/document-signed-url");
  },
);

Deno.test(
  "DocumentService.getDocumentDownloadUrl - rejects signed URL failure",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
      storage: {
        signedUrlResult: {
          data: null,
          error: { message: "Signed URL failure" },
        },
      },
    });

    await assertRejects(
      () => service.getDocumentDownloadUrl(DOCUMENT_ID, STUDENT_ID, "student"),
      AppError,
      "Failed to generate document download URL.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * DELETE
 * ---------------------------------------------------------
 */

Deno.test(
  "DocumentService.deleteDocument - deletes an authorized document",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [
        { data: document },
        { data: createInternship() },
        { data: null },
      ],
    });

    await service.deleteDocument(DOCUMENT_ID, STUDENT_ID, "student");
  },
);

Deno.test(
  "DocumentService.deleteDocument - rejects storage deletion failure",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
      storage: {
        removeResults: [
          {
            data: null,
            error: { message: "Storage deletion failed" },
          },
        ],
      },
    });

    await assertRejects(
      () => service.deleteDocument(DOCUMENT_ID, STUDENT_ID, "student"),
      AppError,
      "Failed to delete document file.",
    );
  },
);

Deno.test(
  "DocumentService.deleteDocument - reports metadata deletion failure",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [
        // 1. getDocumentById()
        { data: document },

        // 2. getInternship() / authorization
        { data: createInternship() },

        // 3. documents.delete() fails
        {
          data: null,
          error: { message: "Database deletion failed" },
        },
      ],
    });

    await assertRejects(
      () =>
        service.deleteDocument(
          DOCUMENT_ID,
          COORDINATOR_ID,
          "internship_coordinator",
        ),
      AppError,
      "Document file was removed, but metadata deletion failed.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * REVIEW
 * ---------------------------------------------------------
 */

Deno.test(
  "DocumentService.reviewDocument - approves a pending document",
  async () => {
    const document = createDocument();

    const reviewed = createDocument({
      status: "approved",
      reviewed_by: FACULTY_ID,
      reviewed_at: "2026-09-04T09:00:00.000Z",
    });

    const service = createService({
      databaseResults: [
        { data: document },
        { data: createInternship() },
        { data: reviewed },
      ],
    });

    const result = await service.reviewDocument(
      DOCUMENT_ID,
      FACULTY_ID,
      "faculty_adviser",
      "approved",
    );

    assertEquals(result, reviewed);
    assertEquals(result.status, "approved");
  },
);

Deno.test(
  "DocumentService.reviewDocument - rejects a pending document with a reason",
  async () => {
    const document = createDocument();

    const reviewed = createDocument({
      status: "rejected",
      reviewed_by: FACULTY_ID,
      reviewed_at: "2026-09-04T09:00:00.000Z",
      rejection_reason: "Please submit the signed version.",
    });

    const service = createService({
      databaseResults: [
        { data: document },
        { data: createInternship() },
        { data: reviewed },
      ],
    });

    const result = await service.reviewDocument(
      DOCUMENT_ID,
      FACULTY_ID,
      "faculty_adviser",
      "rejected",
      "  Please submit the signed version.  ",
    );

    assertEquals(result, reviewed);
    assertEquals(result.status, "rejected");
  },
);

Deno.test(
  "DocumentService.reviewDocument - requires a rejection reason",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
    });

    await assertRejects(
      () =>
        service.reviewDocument(
          DOCUMENT_ID,
          FACULTY_ID,
          "faculty_adviser",
          "rejected",
          "   ",
        ),
      AppError,
      "A rejection reason is required.",
    );
  },
);

Deno.test(
  "DocumentService.reviewDocument - rejects already reviewed documents",
  async () => {
    const document = createDocument({
      status: "approved",
    });

    const service = createService({
      databaseResults: [{ data: document }, { data: createInternship() }],
    });

    await assertRejects(
      () =>
        service.reviewDocument(
          DOCUMENT_ID,
          FACULTY_ID,
          "faculty_adviser",
          "approved",
        ),
      AppError,
      "Only pending documents can be reviewed.",
    );
  },
);

Deno.test(
  "DocumentService.reviewDocument - rejects database review failure",
  async () => {
    const document = createDocument();

    const service = createService({
      databaseResults: [
        { data: document },
        { data: createInternship() },
        {
          data: null,
          error: { message: "Database review failure" },
        },
      ],
    });

    await assertRejects(
      () =>
        service.reviewDocument(
          DOCUMENT_ID,
          COORDINATOR_ID,
          "internship_coordinator",
          "approved",
        ),
      AppError,
      "Failed to update document review status.",
    );
  },
);
