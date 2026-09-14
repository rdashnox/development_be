// deno-lint-ignore-file no-explicit-any

import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";

import { AppError } from "../../../src/errors/app-error.ts";

import evaluations from "../../../src/modules/evaluations/evaluations.routes.ts";

import {
  createEvaluationSchema,
  updateEvaluationSchema,
} from "../../../src/modules/evaluations/evaluations.schema.ts";

import { EvaluationService } from "../../../src/modules/evaluations/evaluations.service.ts";

import type {
  CreateEvaluationInput,
  EvaluationRecord,
  EvaluationType,
  UpdateEvaluationInput,
} from "../../../src/modules/evaluations/evaluations.types.ts";

// ============================================================
// Constants
// ============================================================

const HTE_SUPERVISOR_ID = "11111111-1111-1111-1111-111111111111";

const OTHER_HTE_SUPERVISOR_ID = "22222222-2222-2222-2222-222222222222";

const FACULTY_ADVISER_ID = "77777777-7777-7777-7777-777777777777";

const OTHER_FACULTY_ADVISER_ID = "88888888-8888-8888-8888-888888888888";

const STUDENT_ID = "55555555-5555-5555-5555-555555555555";

const INTERNSHIP_ID = "33333333-3333-3333-3333-333333333333";

const EVALUATION_ID = "44444444-4444-4444-4444-444444444444";

// ============================================================
// Test fixtures
// ============================================================

function createEvaluationRecord(
  overrides: Partial<EvaluationRecord> = {},
): EvaluationRecord {
  return {
    id: EVALUATION_ID,
    internship_id: INTERNSHIP_ID,
    evaluator_id: HTE_SUPERVISOR_ID,
    evaluation_type: "hte_supervisor",
    responses: {
      criterion_1: 5,
      criterion_2: 4,
    },
    comments: "Good performance.",
    status: "draft",
    submitted_at: null,
    created_at: "2026-08-16T08:00:00.000Z",
    updated_at: "2026-08-16T08:00:00.000Z",
    ...overrides,
  };
}

function createInternship(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERNSHIP_ID,
    student_id: STUDENT_ID,
    hte_id: "66666666-6666-6666-6666-666666666666",
    faculty_adviser_id: FACULTY_ADVISER_ID,
    status: "active",
    start_date: "2026-06-01",
    end_date: "2026-08-07",
    required_hours: 300,
    hte_profiles: {
      supervisor_id: HTE_SUPERVISOR_ID,
    },
    ...overrides,
  };
}

function createEligibleInternship(overrides: Record<string, unknown> = {}) {
  return createInternship({
    start_date: "2026-06-01",
    end_date: "2026-08-07",
    required_hours: 300,
    ...overrides,
  });
}

function createValidatedAttendance(count: number = 38) {
  const records = [];

  for (let index = 0; index < count; index++) {
    records.push({
      time_in: "08:00:00",
      time_out: index === count - 1 ? "13:00:00" : "17:00:00",
      validation_status: "validated",
    });
  }

  return records;
}

// ============================================================
// Mock Supabase
// ============================================================

type MockQueryResponse = {
  data?: unknown;
  error?: unknown;
};

function createMockEvaluationService(responses: MockQueryResponse[]) {
  let index = 0;

  const mockFrom = (_table: string) => {
    const response = responses[index++];

    if (!response) {
      throw new Error("Unexpected supabaseAdmin.from() call.");
    }

    const result = {
      data: response.data ?? null,
      error: response.error ?? null,
    };

    const builder: any = {
      ...result,
      select: () => builder,
      eq: () => builder,
      insert: () => builder,
      update: () => builder,
      order: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };

    return builder;
  };

  const clients = {
    supabaseAdmin: {
      from: mockFrom,
    },
  } as any;

  return new EvaluationService(clients);
}

// ============================================================
// TYPES
// ============================================================

