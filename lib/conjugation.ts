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

export type VerbConjugation = {
  pronoun: string;
  form: string;
};

export type TeachingPattern = {
  group: string;
  tense: string;
  endings: string[];
  example: {
    verb: string;
    conjugations: VerbConjugation[];
  };
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
  gradeLevel: string,
  tense?: string | string[],
  verbGroup?: string | string[],
  language: string = "fr-FR"
): Promise<ConjugationQuestion[]> {
  try {
    console.log("[fetchConjugationPool] fetching for grade:", gradeLevel, "tense:", tense, "group:", verbGroup, "language:", language);

    // Fetch conjugation questions for the specified language
    const { data, error } = await supabase
      .from("conjugation_questions")
      .select("*")
      .eq("language", language);

    if (error) {
      console.error("[fetchConjugationPool] error:", error);
      throw error;
    }

    // Normalize inputs to arrays
    const tenses = Array.isArray(tense) ? tense : tense ? [tense] : [];
    const verbGroups = Array.isArray(verbGroup) ? verbGroup : verbGroup ? [verbGroup] : [];

    // Filter in JS: check if grade_levels includes the child's grade, plus tense and verb_group if provided
    console.log('[conj] filter params - verbGroups:', verbGroups, 'tenses:', tenses, 'gradeLevel:', gradeLevel);

    let pool = (data ?? []).filter((q, idx) => {
      let gl: any = q.grade_levels;
      // Handle both parsed array and stringified versions
      if (typeof gl === "string") {
        try {
          gl = JSON.parse(gl);
        } catch {
          gl = [];
        }
      }
      const gradeMatch = Array.isArray(gl) && gl.includes(gradeLevel);
      const tenseMatch = tenses.length === 0 || tenses.includes(q.tense);
      const groupMatch = verbGroups.length === 0 || verbGroups.includes(q.verb_group);

      // Debug logging for first few items
      if (idx < 2) {
        console.log('[conj] sample filter check:', {
          q_verb_group: q.verb_group,
          q_tense: q.tense,
          q_grade_levels: gl,
          gradeMatch,
          tenseMatch,
          groupMatch,
          willInclude: gradeMatch && tenseMatch && groupMatch,
        });
      }

      return gradeMatch && tenseMatch && groupMatch;
    });

    // If no questions for this grade, use all fetched questions
    if (pool.length === 0) {
      console.log("[fetchConjugationPool] no questions for grade", gradeLevel, "using all questions");
      pool = (data ?? []);
    }

    // Shuffle the pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    console.log("[fetchConjugationPool] fetched", pool.length, "questions for grade", gradeLevel);
    return pool as ConjugationQuestion[];
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

export async function fetchTeachingExample(
  group: string,
  tense: string
): Promise<TeachingPattern | null> {
  try {
    // Fetch all questions for this group+tense to find unique verbs
    const { data, error } = await supabase
      .from("conjugation_questions")
      .select("*")
      .eq("language", "fr-FR")
      .eq("verb_group", group)
      .eq("tense", tense)
      .limit(10);

    if (error || !data || data.length === 0) return null;

    // Get unique verb
    const uniqueVerbs = [...new Set(data.map((q) => q.verb))];
    if (uniqueVerbs.length === 0) return null;

    const exampleVerb = uniqueVerbs[0];

    // Get all conjugations for this verb
    const conjugations = data
      .filter((q) => q.verb === exampleVerb)
      .map((q) => ({
        pronoun: q.pronoun,
        form: q.correct_answer,
      }))
      .sort((a, b) => {
        const order = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];
        return order.indexOf(a.pronoun) - order.indexOf(b.pronoun);
      });

    // Get pattern endings
    const endings = getPatternEndings(group, tense);

    return {
      group,
      tense,
      endings,
      example: {
        verb: exampleVerb,
        conjugations,
      },
    };
  } catch (err) {
    console.error("[fetchTeachingExample] failed:", err);
    return null;
  }
}

export function getLabelForVerbGroup(group: string): string {
  const groupMap: Record<string, string> = {
    groupe_1: "-er (groupe 1)",
    groupe_2: "-ir (groupe 2)",
    groupe_3: "-re (groupe 3)",
    irregulier: "Irréguliers",
  };

  return groupMap[group] || (group.charAt(0).toUpperCase() + group.slice(1));
}

export function getLabelForTense(tense: string): string {
  // Display the raw value with first letter capitalized
  return tense.charAt(0).toUpperCase() + tense.slice(1);
}

function getPatternEndings(group: string, tense: string): string[] {
  const patterns: Record<string, Record<string, string[]>> = {
    groupe_1: {
      "présent": ["e", "es", "e", "ons", "ez", "ent"],
      "imparfait": ["ais", "ais", "ait", "ions", "iez", "aient"],
      "futur simple": ["ai", "as", "a", "ons", "ez", "ont"],
      "passé composé": ["ai", "as", "a", "avons", "avez", "ont"],
    },
    groupe_2: {
      "présent": ["is", "is", "it", "issons", "issez", "issent"],
      "imparfait": ["issais", "issais", "issait", "issions", "issiez", "issaient"],
      "futur simple": ["ai", "as", "a", "ons", "ez", "ont"],
      "passé composé": ["ai", "as", "a", "avons", "avez", "ont"],
    },
    groupe_3: {
      "présent": ["s", "s", "–", "ons", "ez", "ent"],
      "imparfait": ["ais", "ais", "ait", "ions", "iez", "aient"],
      "futur simple": ["ai", "as", "a", "ons", "ez", "ont"],
      "passé composé": ["u", "u", "u", "ons", "ez", "ont"],
    },
  };

  return patterns[group]?.[tense] ?? [];
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
