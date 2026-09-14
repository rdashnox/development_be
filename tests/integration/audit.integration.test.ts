import { assertEquals, assertExists } from "@std/assert";

import { createApp } from "../../src/app.ts";
import { loadEnv } from "../../src/config/env.ts";
import { getDenoEnv } from "../../src/config/runtime.ts";
import { createSupabaseClients } from "../../src/lib/supabase.ts";

import { setupTestUsers } from "../helpers/test-user.setup.ts";
import { TEST_USERS } from "../fixtures/test-users.ts";

const env = loadEnv({
  ...getDenoEnv(),
  RATE_LIMIT_ENABLED: "false",
});

const app = createApp(env);

const { supabaseAdmin } = createSupabaseClients(env);

async function login(email: string, password: string) {
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
) {
  return await app.request(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

async function getUserIdByEmail(email: string): Promise<string> {
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

async function getAdminToken(): Promise<string> {
  const result = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);

  assertEquals(
    result.response.status,
    200,
    `Admin login failed: ${JSON.stringify(result.body)}`,
  );

  assertExists(result.body.data?.accessToken);

  return result.body.data.accessToken;
}

async function getStudentToken(): Promise<string> {
  const result = await login(
    TEST_USERS.student.email,
    TEST_USERS.student.password,
  );

  assertEquals(result.response.status, 200);
  assertExists(result.body.data?.accessToken);

  return result.body.data.accessToken;
}

async function deleteAuditRecords(resourceId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("audit_logs")
    .delete()
    .eq("resource_id", resourceId);

  if (error) {
    throw error;
  }
}

async function createTestAuditRecord(
  resourceId: string,
  overrides: Record<string, unknown> = {},
) {
  const adminId = await getUserIdByEmail(TEST_USERS.admin.email);

  const record = {
    user_id: adminId,
    action: "CREATE_INTERNSHIP",
    resource_type: "internship",
    resource_id: resourceId,
    details: {
      test: true,
    },
    ip_address: "127.0.0.1",
    ...overrides,
  };

  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .insert(record)
    .select()
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to create test audit record.");
  }

  return data;
}

/*
 * ---------------------------------------------------------
 * AUTHENTICATION / AUTHORIZATION
 * ---------------------------------------------------------
 */

Deno.test("FR-11 unauthenticated audit-log request returns 401", async () => {
  const response = await app.request("/api/v1/audit-logs");

  assertEquals(response.status, 401);
});

Deno.test("FR-11 non-administrator cannot retrieve audit logs", async () => {
  await setupTestUsers();

  const token = await getStudentToken();

  const response = await authenticatedRequest("/api/v1/audit-logs", token);

  assertEquals(response.status, 403);
});

Deno.test("FR-11 administrator can retrieve audit logs", async () => {
  await setupTestUsers();

  const token = await getAdminToken();

  const response = await authenticatedRequest("/api/v1/audit-logs", token);

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertExists(body.data);

  assertEquals(Array.isArray(body.data.items), true);
  assertExists(body.data.page);
  assertExists(body.data.limit);
  assertExists(body.data.total);
  assertExists(body.data.totalPages);
});

/*
 * ---------------------------------------------------------
 * AUDIT RECORD CONTENT
 * ---------------------------------------------------------
 */

Deno.test(
  "FR-11 administrator can retrieve an audit record with actor and resource",
  async () => {
    await setupTestUsers();

    const resourceId = crypto.randomUUID();

    try {
      await createTestAuditRecord(resourceId, {
        action: "APPROVE_DOCUMENT",
        resource_type: "document",
        details: {
          status: "approved",
        },
      });

      const token = await getAdminToken();

      const response = await authenticatedRequest(
        `/api/v1/audit-logs?resourceId=${resourceId}`,
        token,
      );

      const body = await response.json();

      assertEquals(response.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.data.items.length, 1);

      const record = body.data.items[0];

      assertEquals(
        record.user_id,
        await getUserIdByEmail(TEST_USERS.admin.email),
      );
      assertEquals(record.action, "APPROVE_DOCUMENT");
      assertEquals(record.resource_type, "document");
      assertEquals(record.resource_id, resourceId);
      assertEquals(record.details.status, "approved");
      assertEquals(record.ip_address, "127.0.0.1");
      assertExists(record.created_at);
    } finally {
      await deleteAuditRecords(resourceId);
    }
  },
);

/*
 * ---------------------------------------------------------
 * FILTERING
 * ---------------------------------------------------------
 */

Deno.test("FR-11 audit logs can be filtered by action", async () => {
  await setupTestUsers();

  const resourceId = crypto.randomUUID();

  try {
    await createTestAuditRecord(resourceId, {
      action: "SUBMIT_EVALUATION",
      resource_type: "evaluation",
    });

    const token = await getAdminToken();

    const response = await authenticatedRequest(
      `/api/v1/audit-logs?action=SUBMIT_EVALUATION&resourceId=${resourceId}`,
      token,
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.items.length, 1);
    assertEquals(body.data.items[0].action, "SUBMIT_EVALUATION");
  } finally {
    await deleteAuditRecords(resourceId);
  }
});

Deno.test("FR-11 audit logs can be filtered by resource type", async () => {
  await setupTestUsers();

  const resourceId = crypto.randomUUID();

  try {
    await createTestAuditRecord(resourceId, {
      action: "APPROVE_DOCUMENT",
      resource_type: "document",
    });

    const token = await getAdminToken();

    const response = await authenticatedRequest(
      `/api/v1/audit-logs?resourceType=document&resourceId=${resourceId}`,
      token,
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.items.length, 1);
    assertEquals(body.data.items[0].resource_type, "document");
  } finally {
    await deleteAuditRecords(resourceId);
  }
});

Deno.test("FR-11 audit logs support pagination", async () => {
  await setupTestUsers();

  const resourceIds = Array.from({ length: 3 }, () => crypto.randomUUID());

  try {
    for (const resourceId of resourceIds) {
      await createTestAuditRecord(resourceId);
    }

    const token = await getAdminToken();

    const response = await authenticatedRequest(
      "/api/v1/audit-logs?resourceType=internship&limit=2&page=1",
      token,
    );

    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.data.page, 1);
    assertEquals(body.data.limit, 2);
    assertEquals(body.data.items.length <= 2, true);
  } finally {
    for (const resourceId of resourceIds) {
      await deleteAuditRecords(resourceId);
    }
  }
});

