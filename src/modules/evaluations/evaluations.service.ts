import type { SupabaseClients } from "../../lib/supabase.ts";
import { AppError } from "../../errors/app-error.ts";

import { InternshipEligibilityService } from "../internships/internship-eligibility.service.ts";

import type {
  CreateEvaluationInput,
  EvaluationRecord,
  EvaluationResponses,
  EvaluationType,
  UpdateEvaluationInput,
} from "./evaluations.types.ts";

type EvaluationManagerRole = "hte_supervisor" | "faculty_adviser";

type EvaluationAccessRole =
  | "administrator"
  | "internship_coordinator"
  | "faculty_adviser"
  | "hte_supervisor"
  | "student";

interface InternshipAuthorizationRecord {
  id: string;
  student_id: string;
  hte_id: string;
  faculty_adviser_id: string | null;
  status: string;
  hte_profiles: {
    supervisor_id: string | null;
  } | null;
}

export class EvaluationService {
  private readonly eligibilityService: InternshipEligibilityService;

  constructor(private readonly clients: SupabaseClients) {
    this.eligibilityService = new InternshipEligibilityService(clients);
  }

  /**
   * Verifies that the authenticated evaluator is assigned
   * to the internship for the requested evaluation type.
   */
  private async verifyEvaluatorAssignment(
    internshipId: string,
    userId: string,
    evaluationType: EvaluationType,
  ): Promise<InternshipAuthorizationRecord> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(
        `
        id,
        student_id,
        hte_id,
        faculty_adviser_id,
        status,
        hte_profiles!inner (
          supervisor_id
        )
        `,
      )
      .eq("id", internshipId)
      .maybeSingle();

    if (error) {
      console.error("VERIFY EVALUATOR ASSIGNMENT FAILED:", error);

      throw new AppError(500, "Failed to verify internship assignment.");
    }

    if (!data) {
      throw new AppError(404, "Internship not found.");
    }

    const internship = data as unknown as InternshipAuthorizationRecord;

    if (evaluationType === "hte_supervisor") {
      if (
        !internship.hte_profiles ||
        internship.hte_profiles.supervisor_id !== userId
      ) {
        throw new AppError(
          403,
          "You can only manage HTE evaluations for internships assigned to your HTE.",
        );
      }

      return internship;
    }

    if (evaluationType === "faculty_adviser") {
      if (internship.faculty_adviser_id !== userId) {
        throw new AppError(
          403,
          "You can only manage faculty evaluations for internships assigned to you.",
        );
      }

      return internship;
    }

