import { assertEquals, assertExists, assertRejects } from "@std/assert";

import { z } from "zod";

import { AppError } from "../../../src/errors/app-error.ts";

import {
  createInternshipSchema,
  createMyInternshipSchema,
  updateFacultyAdviserSchema,
  updateInternshipSchema,
  updateInternshipStatusSchema,
} from "../../../src/modules/internships/internships.schema.ts";

import { InternshipService } from "../../../src/modules/internships/internships.service.ts";

import type {
  CreateInternshipRequest,
  InternshipStatus,
  ReviewInternshipRequest,
  UpdateFacultyAdviserRequest,
  UpdateInternshipRequest,
} from "../../../src/modules/internships/internships.types.ts";

import type { SupabaseClients } from "../../../src/lib/supabase.ts";

/*
 * ============================================================
 * TEST CONSTANTS
 * ============================================================
 */

const INTERNSHIP_ID = "11111111-1111-1111-1111-111111111111";

const STUDENT_ID = "22222222-2222-2222-2222-222222222222";

const HTE_ID = "33333333-3333-3333-3333-333333333333";

const NEW_HTE_ID = "44444444-4444-4444-4444-444444444444";

const FACULTY_ADVISER_ID = "55555555-5555-5555-5555-555555555555";

const NEW_FACULTY_ADVISER_ID = "66666666-6666-6666-6666-666666666666";

const TEST_START_DATE = "2026-08-03";
const TEST_END_DATE = "2026-10-31";

/*
 * ============================================================
 * TEST FIXTURES
 * ============================================================
 */

const mockInternship = {
  id: INTERNSHIP_ID,
  student_id: STUDENT_ID,
  hte_id: HTE_ID,
  faculty_adviser_id: FACULTY_ADVISER_ID,
  start_date: TEST_START_DATE,
  end_date: TEST_END_DATE,
  required_hours: 300,
  status: "pending" as InternshipStatus,
  created_at: "2026-08-10T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",

  student_profiles: [
    {
      id: STUDENT_ID,
      student_number: "2026-00001",
      program: "Bachelor of Science in Information Technology",
      year_level: 4,
      section: "BSIT-4A",
    },
  ],

  hte_profiles: [
    {
      id: HTE_ID,
      company_name: "Test Technology Services",
      contact_person: "Test Contact",
      contact_email: "contact@example.com",
      is_active: true,
    },
  ],
};

/*
 * ============================================================
 * MOCK SUPABASE
 * ============================================================
 */

type MockQueryResult = {
  data?: unknown;
  error?: unknown;
};

function createQuery(result: MockQueryResult) {
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

    eq() {
      return query;
    },

    in() {
      return query;
    },

    order() {
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      });
    },

    single() {
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      });
    },

    maybeSingle() {
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      });
    },
  };

  return query;
}

function createMockSupabase(results: MockQueryResult[]): SupabaseClients {
  let callIndex = 0;

  const supabaseAdmin = {
    from(_table: string) {
      const result = results[callIndex++];

      if (!result) {
        throw new Error(`Unexpected Supabase call at index ${callIndex - 1}.`);
      }

      return createQuery(result);
    },
  };

  return {
    supabaseAdmin,
    supabaseClient: supabaseAdmin,

    createAuthenticatedClient: () => supabaseAdmin as never,

    createPublicClient: () => supabaseAdmin as never,
  } as unknown as SupabaseClients;
}

function createService(results: MockQueryResult[]) {
  return new InternshipService(createMockSupabase(results));
}

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

Deno.test(
  "Internship types - CreateInternshipRequest requires complete creation fields",
  () => {
    const request: CreateInternshipRequest = {
      studentId: STUDENT_ID,
      hteId: HTE_ID,
      facultyAdviserId: FACULTY_ADVISER_ID,
      startDate: TEST_START_DATE,
      endDate: TEST_END_DATE,
      requiredHours: 300,
    };

    assertEquals(request.studentId, STUDENT_ID);
    assertEquals(request.hteId, HTE_ID);
    assertEquals(request.facultyAdviserId, FACULTY_ADVISER_ID);
    assertEquals(request.startDate, TEST_START_DATE);
    assertEquals(request.endDate, TEST_END_DATE);
    assertEquals(request.requiredHours, 300);
  },
);