Deno.test(
  "Evaluation types - support HTE Supervisor and Faculty Adviser",
  () => {
    const hteType: EvaluationType = "hte_supervisor";
    const facultyType: EvaluationType = "faculty_adviser";

    assertEquals(hteType, "hte_supervisor");
    assertEquals(facultyType, "faculty_adviser");
  },
);

Deno.test(
  "Evaluation types - CreateEvaluationInput supports evaluation type",
  () => {
    const input: CreateEvaluationInput = {
      internship_id: INTERNSHIP_ID,
      evaluation_type: "faculty_adviser",
      responses: {
        criterion_1: 5,
      },
      comments: "Good work.",
    };

    assertEquals(input.evaluation_type, "faculty_adviser");
  },
);

Deno.test(
  "Evaluation types - UpdateEvaluationInput supports partial updates",
  () => {
    const input: UpdateEvaluationInput = {
      comments: "Updated.",
    };

    assertEquals(input.comments, "Updated.");
  },
);

// ============================================================
// SCHEMA TESTS
// ============================================================

Deno.test("createEvaluationSchema - accepts HTE Supervisor evaluation", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    evaluation_type: "hte_supervisor",
    responses: {
      criterion_1: 5,
    },
  });

  assertEquals(result.success, true);
});

Deno.test("createEvaluationSchema - accepts Faculty Adviser evaluation", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    evaluation_type: "faculty_adviser",
    responses: {
      criterion_1: 4,
    },
  });

  assertEquals(result.success, true);
});

Deno.test(
  "createEvaluationSchema - defaults evaluation type to HTE Supervisor",
  () => {
    const result = createEvaluationSchema.parse({
      internship_id: INTERNSHIP_ID,
      responses: {
        criterion_1: 5,
      },
    });

    assertEquals(result.evaluation_type, "hte_supervisor");
  },
);

Deno.test("createEvaluationSchema - rejects invalid evaluation type", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    evaluation_type: "administrator",
    responses: {
      criterion_1: 5,
    },
  });

  assertEquals(result.success, false);
});

Deno.test("createEvaluationSchema - rejects empty responses", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    responses: {},
  });

  assertEquals(result.success, false);
});

Deno.test("createEvaluationSchema - rejects score below 1", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    responses: {
      criterion_1: 0,
    },
  });

  assertEquals(result.success, false);
});

Deno.test("createEvaluationSchema - rejects score above 5", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    responses: {
      criterion_1: 6,
    },
  });

  assertEquals(result.success, false);
});

Deno.test("createEvaluationSchema - rejects non-integer score", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    responses: {
      criterion_1: 4.5,
    },
  });

  assertEquals(result.success, false);
});

Deno.test("createEvaluationSchema - accepts nullable comments", () => {
  const result = createEvaluationSchema.safeParse({
    internship_id: INTERNSHIP_ID,
    responses: {
      criterion_1: 5,
    },
    comments: null,
  });

  assertEquals(result.success, true);
});

Deno.test(
  "createEvaluationSchema - rejects comments over 2000 characters",
  () => {
    const result = createEvaluationSchema.safeParse({
      internship_id: INTERNSHIP_ID,
      responses: {
        criterion_1: 5,
      },
      comments: "x".repeat(2001),
    });

    assertEquals(result.success, false);
  },
);

Deno.test("updateEvaluationSchema - accepts response update", () => {
  const result = updateEvaluationSchema.safeParse({
    responses: {
      criterion_1: 5,
    },
  });

  assertEquals(result.success, true);
});

Deno.test("updateEvaluationSchema - accepts comment update", () => {
  const result = updateEvaluationSchema.safeParse({
    comments: "Updated.",
  });

  assertEquals(result.success, true);
});

Deno.test("updateEvaluationSchema - rejects empty update", () => {
  const result = updateEvaluationSchema.safeParse({});

  assertEquals(result.success, false);
});

// ============================================================
// ROUTE TESTS
// ============================================================

