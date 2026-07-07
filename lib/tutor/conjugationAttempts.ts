import { ConjugationAttempt } from "./conjugationAbility";

type ConjugationQuestionJoin = {
  language: string | null;
  verb: string | null;
  verb_group: string | null;
  tense: string | null;
  pronoun: string | null;
};

type ConjugationAttemptRow = {
  is_correct: boolean | null;
  aided?: boolean | null;
  created_at?: string | null;
  conjugation_questions: ConjugationQuestionJoin | ConjugationQuestionJoin[] | null;
};

function joinedQuestion(row: ConjugationAttemptRow): ConjugationQuestionJoin | null {
  if (Array.isArray(row.conjugation_questions)) return row.conjugation_questions[0] ?? null;
  return row.conjugation_questions;
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

export async function fetchConjugationAttemptsForChild(childId: string): Promise<ConjugationAttempt[]> {
  const { supabase } = await import("@/lib/supabase");
  const withAided = await supabase
    .from("conjugation_practice_attempts")
    .select(`
      is_correct,
      aided,
      created_at,
      conjugation_questions:question_id (
        language,
        verb,
        verb_group,
        tense,
        pronoun
      )
    `)
    .eq("student_id", childId)
    .order("created_at", { ascending: true });

  if (!withAided.error) return mapConjugationAttemptRows((withAided.data ?? []) as ConjugationAttemptRow[]);

  const message = withAided.error.message || "";
  if (!message.toLowerCase().includes("aided")) throw withAided.error;

  console.warn("[fetchConjugationAttemptsForChild] aided column unavailable; reading attempts without aided");
  const fallback = await supabase
    .from("conjugation_practice_attempts")
    .select(`
      is_correct,
      created_at,
      conjugation_questions:question_id (
        language,
        verb,
        verb_group,
        tense,
        pronoun
      )
    `)
    .eq("student_id", childId)
    .order("created_at", { ascending: true });

  if (fallback.error) throw fallback.error;
  return mapConjugationAttemptRows((fallback.data ?? []) as ConjugationAttemptRow[]);
}