/*
 * ---------------------------------------------------------
 * VALIDATION
 * ---------------------------------------------------------
 */

Deno.test("FR-11 invalid action filter returns 400", async () => {
  await setupTestUsers();

  const token = await getAdminToken();

  const response = await authenticatedRequest(
    "/api/v1/audit-logs?action=INVALID_ACTION",
    token,
  );

  assertEquals(response.status, 400);
});

Deno.test("FR-11 invalid userId filter returns 400", async () => {
  await setupTestUsers();

  const token = await getAdminToken();

  const response = await authenticatedRequest(
    "/api/v1/audit-logs?userId=not-a-uuid",
    token,
  );

  assertEquals(response.status, 400);
});

/*
 * ---------------------------------------------------------
 * IMMUTABILITY / PUBLIC API
 * ---------------------------------------------------------
 */

Deno.test(
  "FR-11 audit logs cannot be created through POST endpoint",
  async () => {
    await setupTestUsers();

    const token = await getAdminToken();

    const response = await authenticatedRequest("/api/v1/audit-logs", token, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "CREATE_INTERNSHIP",
        resourceType: "internship",
        resourceId: crypto.randomUUID(),
        details: {},
      }),
    });

    assertEquals(response.status, 404);
  },
);

Deno.test(
  "FR-11 audit logs cannot be modified through PATCH endpoint",
  async () => {
    await setupTestUsers();

    const token = await getAdminToken();
    const resourceId = crypto.randomUUID();

    try {
      const record = await createTestAuditRecord(resourceId);

      const response = await authenticatedRequest(
        `/api/v1/audit-logs/${record.id}`,
        token,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "DELETE_DOCUMENT",
          }),
        },
      );

      assertEquals(response.status, 404);
    } finally {
      await deleteAuditRecords(resourceId);
    }
  },
);

Deno.test(
  "FR-11 audit logs cannot be deleted through DELETE endpoint",
  async () => {
    await setupTestUsers();

    const token = await getAdminToken();
    const resourceId = crypto.randomUUID();

    try {
      const record = await createTestAuditRecord(resourceId);

      const response = await authenticatedRequest(
        `/api/v1/audit-logs/${record.id}`,
        token,
        {
          method: "DELETE",
        },
      );

      assertEquals(response.status, 404);

      const { data, error } = await supabaseAdmin
        .from("audit_logs")
        .select("id")
        .eq("id", record.id)
        .single();

      if (error) {
        throw error;
      }

      assertEquals(data.id, record.id);
    } finally {
      await deleteAuditRecords(resourceId);
    }
  },
);

Deno.test("FR-11 successful login creates a LOGIN audit record", async () => {
  await setupTestUsers();

  const adminId = await getUserIdByEmail(TEST_USERS.admin.email);

  const result = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);

  assertEquals(
    result.response.status,
    200,
    `Login failed: ${JSON.stringify(result.body)}`,
  );

  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select(
      "id, user_id, action, resource_type, resource_id, details, created_at",
    )
    .eq("user_id", adminId)
    .eq("action", "LOGIN")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  assertExists(data);
  assertEquals(
    data.length,
    1,
    "Expected a LOGIN audit record to be created after successful login.",
  );

  const record = data[0];

  assertEquals(record.user_id, adminId);
  assertEquals(record.action, "LOGIN");
  assertExists(record.resource_type);
  assertExists(record.resource_id);
  assertExists(record.created_at);
});