Deno.test("Evaluation routes - expose a Hono fetch handler", () => {
  assertExists(evaluations);
  assertEquals(typeof evaluations.fetch, "function");
});

Deno.test("Evaluation routes - register POST /", () => {
  const route = evaluations.routes.find(
    (item) => item.method === "POST" && item.path === "/",
  );

  assertExists(route);
});

Deno.test("Evaluation routes - register GET /me", () => {
  const route = evaluations.routes.find(
    (item) => item.method === "GET" && item.path === "/me",
  );

  assertExists(route);
});

Deno.test("Evaluation routes - register GET /internship/:internshipId", () => {
  const route = evaluations.routes.find(
    (item) => item.method === "GET" && item.path === "/internship/:internshipId",
  );

  assertExists(route);
});

Deno.test("Evaluation routes - register GET /:id", () => {
  const route = evaluations.routes.find(
    (item) => item.method === "GET" && item.path === "/:id",
  );

  assertExists(route);
});

Deno.test("Evaluation routes - register PATCH /:id", () => {
  const route = evaluations.routes.find(
    (item) => item.method === "PATCH" && item.path === "/:id",
  );

  assertExists(route);
});

Deno.test("Evaluation routes - register POST /:id/submit", () => {
  const route = evaluations.routes.find(
    (item) => item.method === "POST" && item.path === "/:id/submit",
  );

  assertExists(route);
});

Deno.test("Evaluation routes - register authentication middleware", () => {
  const middlewareRoutes = evaluations.routes.filter(
    (route) => route.method === "ALL" || route.method === "*",
  );

  assert(middlewareRoutes.length > 0);
});

// ============================================================
// SERVICE: CREATE
// ============================================================

Deno.test(
  "createEvaluation - creates eligible HTE Supervisor evaluation",
  async () => {
    const evaluation = createEvaluationRecord();

    const service = createMockEvaluationService([
      // 1. evaluator assignment
      {
        data: createEligibleInternship(),
      },

      // 2. eligibility internship
      {
        data: createEligibleInternship(),
      },

      // 3. validated attendance
      {
        data: createValidatedAttendance(),
      },

      // 4. duplicate check
      {
        data: null,
      },

      // 5. insert
      {
        data: evaluation,
      },
    ]);

    const result = await service.createEvaluation(
      HTE_SUPERVISOR_ID,
      "hte_supervisor",
      {
        internship_id: INTERNSHIP_ID,
        evaluation_type: "hte_supervisor",
        responses: {
          criterion_1: 5,
          criterion_2: 4,
        },
        comments: "Good performance.",
      },
    );

    assertEquals(result, evaluation);
    assertEquals(result.evaluation_type, "hte_supervisor");
    assertEquals(result.status, "draft");
  },
);

Deno.test(
  "createEvaluation - creates eligible Faculty Adviser evaluation",
  async () => {
    const evaluation = createEvaluationRecord({
      evaluator_id: FACULTY_ADVISER_ID,
      evaluation_type: "faculty_adviser",
    });

    const service = createMockEvaluationService([
      // assignment
      {
        data: createEligibleInternship(),
      },

      // eligibility internship
      {
        data: createEligibleInternship(),
      },

      // attendance
      {
        data: createValidatedAttendance(),
      },

      // duplicate
      {
        data: null,
      },

      // insert
      {
        data: evaluation,
      },
    ]);

    const result = await service.createEvaluation(
      FACULTY_ADVISER_ID,
      "faculty_adviser",
      {
        internship_id: INTERNSHIP_ID,
        evaluation_type: "faculty_adviser",
        responses: {
          criterion_1: 5,
        },
      },
    );

    assertEquals(result.evaluation_type, "faculty_adviser");
    assertEquals(result.evaluator_id, FACULTY_ADVISER_ID);
  },
);

