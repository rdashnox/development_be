// tests/unit/reports/reports.unified.test.ts
import { assertEquals, assertExists, assertRejects, assertThrows } from "@std/assert";
import { z } from "zod";

// ==========================================
// 1. SCHEMA SCOPE (6 Test Cases)
// ==========================================
const ReportQuerySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  status: z.enum(["active", "completed", "pending"]).optional(),
  limit: z.number().int().positive().default(10),
  format: z.enum(["json", "csv"]).default("json"),
});

Deno.test(
  "Reports Schema - validates correct query parameters with defaults",
  () => {
    const result = ReportQuerySchema.parse({ status: "active" });
    assertEquals(result.status, "active");
    assertEquals(result.limit, 10);
  },
);

Deno.test("Reports Schema - throws error on invalid status enum value", () => {
  assertThrows(() => {
    ReportQuerySchema.parse({ status: "suspended" });
  }, z.ZodError);
});

Deno.test("Reports Schema - validates correct date string formats", () => {
  const result = ReportQuerySchema.parse({
    startDate: "2026-01-01",
    endDate: "2026-06-30",
  });
  assertEquals(result.startDate, "2026-01-01");
  assertEquals(result.endDate, "2026-06-30");
});

Deno.test("Reports Schema - throws error on malformed date string", () => {
  assertThrows(() => {
    ReportQuerySchema.parse({ startDate: "01-01-2026" });
  }, z.ZodError);
});

Deno.test("Reports Schema - ensures limit must be a positive integer", () => {
  assertThrows(() => {
    ReportQuerySchema.parse({ limit: -5 });
  }, z.ZodError);
});

Deno.test(
  "Reports Schema - validates export format option with default",
  () => {
    const result = ReportQuerySchema.parse({ format: "csv" });
    assertEquals(result.format, "csv");

    const defaultResult = ReportQuerySchema.parse({});
    assertEquals(defaultResult.format, "json");
  },
);

// ==========================================
// 2. TYPES & DATA MAPPING SCOPE (7 Test Cases)
// ==========================================
type InternshipStatus = "active" | "completed" | "pending";

interface InternshipSummaryRecord {
  status: InternshipStatus;
  count: number;
}

interface MappedSummaryReport {
  active: number;
  completed: number;
  pending: number;
  total: number;
}

function mapStatusSummary(
  records: InternshipSummaryRecord[],
): MappedSummaryReport {
  const summary: MappedSummaryReport = {
    active: 0,
    completed: 0,
    pending: 0,
    total: 0,
  };
  for (const record of records) {
    if (record.status in summary) {
      summary[record.status] = record.count;
      summary.total += record.count;
    }
  }
  return summary;
}

Deno.test(
  "Reports Types/Mapping - correctly aggregates record arrays into summary structure",
  () => {
    const input: InternshipSummaryRecord[] = [
      { status: "active", count: 10 },
      { status: "completed", count: 5 },
      { status: "pending", count: 2 },
    ];
    const output = mapStatusSummary(input);
    assertEquals(output.active, 10);
    assertEquals(output.completed, 5);
    assertEquals(output.pending, 2);
    assertEquals(output.total, 17);
  },
);

Deno.test(
  "Reports Types/Mapping - handles empty record sets gracefully",
  () => {
    const output = mapStatusSummary([]);
    assertEquals(output.active, 0);
    assertEquals(output.total, 0);
  },
);

Deno.test("Reports Types/Mapping - safely ignores unknown status types", () => {
  const input = [{ status: "unknown" as InternshipStatus, count: 10 }];
  const output = mapStatusSummary(input);
  assertEquals(output.total, 0);
});

Deno.test(
  "Reports Types/Mapping - correctly isolates individual status values",
  () => {
    const input: InternshipSummaryRecord[] = [{ status: "pending", count: 42 }];
    const output = mapStatusSummary(input);
    assertEquals(output.pending, 42);
    assertEquals(output.active, 0);
  },
);

Deno.test(
  "Reports Types/Mapping - preserves structural typing compliance",
  () => {
    const record: InternshipSummaryRecord = { status: "active", count: 5 };
    assertExists(record.status);
    assertExists(record.count);
  },
);

