import { SpellingStrand, SpellingTierId } from "../spellingConfig";

export type SpellingCurriculumWord = {
  id: string;
  word: string;
  nature: string;
  frequency: number;
  strand: SpellingStrand;
  tier_id: SpellingTierId;
  language: string;
  echelon: number;
  sentence?: string | null;
  audio_url?: string | null;
};

export async function fetchSpellingCurriculumPool(params: {
  tierIds: SpellingTierId[];
  language?: string;
  limit?: number;
}): Promise<SpellingCurriculumWord[]> {
  const { supabase } = await import("@/lib/supabase");
  const language = params.language ?? "fr-FR";

  let query = supabase
    .from("spelling_curriculum_words")
    .select("id, word, nature, frequency, strand, tier_id, language, echelon, sentence, audio_url")
    .eq("language", language)
    .eq("excluded", false)
    .in("tier_id", params.tierIds)
    .order("frequency", { ascending: true });

  if (params.limit && params.limit > 0) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SpellingCurriculumWord[];
}
