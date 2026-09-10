export interface HTEStudentIdentity {
  id: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
}

export interface HTEStudentProfile {
  id: string;
  student_number: string;
  program: string;
  year_level: number;
  section: string | null;
  contact_number: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  created_at: string;
  updated_at: string;
  profiles: HTEStudentIdentity | null;
}

export interface HTEStudentInternship {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  required_hours: number | null;
  status: "pending" | "active";
  created_at: string;
  updated_at: string;
  student_profiles: HTEStudentProfile | null;
}

export interface HTEProfile {
  id: string;

  company_name: string;
  address: string;
  contact_person: string;
  contact_email: string | null;
  contact_number: string | null;

  supervisor_id: string | null;

  is_active: boolean;

  created_at: string;
  updated_at: string;
}

export interface CreateHTERequest {
  companyName: string;
  address: string;
  contactPerson: string;
  contactEmail?: string | null;
  contactNumber?: string | null;
}

export interface UpdateHTERequest {
  companyName?: string;
  address?: string;
  contactPerson?: string;
  contactEmail?: string | null;
  contactNumber?: string | null;
}

export interface UpdateHTEStatusRequest {
  isActive: boolean;
}

export interface UpdateHTESupervisorRequest {
  supervisorId: string | null;
}
