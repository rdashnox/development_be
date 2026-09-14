import { assertEquals, assertExists, assertRejects } from "@std/assert";

import {
  AUDIT_ACTIONS,
  type AuditLog,
  type AuditLogFilters,
  type CreateAuditLogInput,
} from "../../../src/modules/audit/audit.types.ts";

import { auditLogQuerySchema } from "../../../src/modules/audit/audit.schema.ts";

import { AuditService } from "../../../src/modules/audit/audit.service.ts";

import audit from "../../../src/modules/audit/audit.routes.ts";

import type { SupabaseClients } from "../../../src/lib/supabase.ts";

// ============================================================
// TEST CONSTANTS
// ============================================================

const USER_ID = "11111111-1111-1111-1111-111111111111";
const RESOURCE_ID = "33333333-3333-3333-3333-333333333333";

// ============================================================
// MOCK SUPABASE HELPERS
// ============================================================

type MockResponse = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

/**
 * Creates a small Supabase query builder containing only
 * the methods used by AuditService.
 */
function createMockQuery(response: MockResponse) {
  const query = {
    select() {
      return query;
    },

    insert() {
      return query;
    },

    eq() {
      return query;
    },

    gte() {
      return query;
    },

    lte() {
      return query;
    },

    order() {
      return query;
    },

    range() {
      return Promise.resolve(response);
    },

    then(
      resolve: (value: MockResponse) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(response).then(resolve, reject);
    },
  };

  return query;
}

function createMockClients(responses: MockResponse[]): SupabaseClients {
  let responseIndex = 0;

  const supabaseAdmin = {
    from(_table: string) {
      const response = responses[responseIndex++];

      if (!response) {
        throw new Error("Unexpected supabaseAdmin.from() call.");
      }

      return createMockQuery(response);
    },
  };

  return {
    // deno-lint-ignore no-explicit-any
    supabaseClient: supabaseAdmin as any,
    // deno-lint-ignore no-explicit-any
    supabaseAdmin: supabaseAdmin as any,
    // deno-lint-ignore no-explicit-any
    createAuthenticatedClient: () => supabaseAdmin as any,
    // deno-lint-ignore no-explicit-any
    createPublicClient: () => supabaseAdmin as any,
  };
}

// ============================================================
// 1–4. TYPES / CONSTANTS
// ============================================================

Deno.test("FR-11 types should define LOGIN audit action", () => {
  assertEquals(AUDIT_ACTIONS.includes("LOGIN"), true);
});

Deno.test(
  "FR-11 types should define required user-management audit actions",
  () => {
    assertEquals(AUDIT_ACTIONS.includes("CREATE_USER"), true);

    assertEquals(AUDIT_ACTIONS.includes("UPDATE_USER"), true);

    assertEquals(AUDIT_ACTIONS.includes("CHANGE_ROLE"), true);

    assertEquals(AUDIT_ACTIONS.includes("DEACTIVATE_USER"), true);
  },
);

Deno.test(
  "FR-11 types should define internship, attendance, evaluation, and document actions",
  () => {
    assertEquals(AUDIT_ACTIONS.includes("CREATE_INTERNSHIP"), true);

    assertEquals(AUDIT_ACTIONS.includes("CREATE_ATTENDANCE"), true);

    assertEquals(AUDIT_ACTIONS.includes("CREATE_EVALUATION"), true);

    assertEquals(AUDIT_ACTIONS.includes("UPLOAD_DOCUMENT"), true);
  },
);

Deno.test(
  "FR-11 audit input should support actor, action, resource, details, and IP address",
  () => {
    const input: CreateAuditLogInput = {
      userId: USER_ID,
      action: "LOGIN",
      resourceType: "AUTH",
      resourceId: USER_ID,
      details: {},
      ipAddress: "127.0.0.1",
    };

    assertEquals(input.userId, USER_ID);
    assertEquals(input.action, "LOGIN");
    assertEquals(input.resourceType, "AUTH");
    assertEquals(input.resourceId, USER_ID);
    assertEquals(input.details, {});
    assertEquals(input.ipAddress, "127.0.0.1");
  },
);