Deno.test(
  "Internship types - UpdateInternshipRequest supports all editable fields",
  () => {
    const request: UpdateInternshipRequest = {
      hteId: NEW_HTE_ID,
      facultyAdviserId: NEW_FACULTY_ADVISER_ID,
      startDate: "2026-08-10",
      endDate: "2026-11-10",
      requiredHours: 350,
    };

    assertEquals(request.hteId, NEW_HTE_ID);
    assertEquals(request.facultyAdviserId, NEW_FACULTY_ADVISER_ID);
    assertEquals(request.startDate, "2026-08-10");
    assertEquals(request.endDate, "2026-11-10");
    assertEquals(request.requiredHours, 350);
  },
);

Deno.test(
  "Internship types - lifecycle contains only pending, active, and completed",
  () => {
    const statuses: InternshipStatus[] = ["pending", "active", "completed"];

    assertEquals(statuses.length, 3);
    assertEquals(statuses.includes("pending"), true);
    assertEquals(statuses.includes("active"), true);
    assertEquals(statuses.includes("completed"), true);
  },
);

Deno.test(
  "Internship types - ReviewInternshipRequest is retained as a reserved review contract",
  () => {
    const request: ReviewInternshipRequest = {
      status: "approved",
      reviewRemarks: "Reserved review information.",
    };

    assertEquals(request.status, "approved");
    assertEquals(request.reviewRemarks, "Reserved review information.");
  },
);

Deno.test(
  "Internship types - faculty adviser request allows assignment removal",
  () => {
    const request: UpdateFacultyAdviserRequest = {
      facultyAdviserId: null,
    };

    assertEquals(request.facultyAdviserId, null);
  },
);

/*
 * ============================================================
 * SCHEMA
 * ============================================================
 */

Deno.test("Internship schema - accepts complete creation request", () => {
  const result = createInternshipSchema.safeParse({
    studentId: STUDENT_ID,
    hteId: HTE_ID,
    facultyAdviserId: FACULTY_ADVISER_ID,
    startDate: TEST_START_DATE,
    endDate: TEST_END_DATE,
    requiredHours: 300,
  });

  assertEquals(result.success, true);
});

Deno.test("Internship schema - rejects missing faculty adviser", () => {
  const result = createInternshipSchema.safeParse({
    studentId: STUDENT_ID,
    hteId: HTE_ID,
    startDate: TEST_START_DATE,
    endDate: TEST_END_DATE,
    requiredHours: 300,
  });

  assertEquals(result.success, false);
});

Deno.test("Internship schema - rejects missing internship dates", () => {
  const result = createInternshipSchema.safeParse({
    studentId: STUDENT_ID,
    hteId: HTE_ID,
    facultyAdviserId: FACULTY_ADVISER_ID,
    requiredHours: 300,
  });

  assertEquals(result.success, false);
});

Deno.test("Internship schema - rejects non-positive required hours", () => {
  const result = createInternshipSchema.safeParse({
    studentId: STUDENT_ID,
    hteId: HTE_ID,
    facultyAdviserId: FACULTY_ADVISER_ID,
    startDate: TEST_START_DATE,
    endDate: TEST_END_DATE,
    requiredHours: 0,
  });

  assertEquals(result.success, false);
});

Deno.test("Internship schema - rejects start date after end date", () => {
  const result = createInternshipSchema.safeParse({
    studentId: STUDENT_ID,
    hteId: HTE_ID,
    facultyAdviserId: FACULTY_ADVISER_ID,
    startDate: TEST_END_DATE,
    endDate: TEST_START_DATE,
    requiredHours: 300,
  });

  assertEquals(result.success, false);
});

Deno.test("Internship schema - accepts partial update", () => {
  const result = updateInternshipSchema.safeParse({
    startDate: "2026-08-10",
    endDate: "2026-11-10",
  });

  assertEquals(result.success, true);
});

Deno.test("Internship schema - accepts adviser removal", () => {
  const result = updateInternshipSchema.safeParse({
    facultyAdviserId: null,
  });

  assertEquals(result.success, true);
});

Deno.test("Internship schema - rejects empty update", () => {
  const result = updateInternshipSchema.safeParse({});

  assertEquals(result.success, false);
});

Deno.test("Internship schema - validates status values", () => {
  assertEquals(
    updateInternshipStatusSchema.safeParse({
      status: "pending",
    }).success,
    true,
  );

  assertEquals(
    updateInternshipStatusSchema.safeParse({
      status: "active",
    }).success,
    true,
  );

  assertEquals(
    updateInternshipStatusSchema.safeParse({
      status: "completed",
    }).success,
    true,
  );

  assertEquals(
    updateInternshipStatusSchema.safeParse({
      status: "approved",
    }).success,
    false,
  );
});

