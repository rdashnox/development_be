// tests/unit/internships/internships.service.test.ts

import { assertEquals, assertRejects } from "@std/assert";

import { AppError } from "../../../src/errors/app-error.ts";
import { InternshipService } from "../../../src/modules/internships/internships.service.ts";

import type { SupabaseClients } from "../../../src/lib/supabase.ts";

const TEST_INTERNSHIP_ID = "11111111-1111-1111-1111-111111111111";
const TEST_STUDENT_ID = "22222222-2222-2222-2222-222222222222";
const TEST_HTE_ID = "33333333-3333-3333-3333-333333333333";
const TEST_NEW_HTE_ID = "44444444-4444-4444-4444-444444444444";
const TEST_FACULTY_ADVISER_ID = "55555555-5555-5555-5555-555555555555";

const mockInternship = {
  id: TEST_INTERNSHIP_ID,
  student_id: TEST_STUDENT_ID,
  hte_id: TEST_HTE_ID,
  faculty_adviser_id: null,
  required_hours: 300,
  status: "pending",
  created_at: "2026-08-10T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",

  student_profiles: [
    {
      id: TEST_STUDENT_ID,
      student_number: "2026-00001",
      program: "Bachelor of Science in Information Technology",
      year_level: 4,
      section: "BSIT-4A",
    },
  ],

  hte_profiles: [
    {
      id: TEST_HTE_ID,
      company_name: "Test Technology Services",
      contact_person: "Test Contact",
      contact_email: "contact@example.com",
      is_active: true,
    },
  ],
};

type MockQueryResult = {
  data?: unknown;
  error?: unknown;
};

/**
 * Creates a minimal Supabase query builder that supports
 * the methods currently used by InternshipService.
 */
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

    neq() {
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

/**
 * Creates a mocked SupabaseClients object.
 *
 * Each call to supabaseAdmin.from() consumes the next
 * response from the supplied sequence.
 */
function createMockSupabase(
  results: MockQueryResult[],
): SupabaseClients {
  let callIndex = 0;

  const supabaseAdmin = {
    from(_table: string) {
      const result = results[callIndex++];

      if (!result) {
        throw new Error(
          `Unexpected Supabase call at index ${callIndex - 1}.`,
        );
      }

      return createQuery(result);
    },

    auth: {
      admin: {
        signOut: () => ({
          error: null,
        }),

        updateUserById: () => ({
          data: {
            user: {
              id: TEST_STUDENT_ID,
            },
          },
          error: null,
        }),
      },
    },
  };

  const supabaseClient = {
    auth: {
      signInWithPassword: () => ({
        data: {
          user: {
            id: TEST_STUDENT_ID,
          },
          session: {
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
          },
        },
        error: null,
      }),

      refreshSession: () => ({
        data: {
          session: {
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            user: {
              id: TEST_STUDENT_ID,
            },
          },
        },
        error: null,
      }),

      resetPasswordForEmail: () => ({
        error: null,
      }),
    },
  };

  return {
    supabaseAdmin,
    supabaseClient,

    createAuthenticatedClient: () => supabaseClient as never,

    createPublicClient: () => supabaseClient as never,
  } as unknown as SupabaseClients;
}

function createService(results: MockQueryResult[]) {
  return new InternshipService(createMockSupabase(results));
}

/*
 * ---------------------------------------------------------
 * LIST
 * ---------------------------------------------------------
 */

Deno.test(
  "InternshipService.listInternships should return internship records",
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
  "InternshipService.listInternships should reject Supabase errors",
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

/*
 * ---------------------------------------------------------
 * GET
 * ---------------------------------------------------------
 */

Deno.test(
  "InternshipService.getInternship should return an internship",
  async () => {
    const service = createService([
      {
        data: mockInternship,
      },
    ]);

    const result = await service.getInternship(
      TEST_INTERNSHIP_ID,
    );

    assertEquals(result, mockInternship);
  },
);

Deno.test(
  "InternshipService.getInternship should return 404 when internship does not exist",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () => service.getInternship(TEST_INTERNSHIP_ID),
      AppError,
      "Internship not found.",
    );
  },
);