Deno.test(
  "createEvaluation - rejects HTE Supervisor requesting Faculty evaluation",
  async () => {
    const service = createMockEvaluationService([]);

    await assertRejects(
      () =>
        service.createEvaluation(HTE_SUPERVISOR_ID, "hte_supervisor", {
          internship_id: INTERNSHIP_ID,
          evaluation_type: "faculty_adviser",
          responses: {
            criterion_1: 5,
          },
        }),
      AppError,
      "HTE Supervisors can only manage HTE Supervisor evaluations.",
    );
  },
);

Deno.test(
  "createEvaluation - rejects Faculty Adviser requesting HTE evaluation",
  async () => {
    const service = createMockEvaluationService([]);

    await assertRejects(
      () =>
        service.createEvaluation(FACULTY_ADVISER_ID, "faculty_adviser", {
          internship_id: INTERNSHIP_ID,
          evaluation_type: "hte_supervisor",
          responses: {
            criterion_1: 5,
          },
        }),
      AppError,
      "Faculty Advisers can only manage Faculty Adviser evaluations.",
    );
  },
);

Deno.test("createEvaluation - rejects unrelated HTE Supervisor", async () => {
  const service = createMockEvaluationService([
    {
      data: createEligibleInternship({
        hte_profiles: {
          supervisor_id: OTHER_HTE_SUPERVISOR_ID,
        },
      }),
    },
  ]);

  await assertRejects(
    () =>
      service.createEvaluation(HTE_SUPERVISOR_ID, "hte_supervisor", {
        internship_id: INTERNSHIP_ID,
        responses: {
          criterion_1: 5,
        },
      }),
    AppError,
    "You can only manage HTE evaluations for internships assigned to your HTE.",
  );
});

Deno.test("createEvaluation - rejects unrelated Faculty Adviser", async () => {
  const service = createMockEvaluationService([
    {
      data: createEligibleInternship({
        faculty_adviser_id: OTHER_FACULTY_ADVISER_ID,
      }),
    },
  ]);

  await assertRejects(
    () =>
      service.createEvaluation(FACULTY_ADVISER_ID, "faculty_adviser", {
        internship_id: INTERNSHIP_ID,
        evaluation_type: "faculty_adviser",
        responses: {
          criterion_1: 5,
        },
      }),
    AppError,
    "You can only manage faculty evaluations for internships assigned to you.",
  );
});

Deno.test(
  "createEvaluation - rejects internship whose period has not ended",
  async () => {
    const service = createMockEvaluationService([
      {
        data: createInternship({
          end_date: "2999-12-31",
        }),
      },
      {
        data: createInternship({
          end_date: "2999-12-31",
        }),
      },
      {
        data: createValidatedAttendance(),
      },
    ]);

    await assertRejects(
      () =>
        service.createEvaluation(HTE_SUPERVISOR_ID, "hte_supervisor", {
          internship_id: INTERNSHIP_ID,
          responses: {
            criterion_1: 5,
          },
        }),
      AppError,
      "The internship period has not ended yet.",
    );
  },
);

Deno.test(
  "createEvaluation - rejects end date equal to current date",
  async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const service = createMockEvaluationService([
      {
        data: createInternship({
          end_date: today,
        }),
      },
      {
        data: createInternship({
          end_date: today,
        }),
      },
      {
        data: createValidatedAttendance(),
      },
    ]);

    await assertRejects(
      () =>
        service.createEvaluation(HTE_SUPERVISOR_ID, "hte_supervisor", {
          internship_id: INTERNSHIP_ID,
          responses: {
            criterion_1: 5,
          },
        }),
      AppError,
      "The internship period has not ended yet.",
    );
  },
);

Deno.test(
  "createEvaluation - rejects insufficient validated rendered hours",
  async () => {
    const service = createMockEvaluationService([
      {
        data: createEligibleInternship(),
      },
      {
        data: createEligibleInternship(),
      },
      {
        data: [
          {
            time_in: "08:00:00",
            time_out: "17:00:00",
          },
        ],
      },
    ]);

    await assertRejects(
      () =>
        service.createEvaluation(HTE_SUPERVISOR_ID, "hte_supervisor", {
          internship_id: INTERNSHIP_ID,
          responses: {
            criterion_1: 5,
          },
        }),
      AppError,
      "The required validated rendered hours have not been met.",
    );
  },
);

