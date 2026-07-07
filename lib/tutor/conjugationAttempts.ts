import { ConjugationAttempt } from "./conjugationAbility";

type ConjugationQuestionJoin = {
  id?: string | null;
  language: string | null;
  verb: string | null;
  verb_group: string | null;
  tense: string | null;
  pronoun: string | null;
};

type ConjugationAttemptRow = {
  id?: string | null;
  is_correct: boolean | null;
  aided?: boolean | null;
  created_at?: string | null;
  question_id?: string | null;
  conjugation_questions?: ConjugationQuestionJoin | ConjugationQuestionJoin[] | null;
};

function joinedQuestion(row: ConjugationAttemptRow): ConjugationQuestionJoin | null {
  if (Array.isArray(row.conjugation_questions)) return row.conjugation_questions[0] ?? null;
  return row.conjugation_questions ?? null;
}

export function mapConjugationAttemptRows(rows: ConjugationAttemptRow[]): ConjugationAttempt[] {
  return rows.flatMap((row) => {
    const question = joinedQuestion(row);
    if (!question?.verb || !question.tense || !question.verb_group || !question.pronoun) return [];

    return [{
      verb: question.verb,
      tense: question.tense,
      verb_group: question.verb_group,
      pronoun: question.pronoun,
      language: question.language ?? "fr-FR",
      is_correct: !!row.is_correct,
      aided: !!row.aided,
      created_at: row.created_at ?? null,
    }];
  });
}

function mapConjugationAttemptRowsWithQuestions(
  rows: ConjugationAttemptRow[],
  questionsById: Map<string, ConjugationQuestionJoin>
): ConjugationAttempt[] {
  return rows.flatMap((row) => {
    const question = row.question_id ? questionsById.get(row.question_id) : null;
    if (!question?.verb || !question.tense || !question.verb_group || !question.pronoun) return [];

    return [{
      verb: question.verb,
      tense: question.tense,
      verb_group: question.verb_group,
      pronoun: question.pronoun,
      language: question.language ?? "fr-FR",
      is_correct: !!row.is_correct,
      aided: !!row.aided,
      created_at: row.created_at ?? null,
    }];
  });
}

async function fetchAttemptRows(childId: string, includeAided: boolean): Promise<ConjugationAttemptRow[]> {
  const { supabase } = await import("@/lib/supabase");
  const columns = includeAided
    ? "id, is_correct, aided, created_at, question_id"
    : "id, is_correct, created_at, question_id";

  const { data, error } = await supabase
    .from("conjugation_practice_attempts")
    .select(columns)
    .eq("student_id", childId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown) as ConjugationAttemptRow[];
}

export async function fetchConjugationAttemptsForChild(childId: string): Promise<ConjugationAttempt[]> {
  const { supabase } = await import("@/lib/supabase");
  let rows: ConjugationAttemptRow[];

  try {
    rows = await fetchAttemptRows(childId, true);
  } catch (err) {
    const message = err && typeof err === "object" && "message" in err ? String((err as { message?: unknown }).message) : "";
    if (!message.toLowerCase().includes("aided")) throw err;

    console.warn("[fetchConjugationAttemptsForChild] aided column unavailable; reading attempts without aided");
    rows = await fetchAttemptRows(childId, false);
  }

  const questionIds = Array.from(new Set(rows.map((row) => row.question_id).filter(Boolean))) as string[];
  if (questionIds.length === 0) return [];

  const { data: questions, error: questionsError } = await supabase
    .from("conjugation_questions")
    .select("id, language, verb, verb_group, tense, pronoun")
    .in("id", questionIds);

  if (questionsError) throw questionsError;

  const questionsById = new Map(
    ((questions ?? []) as ConjugationQuestionJoin[])
      .filter((question) => question.id)
      .map((question) => [question.id as string, question])
  );

  return mapConjugationAttemptRowsWithQuestions(rows, questionsById);
}