Deno.test(
  "InternshipService.getInternship should reject Supabase errors",
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
      () => service.getInternship(TEST_INTERNSHIP_ID),
      AppError,
      "Unable to retrieve the internship.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * GET MY INTERNSHIP
 * ---------------------------------------------------------
 */

Deno.test(
  "InternshipService.getMyInternship should return the student's pending internship",
  async () => {
    const service = createService([
      {
        data: mockInternship,
      },
    ]);

    const result = await service.getMyInternship(TEST_STUDENT_ID);

    assertEquals(result, mockInternship);
  },
);

Deno.test(
  "InternshipService.getMyInternship should return the student's active internship",
  async () => {
    const activeInternship = {
      ...mockInternship,
      status: "active",
    };

    const service = createService([
      {
        data: activeInternship,
      },
    ]);

    const result = await service.getMyInternship(TEST_STUDENT_ID);

    assertEquals(result, activeInternship);
  },
);

Deno.test(
  "InternshipService.getMyInternship should return 404 when no operational internship exists",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () => service.getMyInternship(TEST_STUDENT_ID),
      AppError,
      "No internship assignment found.",
    );
  },
);

Deno.test(
  "InternshipService.getMyInternship should reject Supabase errors",
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
      () => service.getMyInternship(TEST_STUDENT_ID),
      AppError,
      "Unable to retrieve your internship.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * CREATE
 * ---------------------------------------------------------
 */

Deno.test(
  "InternshipService.createInternship should create a pending internship assignment",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: TEST_HTE_ID,
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
      studentId: TEST_STUDENT_ID,
      hteId: TEST_HTE_ID,
      requiredHours: 300,
    });

    assertEquals(result, mockInternship);
  },
);

Deno.test(
  "InternshipService.createInternship should allow nullable required hours",
  async () => {
    const internshipWithoutHours = {
      ...mockInternship,
      required_hours: null,
    };

    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: TEST_HTE_ID,
          is_active: true,
        },
      },
      {
        data: null,
      },
      {
        data: internshipWithoutHours,
      },
    ]);

    const result = await service.createInternship({
      studentId: TEST_STUDENT_ID,
      hteId: TEST_HTE_ID,
    });

    assertEquals(result, internshipWithoutHours);
  },
);

Deno.test(
  "InternshipService.createInternship should reject a missing student",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "Student not found.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should reject student verification errors",
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
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "Unable to verify the student.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should reject an inactive student",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: false,
          },
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "The selected student account is inactive.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should reject a missing HTE",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "HTE not found.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should reject HTE verification errors",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: null,
        error: {
          message: "Database failure",
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "Unable to verify the HTE.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should reject an inactive HTE",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: TEST_HTE_ID,
          is_active: false,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "The selected HTE is inactive.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should reject an existing pending internship",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: TEST_HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: TEST_INTERNSHIP_ID,
          status: "pending",
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "The student already has an active or pending internship assignment.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should reject an existing active internship",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: TEST_HTE_ID,
          is_active: true,
        },
      },
      {
        data: {
          id: TEST_INTERNSHIP_ID,
          status: "active",
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createInternship({
          studentId: TEST_STUDENT_ID,
          hteId: TEST_HTE_ID,
        }),
      AppError,
      "The student already has an active or pending internship assignment.",
    );
  },
);

Deno.test(
  "InternshipService.createInternship should allow a new internship after completed history",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_STUDENT_ID,
          profiles: {
            is_active: true,
          },
        },
      },
      {
        data: {
          id: TEST_HTE_ID,
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
      studentId: TEST_STUDENT_ID,
      hteId: TEST_HTE_ID,
      requiredHours: 300,
    });

    assertEquals(result.status, "pending");
  },
);

/*
 * ---------------------------------------------------------
 * STATUS
 * ---------------------------------------------------------
 */

