export interface CurrentInternship {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  required_hours: number | null;
  status: "pending" | "active";
  created_at: string;
  updated_at: string;
  student_profiles: {
    id: string;
    student_number: string;
    program: string;
    year_level: number;
    section: string | null;
  } | null;
  hte_profiles: {
    id: string;
    company_name: string;
    contact_person: string;
    contact_email: string | null;
    is_active: boolean;
  } | null;
}

export interface StudentProfile {
  id: string;
  student_number: string;
  program: string;
  year_level: number;
  section: string | null;
  contact_number: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  currentInternship: CurrentInternship | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStudentProfileRequest {
  userId: string;
  studentNumber: string;
  program: string;
  yearLevel: number;
  section?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
}

export interface UpdateStudentProfileRequest {
  studentNumber?: string;
  program?: string;
  yearLevel?: number;
  section?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
}

export interface UpdateMyStudentProfileRequest {
  contactNumber?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
}
