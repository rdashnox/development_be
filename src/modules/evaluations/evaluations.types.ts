export const EVALUATION_TYPES = ["hte_supervisor", "faculty_adviser"] as const;

export type EvaluationType = (typeof EVALUATION_TYPES)[number];

export type EvaluationStatus = "draft" | "submitted";

export interface EvaluationResponses {
  [criterion: string]: number;
}

export interface EvaluationRecord {
  id: string;
  internship_id: string;
  evaluator_id: string;
  evaluation_type: EvaluationType;
  responses: EvaluationResponses;
  comments: string | null;
  status: EvaluationStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEvaluationInput {
  internship_id: string;
  evaluation_type?: EvaluationType;
  responses?: EvaluationResponses;
  comments?: string | null;
}

export interface UpdateEvaluationInput {
  responses?: EvaluationResponses;
  comments?: string | null;
}

export interface EvaluationSummary {
  id: string;
  internship_id: string;
  evaluator_id: string;
  evaluation_type: EvaluationType;
  status: EvaluationStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}