Deno.test(
  "InternshipService.updateStatus should transition pending to active",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_INTERNSHIP_ID,
          status: "pending",
        },
      },
      {
        data: {
          ...mockInternship,
          status: "active",
        },
      },
    ]);

    const result = await service.updateStatus(
      TEST_INTERNSHIP_ID,
      "active",
    );

    assertEquals(result.status, "active");
  },
);

Deno.test(
  "InternshipService.updateStatus should transition active to completed",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_INTERNSHIP_ID,
          status: "active",
        },
      },
      {
        data: {
          ...mockInternship,
          status: "completed",
        },
      },
    ]);

    const result = await service.updateStatus(
      TEST_INTERNSHIP_ID,
      "completed",
    );

    assertEquals(result.status, "completed");
  },
);

Deno.test(
  "InternshipService.updateStatus should reject pending to completed",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_INTERNSHIP_ID,
          status: "pending",
        },
      },
    ]);

    await assertRejects(
      () =>
        service.updateStatus(
          TEST_INTERNSHIP_ID,
          "completed",
        ),
      AppError,
      'Invalid internship status transition from "pending" to "completed".',
    );
  },
);

Deno.test(
  "InternshipService.updateStatus should reject an unchanged status",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_INTERNSHIP_ID,
          status: "pending",
        },
      },
    ]);

    await assertRejects(
      () =>
        service.updateStatus(
          TEST_INTERNSHIP_ID,
          "pending",
        ),
      AppError,
      'Invalid internship status transition from "pending" to "pending".',
    );
  },
);

Deno.test(
  "InternshipService.updateStatus should reject completed to active",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_INTERNSHIP_ID,
          status: "completed",
        },
      },
    ]);

    await assertRejects(
      () =>
        service.updateStatus(
          TEST_INTERNSHIP_ID,
          "active",
        ),
      AppError,
      'Invalid internship status transition from "completed" to "active".',
    );
  },
);

Deno.test(
  "InternshipService.updateStatus should return 404 when internship does not exist",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.updateStatus(
          TEST_INTERNSHIP_ID,
          "active",
        ),
      AppError,
      "Internship not found.",
    );
  },
);

Deno.test(
  "InternshipService.updateStatus should reject retrieval errors",
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
      () =>
        service.updateStatus(
          TEST_INTERNSHIP_ID,
          "active",
        ),
      AppError,
      "Unable to retrieve the internship.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * UPDATE INTERNSHIP
 * ---------------------------------------------------------
 */

Deno.test(
  "InternshipService.updateInternship should update required hours",
  async () => {
    const updatedInternship = {
      ...mockInternship,
      required_hours: 300,
    };

    const service = createService([
      {
        data: updatedInternship,
      },
    ]);

    const result = await service.updateInternship(
      TEST_INTERNSHIP_ID,
      {
        requiredHours: 300,
      },
    );

    assertEquals(result, updatedInternship);
  },
);

Deno.test(
  "InternshipService.updateInternship should update HTE assignment",
  async () => {
    const updatedInternship = {
      ...mockInternship,
      hte_id: TEST_NEW_HTE_ID,

      hte_profiles: [
        {
          ...mockInternship.hte_profiles[0],
          id: TEST_NEW_HTE_ID,
        },
      ],
    };

    const service = createService([
      {
        data: {
          id: TEST_NEW_HTE_ID,
          is_active: true,
        },
      },
      {
        data: updatedInternship,
      },
    ]);

    const result = await service.updateInternship(
      TEST_INTERNSHIP_ID,
      {
        hteId: TEST_NEW_HTE_ID,
      },
    );

    assertEquals(result, updatedInternship);
  },
);

Deno.test(
  "InternshipService.updateInternship should reject an inactive HTE",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_NEW_HTE_ID,
          is_active: false,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.updateInternship(
          TEST_INTERNSHIP_ID,
          {
            hteId: TEST_NEW_HTE_ID,
          },
        ),
      AppError,
      "The selected HTE is inactive.",
    );
  },
);

