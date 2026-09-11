export type InternshipReportStatus = "pending" | "active" | "completed";

export interface InternshipReportRow {
  internshipId: string;

  student: {
    id: string;
    studentNumber: string;
    program: string;
    yearLevel: number;
    section: string | null;
    name: string | null;
  };

  hte: {
    id: string;
    companyName: string;
  } | null;

  facultyAdviserId: string | null;

  status: InternshipReportStatus;

  requiredHours: number | null;
  renderedHours: number;
  remainingHours: number | null;

  evaluationStatus: "draft" | "submitted" | null;
}

export interface InternshipReportSummary {
  totalInternships: number;
  pending: number;
  active: number;
  completed: number;

  totalRequiredHours: number;
  totalRenderedHours: number;
  totalRemainingHours: number;
}
