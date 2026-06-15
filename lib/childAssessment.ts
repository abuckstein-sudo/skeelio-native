import { supabase } from "@/lib/supabase";
import { tierStats, Attempt } from "@/lib/tutor/ability";
import { LADDERS, Operation, gradeExpectedTierIndex } from "@/lib/tutorConfig";
import { ASSESSMENT, TIER_GATE } from "./masteryConfig";

// Canonical English area names — the only strings that should appear in the assessment
const CANONICAL_AREAS = [
  "Addition",
  "Subtraction",
  "Multiplication",
  "Division",
  "Word Problems",
  "French grammar",
  "Spelling",
  "Conjugation",
] as const;

export type CanonicalArea = typeof CANONICAL_AREAS[number];

export interface AssessmentArea {
  area: CanonicalArea;
  status: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up";
  evidence: string;
  active: boolean;
}

export interface ChildAssessment {
  areas: AssessmentArea[];
  generatedAt: string;
}

export async function buildChildAssessment(childId: string): Promise<ChildAssessment> {
  // Map to hold canonical areas: area name → AssessmentArea
  const areaMap: Record<CanonicalArea, AssessmentArea> = {};
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  try {
    // Fetch child details for tier calculation
    const { data: childData } = await supabase
      .from("children")
      .select("grade_level")
      .eq("id", childId)
      .single();

    const child = childData || {};

    // 1. Math Operations (Addition, Subtraction, Multiplication, Division)
    // These are AUTHORITATIVE for math and should never be overridden
    const mathOps: Operation[] = ["addition", "subtraction", "multiplication", "division"];
    const mathCanonical: Record<string, CanonicalArea> = {
      addition: "Addition",
      subtraction: "Subtraction",
      multiplication: "Multiplication",
      division: "Division",
    };

    for (const op of mathOps) {
      const { data: attemptData } = await supabase
        .from("learning_attempts")
        .select("tier, was_correct, ai_hint_used, created_at")
        .eq("child_id", childId)
        .eq("topic", op)
        .not("tier", "is", null);

      const attempts: Attempt[] = (attemptData || []).map((row: any) => ({
        tierId: row.tier,
        correct: row.was_correct,
        hintUsed: row.ai_hint_used || false,
      }));

      const unaidedAttempts = attempts.filter((a) => !a.hintUsed);
      const recentAttempts = (attemptData || []).filter(
        (a) => new Date(a.created_at) >= twoWeeksAgo
      );

      let status: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up" = "not_enough_data";
      let evidence = "No practice yet";
      let active = recentAttempts.length > 0;

      if (unaidedAttempts.length < ASSESSMENT.notEnoughDataBelowUnaided) {
        status = "not_enough_data";
        evidence = `${unaidedAttempts.length} attempts`;
      } else {
        const unaided_correct = unaidedAttempts.filter((a) => a.correct).length;
        const masteryRate = unaided_correct / unaidedAttempts.length;
        const ladder = LADDERS[op];
        const stats = tierStats(attempts);
        let highestSolidIdx = -1;
        for (let i = ladder.length - 1; i >= 0; i--) {
          const s = stats[ladder[i].id];
          if (s && s.unaided_attempts >= TIER_GATE.minUnaidedAttempts && s.masteryRate >= TIER_GATE.minUnaidedRate && s.coverageMet) {
            highestSolidIdx = i;
            break;
          }
        }
        const solidLabel = highestSolidIdx >= 0 ? ladder[highestSolidIdx].label : "les bases";
        const expectedIdx = gradeExpectedTierIndex(op, (child as any)?.grade_level);

        if (expectedIdx === -1) {
          status = masteryRate >= ASSESSMENT.onTrackUnaidedRate ? "on_track" : "needs_work";
          evidence = `${unaided_correct}/${unaidedAttempts.length} on ${solidLabel}`;
        } else if (highestSolidIdx >= expectedIdx) {
          status = "on_track";
          evidence = `Solid at ${solidLabel}`;
        } else if (masteryRate >= ASSESSMENT.onTrackUnaidedRate) {
          status = "ready_to_level_up";
          const nextLabel = highestSolidIdx + 1 < ladder.length ? ladder[highestSolidIdx + 1].label : solidLabel;
          evidence = `Solid at ${solidLabel}; ready for ${nextLabel}`;
        } else {
          status = "needs_work";
          evidence = `${unaided_correct}/${unaidedAttempts.length} on ${solidLabel}`;
        }
      }

      const canonicalArea = mathCanonical[op] as CanonicalArea;
      areaMap[canonicalArea] = {
        area: canonicalArea,
        status,
        evidence,
        active,
      };
    }

    // 2. Word Problems
    {
      const { data: attemptData } = await supabase
        .from("learning_attempts")
        .select("was_correct, ai_hint_used, created_at")
        .eq("child_id", childId)
        .eq("topic", "word_problems");

      const unaidedAttempts = (attemptData || []).filter((a) => !a.ai_hint_used);
      const recentAttempts = (attemptData || []).filter(
        (a) => new Date(a.created_at) >= twoWeeksAgo
      );

      let status: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up" = "not_enough_data";
      let evidence = "No practice yet";
      let active = recentAttempts.length > 0;

      if (unaidedAttempts.length < ASSESSMENT.notEnoughDataBelowUnaided) {
        status = "not_enough_data";
        evidence = `${unaidedAttempts.length} attempts`;
      } else {
        const correct = unaidedAttempts.filter((a) => a.was_correct).length;
        const masteryRate = correct / unaidedAttempts.length;

        status = masteryRate >= ASSESSMENT.onTrackUnaidedRate ? "on_track" : "needs_work";
        evidence = `${correct}/${unaidedAttempts.length} correct`;
      }

      areaMap["Word Problems"] = {
        area: "Word Problems",
        status,
        evidence,
        active,
      };
    }

    // 3. Spelling
    {
      const { data: attemptData } = await supabase
        .from("spelling_practice_attempts")
        .select("was_correct, created_at")
        .eq("child_id", childId);

      const unaidedAttempts = attemptData || [];
      const recentAttempts = (attemptData || []).filter(
        (a) => new Date(a.created_at) >= twoWeeksAgo
      );

      let status: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up" = "not_enough_data";
      let evidence = "No practice yet";
      let active = recentAttempts.length > 0;

      if (unaidedAttempts.length < ASSESSMENT.notEnoughDataBelowUnaided) {
        status = "not_enough_data";
        evidence = `${unaidedAttempts.length} attempts`;
      } else {
        const correct = unaidedAttempts.filter((a) => a.was_correct).length;
        const masteryRate = correct / unaidedAttempts.length;

        status = masteryRate >= ASSESSMENT.onTrackUnaidedRate ? "on_track" : "needs_work";
        evidence = `${correct}/${unaidedAttempts.length} correct`;
      }

      areaMap["Spelling"] = {
        area: "Spelling",
        status,
        evidence,
        active,
      };
    }

    // 4. Conjugation
    {
      const { data: attemptData } = await supabase
        .from("conjugation_practice_attempts")
        .select("was_correct, created_at")
        .eq("child_id", childId);

      const unaidedAttempts = attemptData || [];
      const recentAttempts = (attemptData || []).filter(
        (a) => new Date(a.created_at) >= twoWeeksAgo
      );

      let status: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up" = "not_enough_data";
      let evidence = "No practice yet";
      let active = recentAttempts.length > 0;

      if (unaidedAttempts.length < ASSESSMENT.notEnoughDataBelowUnaided) {
        status = "not_enough_data";
        evidence = `${unaidedAttempts.length} attempts`;
      } else {
        const correct = unaidedAttempts.filter((a) => a.was_correct).length;
        const masteryRate = correct / unaidedAttempts.length;

        status = masteryRate >= ASSESSMENT.onTrackUnaidedRate ? "on_track" : "needs_work";
        evidence = `${correct}/${unaidedAttempts.length} correct`;
      }

      areaMap["Conjugation"] = {
        area: "Conjugation",
        status,
        evidence,
        active,
      };
    }

    // 5. Grammar / Scanned Concepts (domain='language' tutor_episodes ONLY)
    // IMPORTANT: Skip domain='math' episodes — they're already covered by the math engine above
    {
      const { data: episodes } = await supabase
        .from("tutor_episodes")
        .select("concept, domain, mastered, created_at")
        .eq("child_id", childId)
        .eq("status", "complete")
        .eq("domain", "language"); // ONLY language domain, NOT math

      // Group by concept
      const conceptMap: Record<string, { mastered: boolean[]; created_at: string[] }> = {};
      for (const ep of episodes || []) {
        const label = (ep.concept as any)?.label || "Unknown";
        if (!conceptMap[label]) {
          conceptMap[label] = { mastered: [], created_at: [] };
        }
        conceptMap[label].mastered.push(ep.mastered);
        conceptMap[label].created_at.push(ep.created_at);
      }

      // For each concept, add it to "French grammar" evidence
      let fgStatus: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up" = "not_enough_data";
      let fgEvidence: string[] = [];
      let fgActive = false;

      for (const [label, data] of Object.entries(conceptMap)) {
        const mastered_count = data.mastered.filter((m) => m).length;
        const attempts = data.mastered.length;
        const recent = data.created_at.some((d) => new Date(d) >= twoWeeksAgo);

        if (recent) fgActive = true;

        if (attempts >= 2) {
          if (mastered_count > 0) {
            fgEvidence.push(`${label}: mastered`);
            if (fgStatus === "not_enough_data") fgStatus = "on_track";
          } else {
            fgEvidence.push(`${label}: needs work`);
            fgStatus = "needs_work";
          }
        } else {
          fgEvidence.push(`${label}: ${attempts} session`);
        }
      }

      if (fgEvidence.length > 0) {
        areaMap["French grammar"] = {
          area: "French grammar",
          status: fgStatus,
          evidence: fgEvidence.join(", "),
          active: fgActive,
        };
      }
    }

    return {
      areas: Object.values(areaMap),
      generatedAt: now.toISOString(),
    };
  } catch (err) {
    console.error("[childAssessment] error building assessment:", err);
    return {
      areas: [],
      generatedAt: now.toISOString(),
    };
  }
}