Deno.test(
  "InternshipService.updateInternship should reject a missing HTE",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.updateInternship(
          TEST_INTERNSHIP_ID,
          {
            hteId: TEST_NEW_HTE_ID,
          },
        ),
      AppError,
      "HTE not found.",
    );
  },
);

Deno.test(
  "InternshipService.updateInternship should reject an HTE verification error",
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
      () =>
        service.updateInternship(
          TEST_INTERNSHIP_ID,
          {
            hteId: TEST_NEW_HTE_ID,
          },
        ),
      AppError,
      "Unable to verify the HTE.",
    );
  },
);

Deno.test(
  "InternshipService.updateInternship should return 404 when internship does not exist",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.updateInternship(
          TEST_INTERNSHIP_ID,
          {
            requiredHours: 300,
          },
        ),
      AppError,
      "Internship not found.",
    );
  },
);

Deno.test(
  "InternshipService.updateInternship should reject an empty update",
  async () => {
    const service = createService([]);

    await assertRejects(
      () =>
        service.updateInternship(
          TEST_INTERNSHIP_ID,
          {},
        ),
      AppError,
      "At least one internship field is required.",
    );
  },
);

/*
 * ---------------------------------------------------------
 * FACULTY ADVISER
 * ---------------------------------------------------------
 */

Deno.test(
  "InternshipService.assignFacultyAdviser should assign an active faculty adviser",
  async () => {
    const updatedInternship = {
      ...mockInternship,
      faculty_adviser_id: TEST_FACULTY_ADVISER_ID,
    };

    const service = createService([
      {
        data: {
          id: TEST_FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: true,
        },
      },
      {
        data: updatedInternship,
      },
    ]);

    const result = await service.assignFacultyAdviser(
      TEST_INTERNSHIP_ID,
      TEST_FACULTY_ADVISER_ID,
    );

    assertEquals(result, updatedInternship);
  },
);

Deno.test(
  "InternshipService.assignFacultyAdviser should reject an inactive faculty adviser",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_FACULTY_ADVISER_ID,
          role: "faculty_adviser",
          is_active: false,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.assignFacultyAdviser(
          TEST_INTERNSHIP_ID,
          TEST_FACULTY_ADVISER_ID,
        ),
      AppError,
      "The selected faculty adviser account is inactive.",
    );
  },
);

Deno.test(
  "InternshipService.assignFacultyAdviser should reject a non-faculty user",
  async () => {
    const service = createService([
      {
        data: {
          id: TEST_FACULTY_ADVISER_ID,
          role: "student",
          is_active: true,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.assignFacultyAdviser(
          TEST_INTERNSHIP_ID,
          TEST_FACULTY_ADVISER_ID,
        ),
      AppError,
      "The selected user is not a faculty adviser.",
    );
  },
);

Deno.test(
  "InternshipService.assignFacultyAdviser should reject a missing adviser",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.assignFacultyAdviser(
          TEST_INTERNSHIP_ID,
          TEST_FACULTY_ADVISER_ID,
        ),
      AppError,
      "Faculty adviser profile not found.",
    );
  },
);

Deno.test(
  "InternshipService.assignFacultyAdviser should reject adviser verification errors",
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
      () =>
        service.assignFacultyAdviser(
          TEST_INTERNSHIP_ID,
          TEST_FACULTY_ADVISER_ID,
        ),
      AppError,
      "Unable to verify the faculty adviser.",
    );
  },
);

Deno.test(
  "InternshipService.assignFacultyAdviser should allow removing an adviser",
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

    const result = await service.assignFacultyAdviser(
      TEST_INTERNSHIP_ID,
      null,
    );

    assertEquals(result, updatedInternship);
  },
);

Deno.test(
  "InternshipService.assignFacultyAdviser should return 404 when internship does not exist",
  async () => {
    const service = createService([
      {
        data: null,
      },
    ]);

    await assertRejects(
      () =>
        service.assignFacultyAdviser(
          TEST_INTERNSHIP_ID,
          null,
        ),
      AppError,
      "Internship not found.",
    );
  },
);
