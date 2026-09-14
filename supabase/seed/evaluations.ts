import { createSeedAdminClient, normalizeEmail, seedError } from "./_shared/seed-utils.ts";

const supabaseAdmin = createSeedAdminClient();

type EvaluationType = "hte_supervisor" | "faculty_adviser";
type EvaluationStatus = "draft" | "submitted";

type SeedEvaluation = {
  seedKey: string;
  studentEmail: string;
  evaluationType: EvaluationType;
  status: EvaluationStatus;
  responses: Record<string, number>;
  comments: string | null;
};

type InternshipRow = {
  id: string;
  student_id: string;
  status: "pending" | "active" | "completed";
  required_hours: number | null;
  hte_profiles: { supervisor_id: string | null } | null;
  faculty_adviser_id: string | null;
};

const EVALUATION_STUDENTS = [
  "studentsbims1@grr.la",
  "studentsbims3@grr.la",
  "studentsbims4@grr.la",
] as const;

const seedEvaluations: readonly SeedEvaluation[] = [
  {
    seedKey: "evaluation-01",
    studentEmail: "studentsbims1@grr.la",
    evaluationType: "hte_supervisor",
    status: "submitted",
    responses: { criterion_1: 5, criterion_2: 4, criterion_3: 5 },
    comments: "Strong technical performance and professional conduct.",
  },
  {
    seedKey: "evaluation-02",
    studentEmail: "studentsbims1@grr.la",
    evaluationType: "faculty_adviser",
    status: "submitted",
    responses: { criterion_1: 5, criterion_2: 5, criterion_3: 4 },
    comments: "Successfully completed the internship requirements.",
  },
  {
    seedKey: "evaluation-03",
    studentEmail: "studentsbims3@grr.la",
    evaluationType: "hte_supervisor",
    status: "submitted",
    responses: { criterion_1: 4, criterion_2: 5, criterion_3: 4 },
    comments: "Consistent performance with good workplace communication.",
  },
  {
    seedKey: "evaluation-04",
    studentEmail: "studentsbims3@grr.la",
    evaluationType: "faculty_adviser",
    status: "draft",
    responses: { criterion_1: 5, criterion_2: 4 },
    comments: "Draft faculty evaluation for demonstration.",
  },
  {
    seedKey: "evaluation-05",
    studentEmail: "studentsbims4@grr.la",
    evaluationType: "hte_supervisor",
    status: "draft",
    responses: { criterion_1: 4, criterion_2: 4 },
    comments: "Draft HTE supervisor evaluation for demonstration.",
  },
  {
    seedKey: "evaluation-06",
    studentEmail: "studentsbims4@grr.la",
    evaluationType: "faculty_adviser",
    status: "submitted",
    responses: { criterion_1: 5, criterion_2: 4, criterion_3: 5 },
    comments: "Completed internship with satisfactory overall performance.",
  },
];

function validateSeedEvaluations(): void {
  const seenKeys = new Set<string>();
  const seenCombinations = new Set<string>();

  for (const seed of seedEvaluations) {
    if (seenKeys.has(seed.seedKey)) {
      throw new Error(`Duplicate evaluation seed key: ${seed.seedKey}`);
    }

    const combination = `${normalizeEmail(seed.studentEmail)}:${seed.evaluationType}`;
    if (seenCombinations.has(combination)) {
      throw new Error(`Duplicate evaluation type for student: ${combination}`);
    }

    if (Object.keys(seed.responses).length === 0) {
      throw new Error(
        `Evaluation ${seed.seedKey} must contain at least one response.`,
      );
    }

    for (const [criterion, score] of Object.entries(seed.responses)) {
      if (
        !criterion.trim() ||
        !Number.isInteger(score) ||
        score < 1 ||
        score > 5
      ) {
        throw new Error(
          `Invalid response in ${seed.seedKey}: ${criterion}=${score}`,
        );
      }
    }

    if (seed.status === "submitted" && !seed.comments) {
      throw new Error(
        `Submitted evaluation ${seed.seedKey} requires comments.`,
      );
    }

    seenKeys.add(seed.seedKey);
    seenCombinations.add(combination);
  }
}