Deno.test("createEvaluation - rejects missing required hours", async () => {
  const service = createMockEvaluationService([
    {
      data: createInternship({
        required_hours: null,
      }),
    },
    {
      data: createInternship({
        required_hours: null,
      }),
    },
    {
      data: createValidatedAttendance(),
    },
  ]);

  await assertRejects(
    () =>
      service.createEvaluation(HTE_SUPERVISOR_ID, "hte_supervisor", {
        internship_id: INTERNSHIP_ID,
        responses: {
          criterion_1: 5,
        },
      }),
    AppError,
    "Required internship hours have not been set.",
  );
});

Deno.test(
  "createEvaluation - rejects duplicate same-type evaluation",
  async () => {
    const existing = createEvaluationRecord();

    const service = createMockEvaluationService([
      {
        data: createEligibleInternship(),
      },
      {
        data: createEligibleInternship(),
      },
      {
        data: createValidatedAttendance(),
      },
      {
        data: {
          id: existing.id,
          status: existing.status,
        },
      },
    ]);

    await assertRejects(
      () =>
        service.createEvaluation(HTE_SUPERVISOR_ID, "hte_supervisor", {
          internship_id: INTERNSHIP_ID,
          responses: {
            criterion_1: 5,
          },
        }),
      AppError,
      "A HTE Supervisor evaluation already exists for this internship.",
    );
  },
);

// ============================================================
// SERVICE: READ
// ============================================================

Deno.test("getEvaluationById - allows assigned HTE Supervisor", async () => {
  const evaluation = createEvaluationRecord();

  const service = createMockEvaluationService([
    {
      data: evaluation,
    },
    {
      data: createInternship(),
    },
  ]);

  const result = await service.getEvaluationById(
    EVALUATION_ID,
    HTE_SUPERVISOR_ID,
    "hte_supervisor",
  );

  assertEquals(result, evaluation);
});

Deno.test("getEvaluationById - allows assigned Faculty Adviser", async () => {
  const evaluation = createEvaluationRecord({
    evaluator_id: FACULTY_ADVISER_ID,
    evaluation_type: "faculty_adviser",
  });

  const service = createMockEvaluationService([
    {
      data: evaluation,
    },
    {
      data: createInternship(),
    },
  ]);

  const result = await service.getEvaluationById(
    EVALUATION_ID,
    FACULTY_ADVISER_ID,
    "faculty_adviser",
  );

  assertEquals(result, evaluation);
});

Deno.test("getEvaluationById - allows administrator", async () => {
  const evaluation = createEvaluationRecord();

  const service = createMockEvaluationService([
    {
      data: evaluation,
    },
    {
      data: createInternship(),
    },
  ]);

  const result = await service.getEvaluationById(
    EVALUATION_ID,
    "99999999-9999-9999-9999-999999999999",
    "administrator",
  );

  assertEquals(result, evaluation);
});

Deno.test("getEvaluationById - allows internship coordinator", async () => {
  const evaluation = createEvaluationRecord();

  const service = createMockEvaluationService([
    {
      data: evaluation,
    },
    {
      data: createInternship(),
    },
  ]);

  const result = await service.getEvaluationById(
    EVALUATION_ID,
    "99999999-9999-9999-9999-999999999999",
    "internship_coordinator",
  );

  assertEquals(result, evaluation);
});

Deno.test(
  "getEvaluationById - allows student only for submitted evaluation",
  async () => {
    const evaluation = createEvaluationRecord({
      status: "submitted",
      submitted_at: "2026-08-08T09:00:00.000Z",
    });

    const service = createMockEvaluationService([
      {
        data: evaluation,
      },
      {
        data: createInternship(),
      },
    ]);

    const result = await service.getEvaluationById(
      EVALUATION_ID,
      STUDENT_ID,
      "student",
    );

    assertEquals(result.status, "submitted");
  },
);

