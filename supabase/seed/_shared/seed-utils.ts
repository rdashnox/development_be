import { loadEnv } from "../../../src/config/env.ts";
import { getDenoEnv } from "../../../src/config/runtime.ts";
import { createSupabaseClients } from "../../../src/lib/supabase.ts";

export function createSeedAdminClient() {
  const runtimeEnv = getDenoEnv();
  const env = loadEnv(runtimeEnv);

  if (env.ENVIRONMENT === "production") {
    throw new Error("Cannot seed production database");
  }

  return createSupabaseClients(env).supabaseAdmin;
}

export function getSeedPassword(): string {
  const seedPassword = getDenoEnv().SEED_USER_PASSWORD;

  if (!seedPassword) {
    throw new Error("SEED_USER_PASSWORD is required when seeding users.");
  }

  if (seedPassword.length < 8) {
    throw new Error("SEED_USER_PASSWORD must be at least 8 characters long.");
  }

  return seedPassword;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function seedError(scope: string, error: unknown): Error {
  return new Error(
    `${scope}:${error instanceof Error ? error.message : String(error)}`,
  );
}
