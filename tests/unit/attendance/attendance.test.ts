// deno-lint-ignore-file require-await
import { assertEquals, assertRejects } from "@std/assert";

// NOTE: Keep test behavior aligned with the real attendance service contract.

import {
  AttendanceService,
  calculateRenderedHours,
} from "../../../src/modules/attendance/attendance.service.ts";

import { AppError } from "../../../src/errors/app-error.ts";

function createMockClients() {
  const tables: Record<string, unknown> = {};

  const supabaseAdmin = {
    from(table: string) {
      tables[table] = tables[table] ?? [];

      const state = {
        table,
        filters: [] as Array<[string, string, unknown]>,
        neqFilters: [] as Array<[string, string, unknown]>,
        selected: "*",
        orderBy: null as { column: string; ascending: boolean } | null,
      };

      const applyFilters = () => {
        const rows = (tables[table] ?? []) as unknown[];

        return rows.filter((row) => {
          if (!row || typeof row !== "object") return false;

          const matches = state.filters.every(([, column, value]) => {
            return (row as Record<string, unknown>)[column] === value;
          });

          const excludes = state.neqFilters.every(([, column, value]) => {
            return (row as Record<string, unknown>)[column] !== value;
          });

          return matches && excludes;
        });
      };

      const query = {
        select(selection: string) {
          state.selected = selection;
          return query;
        },

        eq(column: string, value: unknown) {
          state.filters.push(["eq", column, value]);
          return query;
        },

        neq(column: string, value: unknown) {
          state.neqFilters.push(["neq", column, value]);
          return query;
        },

        order(column: string, options?: { ascending?: boolean }) {
          state.orderBy = {
            column,
            ascending: options?.ascending ?? true,
          };
          return query;
        },

        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          const filtered = applyFilters();

          if (state.orderBy) {
            filtered.sort((a, b) => {
              const left = (a as Record<string, unknown>)[state.orderBy!.column];
              const right = (b as Record<string, unknown>)[state.orderBy!.column];

              if (left === right) return 0;

              const result = String(left) < String(right) ? -1 : 1;
              return state.orderBy!.ascending ? result : -result;
            });
          }

          return Promise.resolve({ data: filtered, error: null }).then(resolve);
        },

        maybeSingle: async () => {
          const filtered = applyFilters();

          return {
            data: filtered[0] ?? null,
            error: null,
          };
        },

        single: async () => {
          const rows = (tables[table] ?? []) as unknown[];

          return {
            data: rows[0] ?? null,
            error: null,
          };
        },

        insert(values: Record<string, unknown>) {
          const rows = tables[table] as Record<string, unknown>[];

          const row = {
            id: crypto.randomUUID(),
            ...values,
          };

          rows.push(row);

          return {
            select() {
              return {
                single: async () => ({
                  data: row,
                  error: null,
                }),
              };
            },
          };
        },

        update(values: Record<string, unknown>) {
          const rows = tables[table] as Record<string, unknown>[];

          return {
            eq(column: string, value: unknown) {
              const row = rows.find((item) => item[column] === value);

              if (row) {
                Object.assign(row, values);
              }

              return {
                select() {
                  return {
                    single: async () => ({
                      data: row ?? null,
                      error: row ? null : new Error("Not found"),
                    }),
                  };
                },
              };
            },
          };
        },
      };

      return query;
    },
  };

  return {
    clients: {
      supabaseAdmin,
      // deno-lint-ignore no-explicit-any
    } as any,
    tables,
  };
}

Deno.test(
  "calculateRenderedHours - calculates rendered hours correctly",
  () => {
    assertEquals(calculateRenderedHours("08:00", "17:00"), 8);
  },
);

Deno.test("calculateRenderedHours - supports seconds", () => {
  assertEquals(calculateRenderedHours("08:00:00", "16:30:00"), 7.5);
});

Deno.test("calculateRenderedHours - rejects equal times", async () => {
  await assertRejects(
    async () => calculateRenderedHours("08:00", "08:00"),
    AppError,
    "Time-out must be later than time-in.",
  );
});

Deno.test(
  "calculateRenderedHours - rejects time-out before time-in",
  async () => {
    await assertRejects(
      async () => calculateRenderedHours("17:00", "08:00"),
      AppError,
      "Time-out must be later than time-in.",
    );
  },
);

Deno.test(
  "calculateRenderedHours - rejects duration of one hour or less",
  async () => {
    await assertRejects(
      async () => calculateRenderedHours("08:00", "09:00"),
      AppError,
      "Attendance duration is too short for the standard one-hour break.",
    );
  },
);

