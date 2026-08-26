import type { SupabaseClients } from "../../lib/supabase.ts";

import { AppError } from "../../errors/app-error.ts";

import type {
  CreateUserRequest,
  UpdateUserRequest,
  UpdateUserRoleRequest,
  UpdateUserStatusRequest,
} from "./users.types.ts";

export class UserService {
  constructor(private readonly clients: SupabaseClients) {}
  async listUsers() {
    const { data, error } = await this.clients.supabaseAdmin
      .from("profiles")
      .select(
        `
        id,
        email,
        first_name,
        middle_name,
        last_name,
        suffix,
        role,
        is_active,
        created_at
      `,
      )
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new AppError(500, error.message);
    }

    return data;
  }

  async getUser(id: string) {
    const { data, error } = await this.clients.supabaseAdmin
      .from("profiles")
      .select(
        `
        id,
        email,
        first_name,
        middle_name,
        last_name,
        suffix,
        role,
        is_active,
        must_change_password,
        last_login_at,
        last_password_changed_at,
        created_at,
        updated_at
      `,
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new AppError(404, "User not found.");
    }

    return data;
  }

  async createUser(request: CreateUserRequest) {
    const { data, error } = await this.clients.supabaseAdmin.auth.admin.createUser({
      email: request.email,
      password: request.password,
      email_confirm: true,
      user_metadata: {
        first_name: request.firstName,
        last_name: request.lastName,
        role: request.role,
      },
    });

    if (error || !data.user) {
      throw new AppError(400, error?.message ?? "Unable to create user.");
    }

    const userId = data.user.id;

    const { error: profileError } = await this.clients.supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email: request.email,
        first_name: request.firstName,
        middle_name: request.middleName ?? null,
        last_name: request.lastName,
        suffix: request.suffix ?? null,
        role: request.role,
        is_active: true,
        must_change_password: true,
      });

    if (profileError) {
      // Prevent orphaned auth users.
      await this.clients.supabaseAdmin.auth.admin.deleteUser(userId);

      throw new AppError(500, profileError.message);
    }

    return {
      id: userId,
      email: request.email,
    };
  }

  async updateUser(id: string, request: UpdateUserRequest) {
    const { error } = await this.clients.supabaseAdmin
      .from("profiles")
      .update({
        first_name: request.firstName,
        middle_name: request.middleName ?? null,
        last_name: request.lastName,
        suffix: request.suffix ?? null,
      })
      .eq("id", id);

    if (error) {
      throw new AppError(500, error.message);
    }

    return {
      message: "User updated successfully.",
    };
  }

  async updateUserRole(id: string, request: UpdateUserRoleRequest) {
    const { error } = await this.clients.supabaseAdmin
      .from("profiles")
      .update({
        role: request.role,
      })
      .eq("id", id);

    if (error) {
      throw new AppError(500, error.message);
    }

    return {
      message: "User role updated successfully.",
    };
  }

  async updateStatus(id: string, request: UpdateUserStatusRequest) {
    const { data, error } = await this.clients.supabaseAdmin
      .from("profiles")
      .update({
        is_active: request.isActive,
      })
      .eq("id", id)
      .select("id, is_active")
      .single();

    if (error || !data) {
      throw new AppError(
        500,
        error?.message ?? "Unable to update user status.",
      );
    }

    return {
      message: request.isActive ? "User status updated." : "User deactivated.",
    };
  }
}
