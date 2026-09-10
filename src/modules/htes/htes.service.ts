import type { SupabaseClients } from "../../lib/supabase.ts";
import { AppError } from "../../errors/app-error.ts";

import type { CreateHTERequest, UpdateHTERequest, UpdateHTEStatusRequest } from "./htes.types.ts";

const HTE_SELECT = `  id,
  company_name,
  address,
  contact_person,
  contact_email,
  contact_number,
  supervisor_id,
  is_active,
  created_at,
  updated_at`;

const HTE_STUDENTS_SELECT = `
  id,
  student_id,
  hte_id,
  faculty_adviser_id,
  required_hours,
  status,
  created_at,
  updated_at,
  student_profiles (
    id,
    student_number,
    program,
    year_level,
    section,
    contact_number,
    address,
    emergency_contact_name,
    emergency_contact_number,
    created_at,
    updated_at,
    profiles (
      id,
      email,
      first_name,
      middle_name,
      last_name,
      suffix
    )
  )
`;

export class HteService {
  constructor(private readonly clients: SupabaseClients) {}

  async listHtes() {
    const { data, error } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .select(HTE_SELECT)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new AppError(500, "Unable to retrieve HTE profiles.");
    }

    return data;
  }

  async getHte(id: string) {
    const { data, error } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .select(HTE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new AppError(500, "Unable to retrieve HTE profile.");
    }

    if (!data) {
      throw new AppError(404, "HTE profile not found.");
    }

    return data;
  }

  /**

* Returns all operational student internships associated
* with the specified HTE.
*
* Operational internships are limited to pending and active.
* Completed internships are intentionally excluded.
  */
  async listHteStudents(hteId: string) {
    const { data: hte, error: hteError } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .select("id")
      .eq("id", hteId)
      .maybeSingle();

    if (hteError) {
      throw new AppError(500, "Unable to verify HTE profile.");
    }

    if (!hte) {
      throw new AppError(404, "HTE profile not found.");
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(HTE_STUDENTS_SELECT)
      .eq("hte_id", hteId)
      .in("status", ["pending", "active"])
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new AppError(
        500,
        "Unable to retrieve student interns for this HTE.",
      );
    }

    return data ?? [];
  }

  /**

* Returns all operational student internships associated
* with the HTE assigned to the authenticated HTE supervisor.
*
* The supervisor ID comes from the authenticated user and is
* never accepted from the client.
  */
  async listMyStudents(supervisorId: string) {
    const { data: htes, error: hteError } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .select(HTE_SELECT)
      .eq("supervisor_id", supervisorId)
      .eq("is_active", true);

    if (hteError) {
      throw new AppError(
        500,
        "Unable to retrieve HTE assignments for the supervisor.",
      );
    }

    if (!htes || htes.length === 0) {
      return [];
    }

    const hteIds = htes.map((hte) => hte.id);

    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(HTE_STUDENTS_SELECT)
      .in("hte_id", hteIds)
      .in("status", ["pending", "active"])
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new AppError(500, "Unable to retrieve your student interns.");
    }

    return data ?? [];
  }

  async createHte(request: CreateHTERequest) {
    const { data, error } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .insert({
        company_name: request.companyName,
        address: request.address,
        contact_person: request.contactPerson,
        contact_email: request.contactEmail ?? null,
        contact_number: request.contactNumber ?? null,
      })
      .select(HTE_SELECT)
      .single();

    if (error || !data) {
      throw new AppError(
        400,
        error?.message ?? "Unable to create HTE profile.",
      );
    }

    return data;
  }

  async updateHte(id: string, request: UpdateHTERequest) {
    const updateData = {
      ...(request.companyName !== undefined && {
        company_name: request.companyName,
      }),

      ...(request.address !== undefined && {
        address: request.address,
      }),

      ...(request.contactPerson !== undefined && {
        contact_person: request.contactPerson,
      }),

      ...(request.contactEmail !== undefined && {
        contact_email: request.contactEmail,
      }),

      ...(request.contactNumber !== undefined && {
        contact_number: request.contactNumber,
      }),
    };

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, "At least one HTE profile field is required.");
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .update(updateData)
      .eq("id", id)
      .select(HTE_SELECT)
      .maybeSingle();

    if (error) {
      throw new AppError(400, error.message);
    }

    if (!data) {
      throw new AppError(404, "HTE profile not found.");
    }

    return data;
  }

  async updateStatus(id: string, request: UpdateHTEStatusRequest) {
    const { data, error } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .update({
        is_active: request.isActive,
      })
      .eq("id", id)
      .select(HTE_SELECT)
      .maybeSingle();

    if (error) {
      throw new AppError(400, error.message);
    }

    if (!data) {
      throw new AppError(404, "HTE profile not found.");
    }

    return data;
  }

  async assignSupervisor(id: string, supervisorId: string | null) {
    if (supervisorId !== null) {
      const { data: supervisor, error: supervisorError } = await this.clients.supabaseAdmin
        .from("profiles")
        .select("id, role, is_active")
        .eq("id", supervisorId)
        .maybeSingle();

      if (supervisorError) {
        throw new AppError(500, "Unable to verify the HTE supervisor.");
      }

      if (!supervisor) {
        throw new AppError(404, "HTE supervisor profile not found.");
      }

      if (supervisor.role !== "hte_supervisor") {
        throw new AppError(400, "The selected user is not an HTE supervisor.");
      }

      if (!supervisor.is_active) {
        throw new AppError(
          400,
          "The selected HTE supervisor account is inactive.",
        );
      }
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .update({
        supervisor_id: supervisorId,
      })
      .eq("id", id)
      .select(HTE_SELECT)
      .maybeSingle();

    if (error) {
      throw new AppError(400, error.message);
    }

    if (!data) {
      throw new AppError(404, "HTE profile not found.");
    }

    return data;
  }
}