Deno.test("AttendanceService - creates valid attendance", async () => {
  const { clients, tables } = createMockClients();

  tables.internships = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      student_id: "student-1",
      status: "active",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    },
  ];

  tables.attendance_records = [];

  const service = new AttendanceService(clients);

  const result = await service.createAttendance("student-1", {
    internship_id: "11111111-1111-1111-1111-111111111111",
    attendance_date: "2026-06-01",
    time_in: "08:00",
    time_out: "17:00",
  });

  assertEquals(result.internship_id, "11111111-1111-1111-1111-111111111111");
  assertEquals(result.attendance_date, "2026-06-01");
  assertEquals(result.time_in, "08:00");
  assertEquals(result.time_out, "17:00");
  assertEquals(result.validation_status, "pending");
});

Deno.test("AttendanceService - rejects missing internship", async () => {
  const { clients, tables } = createMockClients();

  tables.internships = [];
  tables.attendance_records = [];

  const service = new AttendanceService(clients);

  await assertRejects(
    () =>
      service.createAttendance("student-1", {
        internship_id: "11111111-1111-1111-1111-111111111111",
        attendance_date: "2026-06-01",
        time_in: "08:00",
        time_out: "17:00",
      }),
    AppError,
    "Internship not found.",
  );
});

Deno.test(
  "AttendanceService - rejects attendance for another student's internship",
  async () => {
    const { clients, tables } = createMockClients();

    tables.internships = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        student_id: "different-student",
        status: "active",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      },
    ];

    tables.attendance_records = [];

    const service = new AttendanceService(clients);

    await assertRejects(
      () =>
        service.createAttendance("student-1", {
          internship_id: "11111111-1111-1111-1111-111111111111",
          attendance_date: "2026-06-01",
          time_in: "08:00",
          time_out: "17:00",
        }),
      Error,
      "You can only create attendance for your own internship.",
    );
  },
);

Deno.test("AttendanceService - rejects inactive internship", async () => {
  const { clients, tables } = createMockClients();

  tables.internships = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      student_id: "student-1",
      status: "completed",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    },
  ];

  tables.attendance_records = [];

  const service = new AttendanceService(clients);

  await assertRejects(
    () =>
      service.createAttendance("student-1", {
        internship_id: "11111111-1111-1111-1111-111111111111",
        attendance_date: "2026-06-01",
        time_in: "08:00",
        time_out: "17:00",
      }),
    Error,
    "Attendance can only be created for an active internship.",
  );
});

Deno.test(
  "AttendanceService - rejects attendance outside internship period",
  async () => {
    const { clients, tables } = createMockClients();

    tables.internships = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        student_id: "student-1",
        status: "active",
        start_date: "2026-06-10",
        end_date: "2026-06-30",
      },
    ];

    tables.attendance_records = [];

    const service = new AttendanceService(clients);

    await assertRejects(
      () =>
        service.createAttendance("student-1", {
          internship_id: "11111111-1111-1111-1111-111111111111",
          attendance_date: "2026-06-01",
          time_in: "08:00",
          time_out: "17:00",
        }),
      AppError,
      "Attendance date must fall within the internship period.",
    );
  },
);

Deno.test("AttendanceService - allows first internship day", async () => {
  const { clients, tables } = createMockClients();

  tables.internships = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      student_id: "student-1",
      status: "active",
      start_date: "2026-06-01",
      end_date: "2026-06-30",
    },
  ];

  tables.attendance_records = [];

  const service = new AttendanceService(clients);

  const result = await service.createAttendance("student-1", {
    internship_id: "11111111-1111-1111-1111-111111111111",
    attendance_date: "2026-06-01",
    time_in: "08:00",
    time_out: "17:00",
  });

  assertEquals(result.attendance_date, "2026-06-01");
});

Deno.test("AttendanceService - allows last internship day", async () => {
  const { clients, tables } = createMockClients();

  tables.internships = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      student_id: "student-1",
      status: "active",
      start_date: "2026-06-01",
      end_date: "2026-06-30",
    },
  ];

  tables.attendance_records = [];

  const service = new AttendanceService(clients);

  const result = await service.createAttendance("student-1", {
    internship_id: "11111111-1111-1111-1111-111111111111",
    attendance_date: "2026-06-30",
    time_in: "08:00",
    time_out: "17:00",
  });

  assertEquals(result.attendance_date, "2026-06-30");
});

Deno.test("AttendanceService - rejects duplicate attendance", async () => {
  const { clients, tables } = createMockClients();

  tables.internships = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      student_id: "student-1",
      status: "active",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    },
  ];

  tables.attendance_records = [
    {
      id: "attendance-1",
      internship_id: "11111111-1111-1111-1111-111111111111",
      attendance_date: "2026-06-01",
      time_in: "08:00",
      time_out: "17:00",
      validation_status: "pending",
    },
  ];

  const service = new AttendanceService(clients);

  await assertRejects(
    () =>
      service.createAttendance("student-1", {
        internship_id: "11111111-1111-1111-1111-111111111111",
        attendance_date: "2026-06-01",
        time_in: "08:00",
        time_out: "17:00",
      }),
    AppError,
    "Attendance for this date already exists.",
  );
});

