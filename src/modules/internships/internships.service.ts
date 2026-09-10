import type { SupabaseClients } from "../../lib/supabase.ts";
import { AppError } from "../../errors/app-error.ts";

import type {
  CreateInternshipRequest,
  InternshipStatus,
  UpdateInternshipRequest,
} from "./internships.types.ts";

const INTERNSHIP_SELECT = `
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
    section
  ),
  hte_profiles (
    id,
    company_name,
    contact_person,
    contact_email,
    is_active
  )
`;

const STATUS_TRANSITIONS: Record<InternshipStatus, InternshipStatus[]> = {
  pending: ["active"],
  active: ["completed"],
  completed: [],
};

export class InternshipService {
  constructor(private readonly clients: SupabaseClients) {}
  async listInternships() {
    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(INTERNSHIP_SELECT)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new AppError(500, "Unable to retrieve internships.");
    }

    return data;
  }

  async getInternship(id: string) {
    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(INTERNSHIP_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new AppError(500, "Unable to retrieve the internship.");
    }

    if (!data) {
      throw new AppError(404, "Internship not found.");
    }

    return data;
  }

  async getMyInternship(studentId: string) {
    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(INTERNSHIP_SELECT)
      .eq("student_id", studentId)
      .in("status", ["pending", "active"])
      .maybeSingle();

    if (error) {
      throw new AppError(500, "Unable to retrieve your internship.");
    }

    if (!data) {
      throw new AppError(404, "No internship assignment found.");
    }

    return data;
  }

  async createInternship(request: CreateInternshipRequest) {
    const { data: student, error: studentError } = await this.clients.supabaseAdmin
      .from("student_profiles")
      .select(
        `
          id,
          profiles!inner (
            is_active
          )
        `,
      )
      .eq("id", request.studentId)
      .maybeSingle();

    if (studentError) {
      throw new AppError(500, "Unable to verify the student.");
    }

    if (!student) {
      throw new AppError(404, "Student not found.");
    }

    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;

    if (!profile?.is_active) {
      throw new AppError(400, "The selected student account is inactive.");
    }

    const { data: hte, error: hteError } = await this.clients.supabaseAdmin
      .from("hte_profiles")
      .select(
        `
          id,
          is_active
        `,
      )
      .eq("id", request.hteId)
      .maybeSingle();

    if (hteError) {
      throw new AppError(500, "Unable to verify the HTE.");
    }

    if (!hte) {
      throw new AppError(404, "HTE not found.");
    }

    if (!hte.is_active) {
      throw new AppError(400, "The selected HTE is inactive.");
    }

    const { data: existingInternship, error: existingError } = await this.clients.supabaseAdmin
      .from("internships")
      .select("id")
      .eq("student_id", request.studentId)
      .in("status", ["pending", "active"])
      .maybeSingle();

    if (existingError) {
      throw new AppError(
        500,
        "Unable to check the student's existing internship.",
      );
    }

    if (existingInternship) {
      throw new AppError(
        409,
        "The student already has an active or pending internship assignment.",
      );
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .insert({
        student_id: request.studentId,
        hte_id: request.hteId,
        required_hours: request.requiredHours ?? null,
        status: "pending",
      })
      .select(INTERNSHIP_SELECT)
      .single();

    if (error) {
      throw new AppError(500, "Unable to create the internship assignment.");
    }

    return data;
  }

  async updateInternship(id: string, request: UpdateInternshipRequest) {
    const updateData = {
      ...(request.hteId !== undefined && {
        hte_id: request.hteId,
      }),
      ...(request.requiredHours !== undefined && {
        required_hours: request.requiredHours,
      }),
    };

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, "At least one internship field is required.");
    }

    if (request.hteId !== undefined) {
      const { data: hte, error: hteError } = await this.clients.supabaseAdmin
        .from("hte_profiles")
        .select("id, is_active")
        .eq("id", request.hteId)
        .maybeSingle();

      if (hteError) {
        throw new AppError(500, "Unable to verify the HTE.");
      }

      if (!hte) {
        throw new AppError(404, "HTE not found.");
      }

      if (!hte.is_active) {
        throw new AppError(400, "The selected HTE is inactive.");
      }
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .update(updateData)
      .eq("id", id)
      .select(INTERNSHIP_SELECT)
      .maybeSingle();

    if (error) {
      throw new AppError(500, "Unable to update the internship.");
    }

    if (!data) {
      throw new AppError(404, "Internship not found.");
    }

    return data;
  }

  async updateStatus(id: string, status: InternshipStatus) {
    const { data: internship, error: findError } = await this.clients.supabaseAdmin
      .from("internships")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      throw new AppError(500, "Unable to retrieve the internship.");
    }

    if (!internship) {
      throw new AppError(404, "Internship not found.");
    }

    const currentStatus = internship.status as InternshipStatus;
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(status)) {
      throw new AppError(
        400,
        `Invalid internship status transition from "${currentStatus}" to "${status}".`,
      );
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .update({
        status,
      })
      .eq("id", id)
      .select(INTERNSHIP_SELECT)
      .single();

    if (error) {
      throw new AppError(500, "Unable to update the internship status.");
    }

    return data;
  }

  async assignFacultyAdviser(id: string, facultyAdviserId: string | null) {
    if (facultyAdviserId !== null) {
      const { data: adviser, error: adviserError } = await this.clients.supabaseAdmin
        .from("profiles")
        .select("id, role, is_active")
        .eq("id", facultyAdviserId)
        .maybeSingle();

      if (adviserError) {
        throw new AppError(500, "Unable to verify the faculty adviser.");
      }

      if (!adviser) {
        throw new AppError(404, "Faculty adviser profile not found.");
      }

      if (adviser.role !== "faculty_adviser") {
        throw new AppError(400, "The selected user is not a faculty adviser.");
      }

      if (!adviser.is_active) {
        throw new AppError(
          400,
          "The selected faculty adviser account is inactive.",
        );
      }
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .update({
        faculty_adviser_id: facultyAdviserId,
      })
      .eq("id", id)
      .select(INTERNSHIP_SELECT)
      .maybeSingle();

    if (error) {
      throw new AppError(500, "Unable to update the faculty adviser.");
    }

    if (!data) {
      throw new AppError(404, "Internship not found.");
    }

    return data;
  }
}