Deno.test(
  "Reports Types/Mapping - handles duplicate status groupings by overwriting with latest count",
  () => {
    const input: InternshipSummaryRecord[] = [
      { status: "active", count: 5 },
      { status: "active", count: 15 },
    ];
    const output = mapStatusSummary(input);
    assertEquals(output.active, 15);
    assertEquals(output.total, 20);
  },
);

Deno.test(
  "Reports Types/Mapping - ensures all standard properties initialize to zero",
  () => {
    const output = mapStatusSummary([]);
    assertEquals(output, { active: 0, completed: 0, pending: 0, total: 0 });
  },
);

// ==========================================
// 3. SERVICE LOGIC SCOPE (7 Test Cases)
// ==========================================
class ReportsService {
  // deno-lint-ignore no-explicit-any
  constructor(private client: any) {}

  async getInternshipStatusSummary() {
    const { data, error } = await this.client
      .from("internships")
      .select("status, count");
    if (error) throw new Error(error.message);
    return mapStatusSummary(data);
  }

  async getStudentProgressReport() {
    const { data, error } = await this.client
      .from("student_progress")
      .select("*");
    if (error) throw new Error(error.message);
    return data;
  }

  async getHtePlacementReport() {
    const { data, error } = await this.client
      .from("hte_placements")
      .select("hte_name, student_count");
    if (error) throw new Error(error.message);
    return data;
  }
}

function createMockClient(data: unknown, error: unknown = null) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        then: (resolve: (val: { data: unknown; error: unknown }) => void) =>
          resolve({ data, error }),
      }),
    }),
  };
}

Deno.test(
  "Reports Service - successfully fetches and maps status summary",
  async () => {
    const mockClient = createMockClient([
      { status: "active", count: 20 },
      { status: "completed", count: 10 },
    ]);
    const service = new ReportsService(mockClient);
    const result = await service.getInternshipStatusSummary();
    assertEquals(result.active, 20);
    assertEquals(result.total, 30);
  },
);

Deno.test(
  "Reports Service - handles database errors during status summary fetch",
  async () => {
    const mockClient = createMockClient(null, { message: "Query timeout" });
    const service = new ReportsService(mockClient);
    await assertRejects(
      async () => await service.getInternshipStatusSummary(),
      Error,
      "Query timeout",
    );
  },
);

Deno.test(
  "Reports Service - successfully retrieves student progress report rows",
  async () => {
    const mockData = [{ student_id: "1", rendered_hours: 120 }];
    const mockClient = createMockClient(mockData);
    const service = new ReportsService(mockClient);
    const result = await service.getStudentProgressReport();
    assertEquals(result.length, 1);
    assertEquals(result[0].rendered_hours, 120);
  },
);

Deno.test(
  "Reports Service - handles database errors during student progress fetch",
  async () => {
    const mockClient = createMockClient(null, { message: "Permission denied" });
    const service = new ReportsService(mockClient);
    await assertRejects(
      async () => await service.getStudentProgressReport(),
      Error,
      "Permission denied",
    );
  },
);

Deno.test(
  "Reports Service - initializes correctly with injected client dependency",
  () => {
    const mockClient = createMockClient([]);
    const service = new ReportsService(mockClient);
    assertExists(service);
  },
);

Deno.test(
  "Reports Service - successfully retrieves HTE placement distribution report",
  async () => {
    const mockData = [{ hte_name: "TechCorp Inc.", student_count: 5 }];
    const mockClient = createMockClient(mockData);
    const service = new ReportsService(mockClient);
    const result = await service.getHtePlacementReport();
    assertEquals(result.length, 1);
    assertEquals(result[0].hte_name, "TechCorp Inc.");
    assertEquals(result[0].student_count, 5);
  },
);

Deno.test(
  "Reports Service - handles database errors during HTE placement fetch",
  async () => {
    const mockClient = createMockClient(null, { message: "Table not found" });
    const service = new ReportsService(mockClient);
    await assertRejects(
      async () => await service.getHtePlacementReport(),
      Error,
      "Table not found",
    );
  },
);
