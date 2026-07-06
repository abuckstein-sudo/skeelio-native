import { SpellingAttempt } from "./spellingAbility";
import { SpellingStrand, SpellingTierId } from "../spellingConfig";

type SpellingListItemJoin = {
  normalized_text?: string | null;
  item_text?: string | null;
};

type SpellingPracticeAttemptRow = {
  item_text: string | null;
  is_correct: boolean | null;
  created_at: string | null;
  aided?: boolean | null;
  spelling_list_items?: SpellingListItemJoin | SpellingListItemJoin[] | null;
};

type SpellingCurriculumWordRow = {
  word: string | null;
  strand: SpellingStrand | null;
  tier_id: SpellingTierId | null;
  excluded?: boolean | null;
};

function joinedItem(row: SpellingPracticeAttemptRow): SpellingListItemJoin | null {
  if (Array.isArray(row.spelling_list_items)) return row.spelling_list_items[0] ?? null;
  return row.spelling_list_items ?? null;
}

export function normalizeSpellingWord(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function mapSpellingAttemptRows(
  rows: SpellingPracticeAttemptRow[],
  curriculumRows: SpellingCurriculumWordRow[]
): SpellingAttempt[] {
  const curriculumByWord = new Map<string, { tierId: SpellingTierId; strand: SpellingStrand }>();
  for (const row of curriculumRows) {
    if (row.excluded) continue;
    if (!row.word || !row.tier_id || !row.strand) continue;
    curriculumByWord.set(normalizeSpellingWord(row.word), {
      tierId: row.tier_id,
      strand: row.strand,
    });
  }

  return rows.map((row) => {
    const item = joinedItem(row);
    const word = item?.normalized_text || item?.item_text || row.item_text || "";
    const normalizedWord = normalizeSpellingWord(word);
    const curriculum = curriculumByWord.get(normalizedWord);

    return {
      word: normalizedWord,
      tierId: curriculum?.tierId ?? null,
      strand: curriculum?.strand ?? null,
      is_correct: !!row.is_correct,
      aided: !!row.aided,
      createdAt: row.created_at ?? null,
    };
  });
}

export function tierableSpellingAttempts(attempts: SpellingAttempt[]): SpellingAttempt[] {
  return attempts.filter((attempt) => !!attempt.tierId && !!attempt.strand);
}

export async function fetchSpellingAttemptsForChild(childId: string): Promise<SpellingAttempt[]> {
  const { supabase } = await import("@/lib/supabase");
  const [{ data: attemptRows, error: attemptError }, { data: curriculumRows, error: curriculumError }] = await Promise.all([
    supabase
      .from("spelling_practice_attempts")
      .select(`
        item_text,
        is_correct,
        aided,
        created_at,
        spelling_list_items:item_id (
          normalized_text,
          item_text
        )
      `)
      .eq("student_id", childId)
      .order("created_at", { ascending: true }),
    supabase
      .from("spelling_curriculum_words")
      .select("word, strand, tier_id, excluded")
      .eq("language", "fr-FR")
      .eq("excluded", false),
  ]);

  if (attemptError) throw attemptError;
  if (curriculumError) throw curriculumError;

  return mapSpellingAttemptRows(
    (attemptRows ?? []) as SpellingPracticeAttemptRow[],
    (curriculumRows ?? []) as SpellingCurriculumWordRow[]
  );
}
