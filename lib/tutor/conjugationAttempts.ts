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
  aided: boolean | null;
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
    }];
  });
}

export async function fetchConjugationAttemptsForChild(childId: string): Promise<ConjugationAttempt[]> {
  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase
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

  if (error) throw error;
  return mapConjugationAttemptRows((data ?? []) as ConjugationAttemptRow[]);
}
