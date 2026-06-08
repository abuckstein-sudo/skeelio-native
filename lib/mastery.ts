import { supabase } from "./supabase";

interface SkillMastery {
  topic: string;
  skill: string;
  total_attempts: number;
  correct_attempts: number;
  mastery_score: number;
  weakness_score: number;
  last_practiced: string;
}

export interface TopicMastery {
  score: number;
  totalQuestionAttempts: number;
  lastPracticed: string | null;
  weakest: string;
}

const KNOWN_SUBJECTS = [
  "multiplication",
  "division",
  "addition",
  "subtraction",
  "spelling",
  "reading",
  "conjugation",
  "word_problems",
];

export async function getSubjectMastery(
  childId: string
): Promise<Record<string, TopicMastery>> {
  try {
    const { data, error } = await supabase
      .from("skill_mastery")
      .select("*")
      .eq("child_id", childId);

    if (error) {
      console.log("[mastery] query error:", error.message);
      return {};
    }

    if (!data || data.length === 0) {
      console.log("[mastery] no data for child", childId);
      return {};
    }

    // Group by topic, filter to known subjects
    const byTopic: Record<string, SkillMastery[]> = {};
    for (const row of data) {
      if (KNOWN_SUBJECTS.includes(row.topic)) {
        if (!byTopic[row.topic]) {
          byTopic[row.topic] = [];
        }
        byTopic[row.topic].push(row);
      }
    }

    // Compute per-topic aggregates
    const result: Record<string, TopicMastery> = {};
    for (const topic of KNOWN_SUBJECTS) {
      if (!byTopic[topic]) continue;

      const rows = byTopic[topic];
      const totalAttempts = rows.reduce((sum, r) => sum + r.total_attempts, 0);
      const correctAttempts = rows.reduce((sum, r) => sum + r.correct_attempts, 0);
      const score =
        totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

      // Find weakest skill (lowest mastery_score)
      const weakest = rows.reduce((min, r) =>
        r.mastery_score < min.mastery_score ? r : min
      );

      // Find latest practiced
      const lastPracticed = rows
        .map((r) => r.last_practiced)
        .filter((d) => d)
        .sort()
        .pop() || null;

      result[topic] = {
        score,
        totalQuestionAttempts: totalAttempts,
        lastPracticed,
        weakest: weakest.skill,
      };

      console.log(
        `[mastery] ${topic} score=${score} attempts=${totalAttempts}`
      );
    }

    return result;
  } catch (err) {
    console.log("[mastery] exception:", err);
    return {};
  }
}