    throw new AppError(
      403,
      "You are not authorized to manage this evaluation type.",
    );
  }

  /**
   * Verifies that the evaluator role matches the evaluation type.
   */
  private verifyEvaluationTypeForRole(
    role: EvaluationManagerRole,
    evaluationType: EvaluationType,
  ): void {
    if (role === "hte_supervisor" && evaluationType !== "hte_supervisor") {
      throw new AppError(
        403,
        "HTE Supervisors can only manage HTE Supervisor evaluations.",
      );
    }

    if (role === "faculty_adviser" && evaluationType !== "faculty_adviser") {
      throw new AppError(
        403,
        "Faculty Advisers can only manage Faculty Adviser evaluations.",
      );
    }
  }

  /**
   * Checks the final internship eligibility rule.
   *
   * An evaluation is allowed only when:
   * 1. The internship end date has passed.
   * 2. Validated rendered hours are greater than or equal
   *    to the required hours.
   */
  private async requireFinalEligibility(internshipId: string): Promise<void> {
    const eligibility = await this.eligibilityService.checkFinalEligibility(internshipId);

    if (eligibility.eligible) {
      return;
    }

    switch (eligibility.reason) {
      case "internship_not_found":
        throw new AppError(404, "Internship not found.");

      case "internship_period_not_ended":
        throw new AppError(
          400,
          "The internship period has not ended yet.",
        );

      case "required_hours_not_set":
        throw new AppError(
          400,
          "Required internship hours have not been set.",
        );

      case "required_hours_not_met":
        throw new AppError(
          400,
          "The required validated rendered hours have not been met.",
        );

      default:
        throw new AppError(
          400,
          "The internship is not eligible for evaluation.",
        );
    }
  }

  /**
   * Retrieves the internship associated with an evaluation.
   */
  private async getInternshipForEvaluation(
    evaluation: EvaluationRecord,
  ): Promise<InternshipAuthorizationRecord> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("internships")
      .select(
        `
        id,
        student_id,
        hte_id,
        faculty_adviser_id,
        status,
        hte_profiles!inner (
          supervisor_id
        )
        `,
      )
      .eq("id", evaluation.internship_id)
      .maybeSingle();

    if (error) {
      console.error("GET INTERNSHIP FOR EVALUATION FAILED:", error);

      throw new AppError(500, "Failed to verify evaluation access.");
    }

    if (!data) {
      throw new AppError(404, "Internship not found.");
    }

    return data as unknown as InternshipAuthorizationRecord;
  }

  /**
   * Verifies that the authenticated user may access
   * the supplied evaluation.
   */
  private async verifyEvaluationAccess(
    evaluation: EvaluationRecord,
    userId: string,
    role: EvaluationAccessRole,
  ): Promise<InternshipAuthorizationRecord> {
    const internship = await this.getInternshipForEvaluation(evaluation);

    if (role === "administrator") {
      return internship;
    }

    if (role === "internship_coordinator") {
      return internship;
    }

    if (role === "student") {
      if (internship.student_id !== userId) {
        throw new AppError(
          403,
          "You can only access evaluations for your own internship.",
        );
      }

      if (evaluation.status !== "submitted") {
        throw new AppError(
          403,
          "Evaluation results are only available after submission.",
        );
      }

      return internship;
    }

    if (role === "hte_supervisor") {
      if (
        !internship.hte_profiles ||
        internship.hte_profiles.supervisor_id !== userId
      ) {
        throw new AppError(
          403,
          "You can only access evaluations for internships assigned to your HTE.",
        );
      }

      return internship;
    }

    if (role === "faculty_adviser") {
      if (internship.faculty_adviser_id !== userId) {
        throw new AppError(
          403,
          "You can only access evaluations for internships assigned to you.",
        );
      }

      return internship;
    }

    throw new AppError(
      403,
      "You are not authorized to access this evaluation.",
    );
  }

  /**
   * Retrieves an evaluation record by ID.
   */
  async getEvaluationById(
    evaluationId: string,
    userId: string,
    role: EvaluationAccessRole,
  ): Promise<EvaluationRecord> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("evaluations")
      .select("*")
      .eq("id", evaluationId)
      .maybeSingle();

    if (error) {
      console.error("GET EVALUATION FAILED:", error);

      throw new AppError(500, "Failed to retrieve evaluation.");
    }

    if (!data) {
      throw new AppError(404, "Evaluation not found.");
    }

    const evaluation = data as EvaluationRecord;

    await this.verifyEvaluationAccess(evaluation, userId, role);

    return evaluation;
  }

  /**
   * Creates an evaluation for an assigned internship.
   *
   * HTE Supervisors create "hte_supervisor" evaluations.
   * Faculty Advisers create "faculty_adviser" evaluations.
   *
   * Creation requires final internship eligibility.
   */
  async createEvaluation(
    userId: string,
    role: EvaluationManagerRole,
    input: CreateEvaluationInput,
  ): Promise<EvaluationRecord> {
    const evaluationType = input.evaluation_type ?? "hte_supervisor";

    this.verifyEvaluationTypeForRole(role, evaluationType);

    await this.verifyEvaluatorAssignment(
      input.internship_id,
      userId,
      evaluationType,
    );

    await this.requireFinalEligibility(input.internship_id);

    const { data: existingEvaluation, error: existingError } = await this.clients.supabaseAdmin
      .from("evaluations")
      .select("id, status")
      .eq("internship_id", input.internship_id)
      .eq("evaluator_id", userId)
      .eq("evaluation_type", evaluationType)
      .maybeSingle();

    if (existingError) {
      console.error("CHECK EXISTING EVALUATION FAILED:", existingError);

      throw new AppError(500, "Failed to check existing evaluation.");
    }

    if (existingEvaluation) {
      const evaluationLabel = evaluationType === "hte_supervisor"
        ? "HTE Supervisor"
        : "Faculty Adviser";

      throw new AppError(
        409,
        `A ${evaluationLabel} evaluation already exists for this internship.`,
      );
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("evaluations")
      .insert({
        internship_id: input.internship_id,
        evaluator_id: userId,
        evaluation_type: evaluationType,
        responses: input.responses ?? {},
        comments: input.comments ?? null,
        status: "draft",
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("CREATE EVALUATION FAILED:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });

      throw new AppError(500, "Failed to create evaluation.");
    }

    return data as EvaluationRecord;
  }

  /**
   * Retrieves all evaluations for an internship.
   *
   * Access is verified even when the internship has no
   * evaluation records yet.
   */
  async getEvaluationsByInternship(
    internshipId: string,
    userId: string,
    role: EvaluationAccessRole,
  ): Promise<EvaluationRecord[]> {
    const { data, error } = await this.clients.supabaseAdmin
      .from("evaluations")
      .select("*")
      .eq("internship_id", internshipId)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error("GET EVALUATIONS BY INTERNSHIP FAILED:", error);

      throw new AppError(500, "Failed to retrieve evaluations.");
    }

    const evaluations = (data ?? []) as EvaluationRecord[];

    /*
     * Verify internship-level access even when there are
     * zero evaluations. This prevents an unauthorized user
     * from receiving a successful empty response for an
     * internship they should not access.
     */
    if (evaluations.length === 0) {
      const placeholderEvaluation: EvaluationRecord = {
        id: "",
        internship_id: internshipId,
        evaluator_id: "",
        evaluation_type: "hte_supervisor",
        responses: {},
        comments: null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        created_at: "",
        updated_at: "",
      };

      await this.verifyEvaluationAccess(placeholderEvaluation, userId, role);

      return [];
    }

    for (const evaluation of evaluations) {
      await this.verifyEvaluationAccess(evaluation, userId, role);
    }

    return evaluations;
  }

  /**
   * Retrieves evaluations associated with the current evaluator.
   *
   * HTE Supervisors receive evaluations for their assigned HTE.
   * Faculty Advisers receive evaluations for internships assigned
   * to them as faculty adviser.
   */
  async getMyEvaluations(
    userId: string,
    role: EvaluationManagerRole,
  ): Promise<EvaluationRecord[]> {
    let query = this.clients.supabaseAdmin
      .from("evaluations")
      .select(
        `
        *,
        internships!inner (
          hte_profiles (
            supervisor_id
          ),
          faculty_adviser_id
        )
        `,
      )
      .order("created_at", {
        ascending: false,
      });

    if (role === "hte_supervisor") {
      query = query.eq("internships.hte_profiles.supervisor_id", userId);
    } else {
      query = query.eq("internships.faculty_adviser_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET MY EVALUATIONS FAILED:", error);

      throw new AppError(500, "Failed to retrieve evaluations.");
    }

    return (data ?? []).map(
      (
        evaluation: EvaluationRecord & {
          internships?: unknown;
        },
      ) => {
        const { internships: _internship, ...record } = evaluation;

        return record;
      },
    ) as EvaluationRecord[];
  }

  /**
   * Updates the current evaluator's own draft evaluation.
   */
  async updateEvaluation(
    evaluationId: string,
    userId: string,
    role: EvaluationManagerRole,
    input: UpdateEvaluationInput,
  ): Promise<EvaluationRecord> {
    const evaluation = await this.getEvaluationById(evaluationId, userId, role);

    this.verifyEvaluationTypeForRole(role, evaluation.evaluation_type);

    if (evaluation.evaluator_id !== userId) {
      throw new AppError(403, "You can only update your own evaluation.");
    }

    if (evaluation.status !== "draft") {
      throw new AppError(400, "Only draft evaluations can be updated.");
    }

    const updateData: {
      responses?: EvaluationResponses;
      comments?: string | null;
    } = {};

    if (input.responses !== undefined) {
      updateData.responses = input.responses;
    }

    if (input.comments !== undefined) {
      updateData.comments = input.comments;
    }

    const { data, error } = await this.clients.supabaseAdmin
      .from("evaluations")
      .update(updateData)
      .eq("id", evaluationId)
      .eq("evaluator_id", userId)
      .eq("status", "draft")
      .select("*")
      .single();

    if (error || !data) {
      console.error("UPDATE EVALUATION FAILED:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });

      throw new AppError(500, "Failed to update evaluation.");
    }

    return data as EvaluationRecord;
  }

  /**
   * Submits the current evaluator's draft evaluation.
   *
   * Final internship eligibility is checked again at submission
   * time so that a draft cannot bypass the business rule if
   * internship state changes between creation and submission.
   */
  async submitEvaluation(
    evaluationId: string,
    userId: string,
    role: EvaluationManagerRole,
  ): Promise<EvaluationRecord> {
    const evaluation = await this.getEvaluationById(evaluationId, userId, role);

    this.verifyEvaluationTypeForRole(role, evaluation.evaluation_type);

    if (evaluation.evaluator_id !== userId) {
      throw new AppError(403, "You can only submit your own evaluation.");
    }

    if (evaluation.status !== "draft") {
      throw new AppError(400, "Only draft evaluations can be submitted.");
    }

    if (
      !evaluation.responses ||
      Object.keys(evaluation.responses).length === 0
    ) {
      throw new AppError(
        400,
        "Evaluation responses are required before submission.",
      );
    }

    await this.requireFinalEligibility(evaluation.internship_id);

    const { data, error } = await this.clients.supabaseAdmin
      .from("evaluations")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", evaluationId)
      .eq("evaluator_id", userId)
      .eq("status", "draft")
      .select("*")
      .single();

    if (error || !data) {
      console.error("SUBMIT EVALUATION FAILED:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });

      throw new AppError(500, "Failed to submit evaluation.");
    }

    return data as EvaluationRecord;
  }
}