async function resolveEvaluationInternships(): Promise<
  Map<string, InternshipRow>
> {
  const { data: studentRows, error: studentError } = await supabaseAdmin
    .from("student_profiles")
    .select("id, profiles!inner(email)")
    .in("profiles.email", EVALUATION_STUDENTS);

  if (studentError) {
    throw seedError("evaluations.resolve-students", studentError);
  }

  const students = new Map<string, string>();
  for (const row of studentRows ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (profile?.email) students.set(normalizeEmail(profile.email), row.id);
  }

  for (const email of EVALUATION_STUDENTS) {
    if (!students.has(email)) {
      throw new Error(`Student profile not found: ${email}`);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("internships")
    .select(
      `
      id,
      student_id,
      status,
      required_hours,
      faculty_adviser_id,
      hte_profiles!inner(supervisor_id)
    `,
    )
    .in("student_id", [...students.values()]);

  if (error) throw seedError("evaluations.resolve-internships", error);

  const result = new Map<string, InternshipRow>();
  for (const email of EVALUATION_STUDENTS) {
    const studentId = students.get(email)!;
    const internship = (data ?? []).find(
      (row) => row.student_id === studentId,
    ) as InternshipRow | undefined;

    if (!internship) {
      throw new Error(`Internship not found for evaluation student: ${email}`);
    }
    if (internship.status !== "completed") {
      throw new Error(
        `Evaluation student ${email} must have a completed internship.`,
      );
    }
    if (internship.required_hours !== 150) {
      throw new Error(
        `Evaluation student ${email} must have required_hours=150; received ${internship.required_hours}.`,
      );
    }
    if (!internship.hte_profiles?.supervisor_id) {
      throw new Error(
        `No HTE supervisor is assigned for evaluation student: ${email}`,
      );
    }
    if (!internship.faculty_adviser_id) {
      throw new Error(
        `No faculty adviser is assigned for evaluation student: ${email}`,
      );
    }

    result.set(email, internship);
  }

  return result;
}

function buildRows(
  internships: Map<string, InternshipRow>,
): Record<string, unknown>[] {
  const now = new Date().toISOString();

  return seedEvaluations.map((seed) => {
    const internship = internships.get(normalizeEmail(seed.studentEmail));
    if (!internship) {
      throw new Error(`Missing internship for ${seed.studentEmail}`);
    }

    const evaluatorId = seed.evaluationType === "hte_supervisor"
      ? internship.hte_profiles!.supervisor_id
      : internship.faculty_adviser_id;

    if (!evaluatorId) {
      throw new Error(
        `Missing evaluator assignment for ${seed.seedKey} (${seed.evaluationType}).`,
      );
    }

    return {
      internship_id: internship.id,
      evaluator_id: evaluatorId,
      evaluation_type: seed.evaluationType,
      responses: seed.responses,
      comments: seed.comments,
      status: seed.status,
      submitted_at: seed.status === "submitted" ? now : null,
    };
  });
}

async function seed(): Promise<void> {
  validateSeedEvaluations();

  const internships = await resolveEvaluationInternships();
  const rows = buildRows(internships);

  const { error } = await supabaseAdmin.from("evaluations").upsert(rows, {
    onConflict: "internship_id,evaluator_id,evaluation_type",
  });

  if (error) throw seedError("evaluations.bulk-upsert", error);

  console.log("========================================");
  console.log("SBIMS Development Evaluation Seed");
  console.log("========================================");
  console.log(`Evaluation-ready interns: ${EVALUATION_STUDENTS.length}`);
  console.log(`Evaluation records upserted: ${rows.length}`);
  console.log("Submitted evaluations: 4");
  console.log("Draft evaluations:     2");
  console.log("Evaluation seeding completed successfully.");
}

if (import.meta.main) {
  await seed();
}
