import { supabase } from "@/lib/supabase";

export type ConjugationQuestion = {
  id: string;
  language: string;
  verb: string;
  verb_group: string;
  tense: string;
  pronoun: string;
  correct_answer: string;
  options: string[];
  grade_levels: string[];
  difficulty_level: number;
};

export type ConjugationSession = {
  id: string;
  student_id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  status: "in_progress" | "completed";
  total_items: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
};

export type ConjugationAttempt = {
  id: string;
  session_id: string;
  question_id: string;
  student_id: string;
  user_id: string;
  pronoun: string;
  verb: string;
  tense: string;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  attempt_number: number;
  created_at: string;
};

export async function fetchConjugationPool(
  childId: string,
  gradeLevel: string
): Promise<ConjugationQuestion[]> {
  try {
    console.log("[fetchConjugationPool] fetching for grade:", gradeLevel);

    // Try to fetch questions for the child's grade level
    let { data, error } = await supabase
      .from("conjugation_questions")
      .select("*")
      .eq("language", "fr-FR")
      .filter("grade_levels", "cs", `["${gradeLevel}"]`);

    if (error) {
      console.error("[fetchConjugationPool] error:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log("[fetchConjugationPool] no questions for grade", gradeLevel, "fetching all");
      // Fallback: fetch all French conjugation questions
      const { data: allData, error: allError } = await supabase
        .from("conjugation_questions")
        .select("*")
        .eq("language", "fr-FR");

      if (allError) throw allError;
      data = allData || [];
    }

    console.log("[fetchConjugationPool] fetched", data.length, "questions");
    return data as ConjugationQuestion[];
  } catch (err) {
    console.error("[fetchConjugationPool] failed:", err);
    throw err;
  }
}

export function pickRandomQuestions(pool: ConjugationQuestion[], count: number): ConjugationQuestion[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function shuffleOptions(options: string[], correctAnswer: string): string[] {
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function createConjugationSession(
  childId: string,
  userId: string,
  totalItems: number
): Promise<ConjugationSession> {
  const { data, error } = await supabase
    .from("conjugation_practice_sessions")
    .insert({
      student_id: childId,
      user_id: userId,
      started_at: new Date().toISOString(),
      status: "in_progress",
      total_items: totalItems,
      correct_count: 0,
      incorrect_count: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ConjugationSession;
}

export async function recordConjugationAttempt(
  sessionId: string,
  questionId: string,
  childId: string,
  userId: string,
  givenAnswer: string,
  correctAnswer: string,
  isCorrect: boolean
): Promise<void> {
  const { error } = await supabase.from("conjugation_practice_attempts").insert({
    session_id: sessionId,
    question_id: questionId,
    student_id: childId,
    user_id: userId,
    given_answer: givenAnswer,
    correct_answer: correctAnswer,
    is_correct: isCorrect,
  });

  if (error) throw error;
}

export async function endConjugationSession(
  sessionId: string,
  totalItems: number,
  correctCount: number,
  incorrectCount: number
): Promise<void> {
  const { error } = await supabase
    .from("conjugation_practice_sessions")
    .update({
      completed_at: new Date().toISOString(),
      status: "completed",
      total_items: totalItems,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
    })
    .eq("id", sessionId);

  if (error) {
    console.error("[endConjugationSession] error:", error);
    throw error;
  }
}