// ============================================================
// 5–9. SCHEMA
// ============================================================

Deno.test("FR-11 query schema should accept valid default query", () => {
  const result = auditLogQuerySchema.safeParse({});

  assertEquals(result.success, true);

  if (result.success) {
    assertEquals(result.data.page, 1);
    assertEquals(result.data.limit, 20);
  }
});

Deno.test("FR-11 query schema should accept supported filters", () => {
  const result = auditLogQuerySchema.safeParse({
    userId: USER_ID,
    action: "LOGIN",
    resourceType: "AUTH",
    resourceId: USER_ID,
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-11T23:59:59.999Z",
    page: 2,
    limit: 10,
  });

  assertEquals(result.success, true);

  if (result.success) {
    assertEquals(result.data.userId, USER_ID);
    assertEquals(result.data.action, "LOGIN");
    assertEquals(result.data.resourceType, "AUTH");
    assertEquals(result.data.resourceId, USER_ID);
    assertEquals(result.data.page, 2);
    assertEquals(result.data.limit, 10);
  }
});

Deno.test("FR-11 query schema should reject invalid page", () => {
  const result = auditLogQuerySchema.safeParse({
    page: 0,
  });

  assertEquals(result.success, false);
});

Deno.test("FR-11 query schema should reject invalid limit", () => {
  const result = auditLogQuerySchema.safeParse({
    limit: 0,
  });

  assertEquals(result.success, false);
});

Deno.test("FR-11 query schema should reject invalid date values", () => {
  const result = auditLogQuerySchema.safeParse({
    from: "not-a-date",
  });

  assertEquals(result.success, false);
});

// ============================================================
// 10–14. SERVICE
// ============================================================

Deno.test("FR-11 AuditService.log should insert an audit record", async () => {
  let inserted = false;

  const supabaseAdmin = {
    from(table: string) {
      assertEquals(table, "audit_logs");

      return {
        insert(values: Record<string, unknown>) {
          inserted = true;

          assertEquals(values.user_id, USER_ID);
          assertEquals(values.action, "LOGIN");
          assertEquals(values.resource_type, "AUTH");
          assertEquals(values.resource_id, USER_ID);
          assertEquals(values.details, {});

          return Promise.resolve({
            data: null,
            error: null,
          });
        },
      };
    },
  };

  const clients = {
    // deno-lint-ignore no-explicit-any
    supabaseClient: supabaseAdmin as any,
    // deno-lint-ignore no-explicit-any
    supabaseAdmin: supabaseAdmin as any,
    // deno-lint-ignore no-explicit-any
    createAuthenticatedClient: () => supabaseAdmin as any,
    // deno-lint-ignore no-explicit-any
    createPublicClient: () => supabaseAdmin as any,
  };

  const service = new AuditService(clients);

  await service.log({
    userId: USER_ID,
    action: "LOGIN",
    resourceType: "AUTH",
    resourceId: USER_ID,
    details: {},
  });

  assertEquals(inserted, true);
});

Deno.test(
  "FR-11 AuditService.log should support optional IP address",
  async () => {
    let receivedIp: unknown = null;

    const supabaseAdmin = {
      from() {
        return {
          insert(values: Record<string, unknown>) {
            receivedIp = values.ip_address;

            return Promise.resolve({
              data: null,
              error: null,
            });
          },
        };
      },
    };

    const clients = {
      // deno-lint-ignore no-explicit-any
      supabaseClient: supabaseAdmin as any,
      // deno-lint-ignore no-explicit-any
      supabaseAdmin: supabaseAdmin as any,
      // deno-lint-ignore no-explicit-any
      createAuthenticatedClient: () => supabaseAdmin as any,
      // deno-lint-ignore no-explicit-any
      createPublicClient: () => supabaseAdmin as any,
    };

    const service = new AuditService(clients);

    await service.log({
      userId: USER_ID,
      action: "LOGIN",
      resourceType: "AUTH",
      resourceId: USER_ID,
      details: {},
      ipAddress: "192.168.1.10",
    });

    assertEquals(receivedIp, "192.168.1.10");
  },
);

