import { supabase } from "./supabase";

export interface WorksheetSkill {
  id: string;
  created_at: string;
  completed_at: string | null;
  concept: { label?: string; description?: string; sub_skills?: { label?: string; description?: string }[] } | null;
  domain: string | null;
  mastered: boolean | null;
  status: string | null;
  image_path: string | null;
  parent_id: string | null;
  child_id: string;
  source: string | null;
  language: string | null;
  grade_band: string | null;
  lesson: string | null;
  items_attempted: number | null;
  first_try_correct: number | null;
  unaided_streak_max: number | null;
}

export function worksheetSkillLabel(skill: Pick<WorksheetSkill, "concept" | "domain">): string {
  return skill.concept?.label || (skill.domain === "language" ? "Language practice" : "Math practice");
}

export function worksheetSkillProgressText(
  skill: Pick<WorksheetSkill, "status" | "mastered" | "items_attempted" | "first_try_correct" | "unaided_streak_max">
): string {
  if (skill.status !== "complete") return "Needs practice";

  const attempted = skill.items_attempted ?? 0;
  const correct = skill.first_try_correct ?? 0;
  const streak = skill.unaided_streak_max ?? 0;
  const result = skill.mastered ? "Mastered" : "Needs practice";

  if (attempted > 0) {
    return `${result} · ${correct}/${attempted} first try · best streak ${streak}`;
  }

  return result;
}

export async function listWorksheetSkillsForChild(childId: string): Promise<WorksheetSkill[]> {
  const { data, error } = await supabase
    .from("tutor_episodes")
    .select(
      "id, created_at, completed_at, concept, domain, mastered, status, image_path, parent_id, child_id, source, language, grade_band, lesson, items_attempted, first_try_correct, unaided_streak_max"
    )
    .eq("child_id", childId)
    .eq("source", "photo")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[worksheet-skills] list error:", error);
    return [];
  }

  return (data || []) as WorksheetSkill[];
}

export async function assignMoreLikeWorksheetSkill(skill: WorksheetSkill): Promise<void> {
  const { error } = await supabase.from("tutor_episodes").insert({
    parent_id: skill.parent_id,
    child_id: skill.child_id,
    source: skill.source || "photo",
    image_path: skill.image_path,
    domain: skill.domain,
    language: skill.language,
    grade_band: skill.grade_band,
    concept: skill.concept,
    lesson: skill.lesson,
    status: "pending",
  });

  if (error) {
    console.error("[worksheet-skills] assign more error:", error);
    throw error;
  }
}
