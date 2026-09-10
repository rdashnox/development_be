import type { AuthRole } from "../auth/auth.types.ts";

export interface CreateUserRequest {
  email: string;

  firstName: string;

  middleName?: string | null;

  lastName: string;

  suffix?: string | null;

  role: AuthRole;

  password: string;
}

export interface UpdateUserStatusRequest {
  isActive: boolean;
}

export interface UpdateUserRequest {
  firstName: string;

  middleName?: string | null;

  lastName: string;

  suffix?: string | null;
}

export interface UpdateUserRoleRequest {
  role: AuthRole;
}

export interface ListUsersByRoleRequest {
  role: AuthRole;
}