Deno.test(
  "FR-11 AuditService.log should not throw when audit insertion fails",
  async () => {
    const supabaseAdmin = {
      from() {
        return {
          insert() {
            return Promise.resolve({
              data: null,
              error: {
                message: "database failure",
              },
            });
          },
        };
      },
    };

    const clients = {
      // deno-lint-ignore no-explicit-any
      supabaseClient: supabaseAdmin as any,
      // deno-lint-ignore no-explicit-any
      supabaseAdmin: supabaseAdmin as any,
      // deno-lint-ignore no-explicit-any
      createAuthenticatedClient: () => supabaseAdmin as any,
      // deno-lint-ignore no-explicit-any
      createPublicClient: () => supabaseAdmin as any,
    };

    const service = new AuditService(clients);

    await service.log({
      userId: USER_ID,
      action: "LOGIN",
      resourceType: "AUTH",
      resourceId: USER_ID,
    });
  },
);

Deno.test(
  "FR-11 AuditService.list should return audit records with pagination",
  async () => {
    const auditRecord: AuditLog = {
      id: RESOURCE_ID,
      user_id: USER_ID,
      action: "LOGIN",
      resource_type: "AUTH",
      resource_id: USER_ID,
      details: {},
      ip_address: null,
      created_at: "2026-09-11T10:00:00.000Z",
    };

    const clients = createMockClients([
      {
        data: [auditRecord],
        error: null,
        count: 1,
      },
    ]);

    const service = new AuditService(clients);

    const filters: AuditLogFilters = {
      page: 1,
      limit: 20,
    };

    const result = await service.list(filters);

    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].action, "LOGIN");
    assertEquals(result.items[0].resource_type, "AUTH");
    assertEquals(result.total, 1);
    assertEquals(result.page, 1);
    assertEquals(result.limit, 20);
    assertEquals(result.totalPages, 1);
  },
);

Deno.test(
  "FR-11 AuditService.list should throw AppError when database retrieval fails",
  async () => {
    const clients = createMockClients([
      {
        data: null,
        error: {
          message: "database failure",
        },
        count: null,
      },
    ]);

    const service = new AuditService(clients);

    await assertRejects(
      () =>
        service.list({
          page: 1,
          limit: 20,
        }),
      Error,
      "Unable to retrieve audit logs.",
    );
  },
);

// ============================================================
// 15–18. ROUTES
// ============================================================

Deno.test("FR-11 audit routes should expose a Hono fetch handler", () => {
  assertExists(audit);
  assertEquals(typeof audit.fetch, "function");
});

Deno.test("FR-11 audit routes should register GET audit-log route", () => {
  const getRoute = audit.routes.find(
    (route) => route.method === "GET" && route.path === "/",
  );

  assertExists(getRoute);
});

Deno.test(
  "FR-11 audit routes should register authentication middleware",
  () => {
    const routes = audit.routes;

    assertEquals(routes.length > 1, true);

    const middlewareRoutes = routes.filter(
      (route) => route.method === "ALL" || route.method === "*",
    );

    assertEquals(middlewareRoutes.length > 0, true);
  },
);

Deno.test(
  "FR-11 audit routes should be implemented as a read-only endpoint",
  () => {
    const methods = audit.routes.map((route) => route.method);

    assertEquals(methods.includes("POST"), false);
    assertEquals(methods.includes("PATCH"), false);
    assertEquals(methods.includes("DELETE"), false);
    assertEquals(methods.includes("GET"), true);
  },
);