Deno.test("getEvaluationById - rejects student access to draft", async () => {
  const evaluation = createEvaluationRecord();

  const service = createMockEvaluationService([
    {
      data: evaluation,
    },
    {
      data: createInternship(),
    },
  ]);

  await assertRejects(
    () => service.getEvaluationById(EVALUATION_ID, STUDENT_ID, "student"),
    AppError,
    "Evaluation results are only available after submission.",
  );
});

Deno.test(
  "getEvaluationById - rejects student accessing another student's evaluation",
  async () => {
    const evaluation = createEvaluationRecord({
      status: "submitted",
      submitted_at: "2026-08-08T09:00:00.000Z",
    });

    const service = createMockEvaluationService([
      {
        data: evaluation,
      },
      {
        data: createInternship({
          student_id: "99999999-9999-9999-9999-999999999999",
        }),
      },
    ]);

    await assertRejects(
      () => service.getEvaluationById(EVALUATION_ID, STUDENT_ID, "student"),
      AppError,
      "You can only access evaluations for your own internship.",
    );
  },
);

// ============================================================
// SERVICE: UPDATE
// ============================================================

Deno.test("updateEvaluation - updates own HTE draft", async () => {
  const existing = createEvaluationRecord();

  const updated = createEvaluationRecord({
    responses: {
      criterion_1: 5,
      criterion_2: 5,
    },
    comments: "Updated comments.",
  });

  const service = createMockEvaluationService([
    {
      data: existing,
    },
    {
      data: createInternship(),
    },
    {
      data: updated,
    },
  ]);

  const result = await service.updateEvaluation(
    EVALUATION_ID,
    HTE_SUPERVISOR_ID,
    "hte_supervisor",
    {
      responses: {
        criterion_1: 5,
        criterion_2: 5,
      },
      comments: "Updated comments.",
    },
  );

  assertEquals(result, updated);
});

Deno.test("updateEvaluation - updates own Faculty Adviser draft", async () => {
  const existing = createEvaluationRecord({
    evaluator_id: FACULTY_ADVISER_ID,
    evaluation_type: "faculty_adviser",
  });

  const updated = createEvaluationRecord({
    evaluator_id: FACULTY_ADVISER_ID,
    evaluation_type: "faculty_adviser",
    comments: "Faculty update.",
  });

  const service = createMockEvaluationService([
    {
      data: existing,
    },
    {
      data: createInternship(),
    },
    {
      data: updated,
    },
  ]);

  const result = await service.updateEvaluation(
    EVALUATION_ID,
    FACULTY_ADVISER_ID,
    "faculty_adviser",
    {
      comments: "Faculty update.",
    },
  );

  assertEquals(result.evaluation_type, "faculty_adviser");
});

Deno.test("updateEvaluation - rejects submitted evaluation", async () => {
  const submitted = createEvaluationRecord({
    status: "submitted",
    submitted_at: "2026-08-16T09:00:00.000Z",
  });

  const service = createMockEvaluationService([
    {
      data: submitted,
    },
    {
      data: createInternship(),
    },
  ]);

  await assertRejects(
    () =>
      service.updateEvaluation(
        EVALUATION_ID,
        HTE_SUPERVISOR_ID,
        "hte_supervisor",
        {
          comments: "Attempted modification.",
        },
      ),
    AppError,
    "Only draft evaluations can be updated.",
  );
});

// ============================================================
// SERVICE: SUBMIT
// ============================================================