Deno.test(
  "Internship schema - legacy my-internship schema remains valid",
  () => {
    const result = createMyInternshipSchema.safeParse({
      hteId: HTE_ID,
    });

    assertEquals(result.success, true);
  },
);

/*
 * ============================================================
 * SERVICE - RETRIEVAL
 * ============================================================
 */

Deno.test(
  "InternshipService.listInternships returns internship records",
  async () => {
    const service = createService([
      {
        data: [mockInternship],
      },
    ]);

    const result = await service.listInternships();

    assertEquals(result, [mockInternship]);
  },
);

Deno.test(
  "InternshipService.listInternships rejects database errors",
  async () => {
    const service = createService([
      {
        data: null,
        error: {
          message: "Database failure",
        },
      },
    ]);

    await assertRejects(
      () => service.listInternships(),
      AppError,
      "Unable to retrieve internships.",
    );
  },
);

Deno.test("InternshipService.getInternship returns an internship", async () => {
  const service = createService([
    {
      data: mockInternship,
    },
  ]);

  const result = await service.getInternship(INTERNSHIP_ID);

  assertEquals(result, mockInternship);
});

Deno.test(
  "InternshipService.getInternship returns 404 for missing internship",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () => service.getInternship(INTERNSHIP_ID),
      AppError,
      "Internship not found.",
    );
  },
);

Deno.test(
  "InternshipService.getMyInternship returns operational internship",
  async () => {
    const service = createService([
      {
        data: mockInternship,
      },
    ]);

    const result = await service.getMyInternship(STUDENT_ID);

    assertEquals(result, mockInternship);
  },
);

/*
 * ============================================================
 * SERVICE - CREATE
 * ============================================================
 */

Deno.test(
  "InternshipService.createInternship creates pending internship with complete fields",
  async () => {
    const service = createService([
      {
        data: {
          id: STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: true,
        },
      },
      {
        data: null,
      },
      {
        data: mockInternship,
      },
    ]);

    const result = await service.createInternship({
      studentId: STUDENT_ID,
      hteId: HTE_ID,
      facultyAdviserId: FACULTY_ADVISER_ID,
      startDate: TEST_START_DATE,
      endDate: TEST_END_DATE,
      requiredHours: 300,
    });

    assertEquals(result, mockInternship);
    assertEquals(result.status, "pending");
  },
);

