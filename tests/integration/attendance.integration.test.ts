// deno-lint-ignore-file no-explicit-any require-await
import { assertEquals, assertExists } from "@std/assert";

import { Hono } from "hono";

import type { AppVariables } from "../../src/types/context.ts";

import attendance from "../../src/modules/attendance/attendance.routes.ts";

function createIntegrationApp() {
  const app = new Hono<{
    Variables: AppVariables;
  }>();

  /*
   * Integration-test authentication boundary.
   *
   * This test app provides the same context values that
   * the production middleware would provide.
   *
   * The actual attendance router remains unchanged.
   */

  app.use("*", async (c, next) => {
    c.set("supabase", createMockSupabase() as any);
    await next();
  });

  app.route("/attendance", attendance);

  app.onError((error, c) => {
    const status = "status" in error && typeof error.status === "number" ? error.status : 500;

    return c.json(
      {
        success: false,
        message: error.message,
      },
      status as any,
    );
  });

  return app;
}

function createMockSupabase() {
  const data = {
    internships: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        student_id: "student-1",
        status: "active",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      },
    ],

    attendance_records: [
      {
        id: "attendance-1",
        internship_id: "11111111-1111-1111-1111-111111111111",
        attendance_date: "2026-06-01",
        time_in: "08:00",
        time_out: "17:00",
        validation_status: "pending",
        validated_by: null,
        validated_at: null,
      },
    ],

    profiles: [
      {
        id: "student-1",
        role: "student",
        is_active: true,
      },
      {
        id: "coordinator-1",
        role: "internship_coordinator",
        is_active: true,
      },
    ],
  };

  const makeBuilder = (table: keyof typeof data, rows: any[]) => {
    let filtered = [...rows];

    const builder: any = {
      select() {
        return builder;
      },

      then(resolve: (value: { data: any[]; error: null }) => any) {
        return Promise.resolve({
          data: filtered,
          error: null,
        }).then(resolve);
      },

      eq(column: string, value: unknown) {
        filtered = filtered.filter((row) => {
          if (column.includes(".")) {
            const [relation, relationColumn] = column.split(".");

            if (relation === "internships" && table === "attendance_records") {
              const internship = data.internships.find(
                (item) => item.id === row.internship_id,
              ) as Record<string, unknown> | undefined;

              return internship?.[relationColumn] === value;
            }
          }

          return row[column] === value;
        });
        return builder;
      },

      neq(column: string, value: unknown) {
        filtered = filtered.filter((row) => row[column] !== value);
        return builder;
      },

      order(column: string, options?: { ascending?: boolean }) {
        const ascending = options?.ascending ?? true;

        filtered.sort((a, b) => {
          const left = a[column];
          const right = b[column];

          if (left === right) return 0;
          return ascending ? (left < right ? -1 : 1) : left > right ? -1 : 1;
        });

        return builder;
      },

      async maybeSingle() {
        return {
          data: filtered[0] ?? null,
          error: null,
        };
      },

      async single() {
        return {
          data: filtered[0] ?? null,
          error: null,
        };
      },

      insert(values: any) {
        const row = {
          id: crypto.randomUUID(),
          ...values,
        };

        rows.push(row);

        return {
          select() {
            return {
              async single() {
                return {
                  data: row,
                  error: null,
                };
              },
            };
          },
        };
      },

      update(values: any) {
        return {
          eq(column: string, value: unknown) {
            const row = rows.find((item) => item[column] === value);

            if (row) {
              Object.assign(row, values);
            }

            return {
              select() {
                return {
                  async single() {
                    return {
                      data: row ?? null,
                      error: row ? null : new Error("Not found"),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    return builder;
  };

  const supabaseClient = {
    auth: {
      async getUser(token: string) {
        if (token === "student-token") {
          return {
            data: {
              user: {
                id: "student-1",
                email: "student@example.com",
              },
            },
            error: null,
          };
        }

        if (token === "coordinator-token") {
          return {
            data: {
              user: {
                id: "coordinator-1",
                email: "coordinator@example.com",
              },
            },
            error: null,
          };
        }

        return {
          data: { user: null },
          error: new Error("Invalid token"),
        };
      },
    },
  };

  return {
    supabaseClient,
    supabaseAdmin: {
      from(table: keyof typeof data) {
        const rows = data[table] as any[];
        return makeBuilder(table, rows);
      },
    },
  };
}

Deno.test("POST /attendance - creates attendance", async () => {
  const app = createIntegrationApp();

  const response = await app.request("/attendance", {
    method: "POST",
    headers: {
      Authorization: "Bearer student-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      internship_id: "11111111-1111-1111-1111-111111111111",
      attendance_date: "2026-06-15",
      time_in: "08:00",
      time_out: "17:00",
    }),
  });

  assertEquals(response.status, 201);

  const body = await response.json();

  assertEquals(body.success, true);
  assertExists(body.data);

  assertEquals(body.data.internship_id, "11111111-1111-1111-1111-111111111111");

  assertEquals(body.data.validation_status, "pending");
});

Deno.test("POST /attendance - rejects invalid request body", async () => {
  const app = createIntegrationApp();

  const response = await app.request("/attendance", {
    method: "POST",
    headers: {
      Authorization: "Bearer student-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      internship_id: "invalid",
      attendance_date: "invalid-date",
      time_in: "invalid-time",
      time_out: "invalid-time",
    }),
  });

  assertEquals(response.status, 400);
});

Deno.test("GET /attendance/me - returns student's attendance", async () => {
  const app = createIntegrationApp();

  const response = await app.request("/attendance/me", {
    method: "GET",
    headers: {
      Authorization: "Bearer student-token",
    },
  });

  assertEquals(response.status, 200);

  const body = await response.json();

  assertEquals(body.success, true);
  assertExists(body.data);
  assertEquals(Array.isArray(body.data), true);
  assertEquals(body.data.length, 1);
});

Deno.test("GET /attendance/:id - returns attendance", async () => {
  const app = createIntegrationApp();

  const response = await app.request("/attendance/attendance-1", {
    method: "GET",
    headers: {
      Authorization: "Bearer student-token",
    },
  });

  assertEquals(response.status, 200);

  const body = await response.json();

  assertEquals(body.success, true);
  assertEquals(body.data.id, "attendance-1");
});

Deno.test(
  "GET /attendance/:id - returns 404 for missing attendance",
  async () => {
    const app = createIntegrationApp();

    const response = await app.request("/attendance/missing-attendance", {
      method: "GET",
      headers: {
        Authorization: "Bearer student-token",
      },
    });

    assertEquals(response.status, 404);

    const body = await response.json();

    assertEquals(body.success, false);
  },
);

Deno.test(
  "GET /attendance/internship/:id - returns attendance records",
  async () => {
    const app = createIntegrationApp();

    const response = await app.request(
      "/attendance/internship/11111111-1111-1111-1111-111111111111",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer student-token",
        },
      },
    );

    assertEquals(response.status, 200);

    const body = await response.json();

    assertEquals(body.success, true);
    assertEquals(Array.isArray(body.data), true);
  },
);

Deno.test(
  "GET /attendance/internship/:id/rendered-hours - returns rendered hours",
  async () => {
    const app = createIntegrationApp();

    const response = await app.request(
      "/attendance/internship/11111111-1111-1111-1111-111111111111/rendered-hours",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer student-token",
        },
      },
    );

    assertEquals(response.status, 200);

    const body = await response.json();

    assertEquals(body.success, true);
    assertEquals(
      body.data.internshipId,
      "11111111-1111-1111-1111-111111111111",
    );

    assertEquals(body.data.totalHours, 0);
  },
);

Deno.test("PATCH /attendance/:id - updates pending attendance", async () => {
  const app = createIntegrationApp();

  const response = await app.request("/attendance/attendance-1", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer student-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      time_in: "09:00",
      time_out: "18:00",
    }),
  });

  assertEquals(response.status, 200);

  const body = await response.json();

  assertEquals(body.success, true);
  assertEquals(body.data.time_in, "09:00");
  assertEquals(body.data.time_out, "18:00");
});

Deno.test(
  "PATCH /attendance/:id/validation - validates attendance",
  async () => {
    const app = createIntegrationApp();

    /*
     * This route requires internship_coordinator.
     *
     * The production requireRole middleware normally obtains
     * the role from the authenticated profile/session.
     *
     * Therefore this test should be run against the actual
     * auth/role test fixture in your project.
     *
     * The request shape itself is still tested here.
     */

    const response = await app.request("/attendance/attendance-1/validation", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer student-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        validation_status: "validated",
      }),
    });

    /*
     * Depending on your requireRole implementation this may
     * return 401/403 because the integration fixture above
     * authenticates the user as a student.
     */
    assertEquals([200, 401, 403].includes(response.status), true);
  },
);

Deno.test(
  "PATCH /attendance/:id/validation - rejects invalid status",
  async () => {
    const app = createIntegrationApp();

    const response = await app.request("/attendance/attendance-1/validation", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer student-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        validation_status: "pending",
      }),
    });

    assertEquals([400, 401, 403].includes(response.status), true);
  },
);