Deno.test("submitEvaluation - submits eligible HTE draft", async () => {
  const draft = createEvaluationRecord();

  const submitted = createEvaluationRecord({
    status: "submitted",
    submitted_at: "2026-08-16T09:00:00.000Z",
  });

  const service = createMockEvaluationService([
    {
      data: draft,
    },
    {
      data: createEligibleInternship(),
    },
    {
      data: createEligibleInternship(),
    },
    {
      data: createValidatedAttendance(),
    },
    {
      data: submitted,
    },
  ]);

  const result = await service.submitEvaluation(
    EVALUATION_ID,
    HTE_SUPERVISOR_ID,
    "hte_supervisor",
  );

  assertEquals(result.status, "submitted");
  assertExists(result.submitted_at);
});

Deno.test(
  "submitEvaluation - submits eligible Faculty Adviser draft",
  async () => {
    const draft = createEvaluationRecord({
      evaluator_id: FACULTY_ADVISER_ID,
      evaluation_type: "faculty_adviser",
    });

    const submitted = createEvaluationRecord({
      evaluator_id: FACULTY_ADVISER_ID,
      evaluation_type: "faculty_adviser",
      status: "submitted",
      submitted_at: "2026-08-16T09:00:00.000Z",
    });

    const service = createMockEvaluationService([
      {
        data: draft,
      },
      {
        data: createInternship(),
      },
      {
        data: createEligibleInternship(),
      },
      {
        data: createValidatedAttendance(),
      },
      {
        data: submitted,
      },
    ]);

    const result = await service.submitEvaluation(
      EVALUATION_ID,
      FACULTY_ADVISER_ID,
      "faculty_adviser",
    );

    assertEquals(result.evaluation_type, "faculty_adviser");
    assertEquals(result.status, "submitted");
  },
);

Deno.test(
  "submitEvaluation - rejects already submitted evaluation",
  async () => {
    const submitted = createEvaluationRecord({
      status: "submitted",
      submitted_at: "2026-08-16T09:00:00.000Z",
    });

    const service = createMockEvaluationService([
      {
        data: submitted,
      },
      {
        data: createInternship(),
      },
    ]);

    await assertRejects(
      () =>
        service.submitEvaluation(
          EVALUATION_ID,
          HTE_SUPERVISOR_ID,
          "hte_supervisor",
        ),
      AppError,
      "Only draft evaluations can be submitted.",
    );
  },
);

Deno.test(
  "submitEvaluation - rejects evaluation without responses",
  async () => {
    const draft = createEvaluationRecord({
      responses: {},
    });

    const service = createMockEvaluationService([
      {
        data: draft,
      },
      {
        data: createInternship(),
      },
    ]);

    await assertRejects(
      () =>
        service.submitEvaluation(
          EVALUATION_ID,
          HTE_SUPERVISOR_ID,
          "hte_supervisor",
        ),
      AppError,
      "Evaluation responses are required before submission.",
    );
  },
);

Deno.test(
  "submitEvaluation - rechecks eligibility before submission",
  async () => {
    const draft = createEvaluationRecord();

    const service = createMockEvaluationService([
      {
        data: draft,
      },
      {
        data: createInternship(),
      },
      {
        data: createInternship({
          end_date: "2999-12-31",
        }),
      },
      {
        data: createValidatedAttendance(),
      },
    ]);

    await assertRejects(
      () =>
        service.submitEvaluation(
          EVALUATION_ID,
          HTE_SUPERVISOR_ID,
          "hte_supervisor",
        ),
      AppError,
      "The internship period has not ended yet.",
    );
  },
);

Deno.test(
  "submitEvaluation - rejects when required hours become insufficient",
  async () => {
    const draft = createEvaluationRecord();

    const service = createMockEvaluationService([
      {
        data: draft,
      },
      {
        data: createInternship(),
      },
      {
        data: createEligibleInternship(),
      },
      {
        data: [
          {
            time_in: "08:00:00",
            time_out: "17:00:00",
          },
        ],
      },
    ]);

    await assertRejects(
      () =>
        service.submitEvaluation(
          EVALUATION_ID,
          HTE_SUPERVISOR_ID,
          "hte_supervisor",
        ),
      AppError,
      "The required validated rendered hours have not been met.",
    );
  },
);