Deno.test("AttendanceService - retrieves attendance by id", async () => {
  const { clients, tables } = createMockClients();

  tables.attendance_records = [
    {
      id: "attendance-1",
      internship_id: "internship-1",
      attendance_date: "2026-06-01",
      time_in: "08:00",
      time_out: "17:00",
      validation_status: "pending",
    },
  ];

  const service = new AttendanceService(clients);

  const result = await service.getAttendanceById("attendance-1");

  assertEquals(result.id, "attendance-1");
});

Deno.test(
  "AttendanceService - throws when attendance id does not exist",
  async () => {
    const { clients, tables } = createMockClients();

    tables.attendance_records = [];

    const service = new AttendanceService(clients);

    await assertRejects(
      () => service.getAttendanceById("missing"),
      AppError,
      "Attendance record not found.",
    );
  },
);

Deno.test(
  "AttendanceService - calculates validated rendered hours only",
  async () => {
    const { clients, tables } = createMockClients();

    tables.attendance_records = [
      {
        id: "1",
        internship_id: "internship-1",
        attendance_date: "2026-06-01",
        time_in: "08:00",
        time_out: "17:00",
        validation_status: "validated",
      },
      {
        id: "2",
        internship_id: "internship-1",
        attendance_date: "2026-06-02",
        time_in: "08:00",
        time_out: "17:00",
        validation_status: "pending",
      },
      {
        id: "3",
        internship_id: "internship-1",
        attendance_date: "2026-06-03",
        time_in: "08:00",
        time_out: "17:00",
        validation_status: "rejected",
      },
    ];

    const service = new AttendanceService(clients);

    const result = await service.getRenderedHours("internship-1");

    assertEquals(result, 8);
  },
);

Deno.test(
  "AttendanceService - rejects validation of already validated record",
  async () => {
    const { clients, tables } = createMockClients();

    tables.attendance_records = [
      {
        id: "attendance-1",
        internship_id: "internship-1",
        attendance_date: "2026-06-01",
        time_in: "08:00",
        time_out: "17:00",
        validation_status: "validated",
      },
    ];

    const service = new AttendanceService(clients);

    await assertRejects(
      () => service.validateAttendance("attendance-1", "coordinator-1", "rejected"),
      AppError,
      "Only pending attendance records can be validated.",
    );
  },
);

Deno.test("AttendanceService - validates pending attendance", async () => {
  const { clients, tables } = createMockClients();

  tables.attendance_records = [
    {
      id: "attendance-1",
      internship_id: "internship-1",
      attendance_date: "2026-06-01",
      time_in: "08:00",
      time_out: "17:00",
      validation_status: "pending",
    },
  ];

  tables.profiles = [
    {
      id: "coordinator-1",
      role: "internship_coordinator",
      is_active: true,
    },
  ];

  const service = new AttendanceService(clients);

  const result = await service.validateAttendance(
    "attendance-1",
    "coordinator-1",
    "validated",
  );

  assertEquals(result.validation_status, "validated");
  assertEquals(result.validated_by, "coordinator-1");
  assertEquals(typeof result.validated_at, "string");
});

Deno.test("AttendanceService - rejects inactive coordinator", async () => {
  const { clients, tables } = createMockClients();

  tables.attendance_records = [
    {
      id: "attendance-1",
      internship_id: "internship-1",
      attendance_date: "2026-06-01",
      time_in: "08:00",
      time_out: "17:00",
      validation_status: "pending",
    },
  ];

  tables.profiles = [
    {
      id: "coordinator-1",
      role: "internship_coordinator",
      is_active: false,
    },
  ];

  const service = new AttendanceService(clients);

  await assertRejects(
    () => service.validateAttendance("attendance-1", "coordinator-1", "validated"),
    AppError,
    "Only an active internship coordinator can validate attendance.",
  );
});

Deno.test("AttendanceService - rejects non-coordinator", async () => {
  const { clients, tables } = createMockClients();

  tables.attendance_records = [
    {
      id: "attendance-1",
      internship_id: "internship-1",
      attendance_date: "2026-06-01",
      time_in: "08:00",
      time_out: "17:00",
      validation_status: "pending",
    },
  ];

  tables.profiles = [
    {
      id: "user-1",
      role: "student",
      is_active: true,
    },
  ];

  const service = new AttendanceService(clients);

  await assertRejects(
    () => service.validateAttendance("attendance-1", "user-1", "validated"),
    AppError,
    "Only an active internship coordinator can validate attendance.",
  );
});

Deno.test(
  "AttendanceService - rejects update of validated attendance",
  async () => {
    const { clients, tables } = createMockClients();

    tables.attendance_records = [
      {
        id: "attendance-1",
        internship_id: "internship-1",
        attendance_date: "2026-06-01",
        time_in: "08:00",
        time_out: "17:00",
        validation_status: "validated",
      },
    ];

    const service = new AttendanceService(clients);

    await assertRejects(
      () =>
        service.updateAttendance("attendance-1", "student-1", {
          time_in: "09:00",
        }),
      AppError,
      "Only pending attendance records can be updated.",
    );
  },
);
