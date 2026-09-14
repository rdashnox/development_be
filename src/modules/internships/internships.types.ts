export type InternshipStatus = "pending" | "active" | "completed";

export interface CreateInternshipRequest {
  studentId: string;
  hteId: string;
  facultyAdviserId: string;
  startDate: string;
  endDate: string;
  requiredHours: number;
}

export interface UpdateInternshipRequest {
  hteId?: string;
  facultyAdviserId?: string | null;
  startDate?: string;
  endDate?: string;
  requiredHours?: number;
}

/**
 * Reserved for a future internship-review workflow.
 *
 * This interface currently has no known consumers in the
 * internship routes, service, tests, or other modules.
 *
 * It is intentionally retained rather than deleted so that
 * we do not perform unnecessary domain cleanup while the
 * requirements are still evolving.
 *
 * IMPORTANT:
 * "approved" and "rejected" are review outcomes only.
 * They are NOT InternshipStatus values.
 *
 * The actual internship lifecycle remains:
 *
 *     pending -> active -> completed
 *
 * Do not use this interface to change the internship lifecycle
 * unless a concrete review workflow is introduced by the
 * requirements.
 */
export interface ReviewInternshipRequest {
  /**
   * Reserved review outcome.
   *
   * Currently unused by the internship API.
   */
  status?: "approved" | "rejected";

  /**
   * Reserved remarks for a future review workflow.
   */
  reviewRemarks?: string | null;
}

export interface UpdateFacultyAdviserRequest {
  facultyAdviserId: string | null;
}