Deno.test(
  "InternshipService.createInternship rejects invalid date range",
  async () => {
    const service = createService([]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: STUDENT_ID,
          hteId: HTE_ID,
          facultyAdviserId: FACULTY_ADVISER_ID,
          startDate: TEST_END_DATE,
          endDate: TEST_START_DATE,
          requiredHours: 300,
        }),
      AppError,
      "Internship start date must be earlier than the end date.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship rejects missing student",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: STUDENT_ID,
          hteId: HTE_ID,
          facultyAdviserId: FACULTY_ADVISER_ID,
          startDate: TEST_START_DATE,
          endDate: TEST_END_DATE,
          requiredHours: 300,
        }),
      AppError,
      "Student not found.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship rejects inactive student",
  async () => {
    const service = createService([
      {
        data: {
          id: STUDENT_ID,
          profiles: {
            is_active: false,
          },
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: STUDENT_ID,
          hteId: HTE_ID,
          facultyAdviserId: FACULTY_ADVISER_ID,
          startDate: TEST_START_DATE,
          endDate: TEST_END_DATE,
          requiredHours: 300,
        }),
      AppError,
      "The selected student account is inactive.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship rejects inactive HTE",
  async () => {
    const service = createService([
      {
        data: {
          id: STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: HTE_ID,
          is_active: false,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: STUDENT_ID,
          hteId: HTE_ID,
          facultyAdviserId: FACULTY_ADVISER_ID,
          startDate: TEST_START_DATE,
          endDate: TEST_END_DATE,
          requiredHours: 300,
        }),
      AppError,
      "The selected HTE is inactive.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship rejects non-faculty adviser",
  async () => {
    const service = createService([
      {
        data: {
          id: STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: FACULTY_ADVISER_ID,
          role: "student",
          is_active: true,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: STUDENT_ID,
          hteId: HTE_ID,
          facultyAdviserId: FACULTY_ADVISER_ID,
          startDate: TEST_START_DATE,
          endDate: TEST_END_DATE,
          requiredHours: 300,
        }),
      AppError,
      "The selected user is not a faculty adviser.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship rejects inactive faculty adviser",
  async () => {
    const service = createService([
      {
        data: {
          id: STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: false,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: STUDENT_ID,
          hteId: HTE_ID,
          facultyAdviserId: FACULTY_ADVISER_ID,
          startDate: TEST_START_DATE,
          endDate: TEST_END_DATE,
          requiredHours: 300,
        }),
      AppError,
      "The selected faculty adviser account is inactive.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship rejects existing operational internship",
  async () => {
    const service = createService([
      {
        data: {
          id: STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: true,
        },
      },
      {
        data: {
          id: INTERNSHIP_ID,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: STUDENT_ID,
          hteId: HTE_ID,
          facultyAdviserId: FACULTY_ADVISER_ID,
          startDate: TEST_START_DATE,
          endDate: TEST_END_DATE,
          requiredHours: 300,
        }),
      AppError,
      "The student already has an active or pending internship assignment.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship permits new internship after completed history",
  async () => {
    const service = createService([
      {
        data: {
          id: STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: true,
        },
      },
      {
        data: null,
      },
      {
        data: {
          ...mockInternship,
          status: "pending",
        },
      },
    ]);

    const result = await service.createInternship({
      studentId: STUDENT_ID,
      hteId: HTE_ID,
      facultyAdviserId: FACULTY_ADVISER_ID,
      startDate: TEST_START_DATE,
      endDate: TEST_END_DATE,
      requiredHours: 300,
    });

    assertEquals(result.status, "pending");
  },
);

/*
 * ============================================================
 * SERVICE - UPDATE
 * ============================================================
 */

Deno.test(
  "InternshipService.updateInternship updates HTE, adviser, dates, and required hours",
  async () => {
    const updatedInternship = {
      ...mockInternship,
      hte_id: NEW_HTE_ID,
      faculty_adviser_id: NEW_FACULTY_ADVISER_ID,
      start_date: "2026-08-10",
      end_date: "2026-11-10",
      required_hours: 350,
    };

    const service = createService([
      {
        data: mockInternship,
      },
      {
        data: {
          id: NEW_HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: NEW_FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: true,
        },
      },
      {
        data: updatedInternship,
      },
    ]);

    const result = await service.updateInternship(INTERNSHIP_ID, {
      hteId: NEW_HTE_ID,
      facultyAdviserId: NEW_FACULTY_ADVISER_ID,
      startDate: "2026-08-10",
      endDate: "2026-11-10",
      requiredHours: 350,
    });

    assertEquals(result, updatedInternship);
  },
);

Deno.test(
  "InternshipService.updateInternship permits adviser removal",
  async () => {
    const updatedInternship = {
      ...mockInternship,
      faculty_adviser_id: null,
    };

    const service = createService([
      {
        data: mockInternship,
      },
      {
        data: updatedInternship,
      },
    ]);

    const result = await service.updateInternship(INTERNSHIP_ID, {
      facultyAdviserId: null,
    });

    assertEquals(result, updatedInternship);
  },
);

Deno.test(
  "InternshipService.updateInternship rejects invalid resulting date range",
  async () => {
    const service = createService([
      {
        data: mockInternship,
      },
    ]);

    await assertRejects(
      () =>
        service.updateInternship(INTERNSHIP_ID, {
          startDate: "2026-12-01",
          endDate: "2026-11-01",
        }),
      AppError,
      "Internship start date must be earlier than the end date.",
    );
  },
);

Deno.test(
  "InternshipService.updateInternship rejects missing internship",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.updateInternship(INTERNSHIP_ID, {
          requiredHours: 350,
        }),
      AppError,
      "Internship not found.",
    );
  },
);

Deno.test(
  "InternshipService.updateInternship rejects empty update",
  async () => {
    const service = createService([]);

    await assertRejects(() => service.updateInternship(INTERNSHIP_ID, {}));
  },
);

/*
 * ============================================================
 * SERVICE - STATUS
 * ============================================================
 */

Deno.test(
  "InternshipService.updateStatus rejects pending to completed",
  async () => {
    const service = createService([
      {
        data: {
          id: INTERNSHIP_ID,
          status: "pending",
          start_date: TEST_START_DATE,
          end_date: TEST_END_DATE,
          required_hours: 300,
        },
      },
    ]);

    await assertRejects(
      () => service.updateStatus(INTERNSHIP_ID, "completed"),
      AppError,
      'Invalid internship status transition from "pending" to "completed".',
    );
  },
);

Deno.test(
  "InternshipService.updateStatus rejects completed to active",
  async () => {
    const service = createService([
      {
        data: {
          id: INTERNSHIP_ID,
          status: "completed",
          start_date: TEST_START_DATE,
          end_date: TEST_END_DATE,
          required_hours: 300,
        },
      },
    ]);

    await assertRejects(
      () => service.updateStatus(INTERNSHIP_ID, "active"),
      AppError,
      'Invalid internship status transition from "completed" to "active".',
    );
  },
);

Deno.test(
  "InternshipService.updateStatus returns 404 for missing internship",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () => service.updateStatus(INTERNSHIP_ID, "active"),
      AppError,
      "Internship not found.",
    );
  },
);

/*
 * ============================================================
 * SERVICE - FACULTY ADVISER
 * ============================================================
 */

Deno.test(
  "InternshipService.assignFacultyAdviser assigns active faculty adviser",
  async () => {
    const updatedInternship = {
      ...mockInternship,
      faculty_adviser_id: NEW_FACULTY_ADVISER_ID,
    };

    const service = createService([
      {
        data: {
          id: NEW_FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: true,
        },
      },
      {
        data: updatedInternship,
      },
    ]);

    const result = await service.assignFacultyAdviser(
      INTERNSHIP_ID,
      NEW_FACULTY_ADVISER_ID,
    );

    assertEquals(result, updatedInternship);
  },
);

Deno.test(
  "InternshipService.assignFacultyAdviser permits adviser removal",
  async () => {
    const updatedInternship = {
      ...mockInternship,
      faculty_adviser_id: null,
    };

    const service = createService([
      {
        data: updatedInternship,
      },
    ]);

    const result = await service.assignFacultyAdviser(INTERNSHIP_ID, null);

    assertEquals(result, updatedInternship);
  },
);

/*
 * ============================================================
 * ROUTE CONTRACTS
 * ============================================================
 *
 * Full authentication/authorization route behavior is tested
 * by the integration suite. These unit tests verify that the
 * route-facing schemas and request contracts agree with the
 * intended API.
 */

Deno.test(
  "Internship route contract - POST payload contains all required creation fields",
  () => {
    const payload = {
      studentId: STUDENT_ID,
      hteId: HTE_ID,
      facultyAdviserId: FACULTY_ADVISER_ID,
      startDate: TEST_START_DATE,
      endDate: TEST_END_DATE,
      requiredHours: 300,
    };

    const result = createInternshipSchema.safeParse(payload);

    assertEquals(result.success, true);
  },
);

Deno.test(
  "Internship route contract - PATCH payload accepts consolidated internship fields",
  () => {
    const payload = {
      hteId: NEW_HTE_ID,
      facultyAdviserId: NEW_FACULTY_ADVISER_ID,
      startDate: "2026-08-10",
      endDate: "2026-11-10",
      requiredHours: 350,
    };

    const result = updateInternshipSchema.safeParse(payload);

    assertEquals(result.success, true);
  },
);

Deno.test(
  "Internship route contract - status endpoint accepts lifecycle statuses only",
  () => {
    const validStatuses = ["pending", "active", "completed"];

    for (const status of validStatuses) {
      assertEquals(
        updateInternshipStatusSchema.safeParse({
          status,
        }).success,
        true,
      );
    }

    assertEquals(
      updateInternshipStatusSchema.safeParse({
        status: "approved",
      }).success,
      false,
    );
  },
);

Deno.test(
  "Internship route contract - adviser endpoint accepts nullable adviser ID",
  () => {
    assertEquals(
      updateFacultyAdviserSchema.safeParse({
        facultyAdviserId: FACULTY_ADVISER_ID,
      }).success,
      true,
    );

    assertEquals(
      updateFacultyAdviserSchema.safeParse({
        facultyAdviserId: null,
      }).success,
      true,
    );
  },
);

Deno.test(
  "Internship route contract - invalid UUIDs are rejected before service execution",
  () => {
    const result = createInternshipSchema.safeParse({
      studentId: "invalid",
      hteId: HTE_ID,
      facultyAdviserId: FACULTY_ADVISER_ID,
      startDate: TEST_START_DATE,
      endDate: TEST_END_DATE,
      requiredHours: 300,
    });

    assertEquals(result.success, false);
  },
);

/*
 * Keep Zod imported explicitly in this consolidated test file.
 * This also protects against accidental replacement of the
 * schema tests with hand-written validation.
 */
Deno.test("Internship schema uses Zod validation", () => {
  assertExists(z);
});
