import { supabase } from "@/lib/supabase";
import { tierStats, Attempt, isSolidTierStat } from "@/lib/tutor/ability";
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

function isConjugationConcept(concept: unknown): boolean {
  const text = JSON.stringify(concept ?? "").toLowerCase();
  return text.includes("conjug") || text.includes("verbe") || text.includes("verb");
}

export async function buildChildAssessment(childId: string): Promise<ChildAssessment> {
  // Map to hold canonical areas: area name → AssessmentArea
  const areaMap: Partial<Record<CanonicalArea, AssessmentArea>> = {};
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
        .select("tier, question_text, was_correct, ai_hint_used, evidence_source, created_at")
        .eq("child_id", childId)
        .eq("topic", op)
        .not("tier", "is", null);

      const attempts: Attempt[] = (attemptData || []).map((row: any) => ({
        tierId: row.tier,
        correct: row.was_correct,
        hintUsed: row.ai_hint_used || false,
        questionText: row.question_text,
        evidenceSource: row.evidence_source,
      }));

      const unaidedAttempts = attempts.filter((a) => !a.hintUsed);
      const masteryEvidence = unaidedAttempts.reduce((sum, a) => {
        const weight = TIER_GATE.evidenceWeights[
          String(a.evidenceSource || "unknown") as keyof typeof TIER_GATE.evidenceWeights
        ] ?? TIER_GATE.evidenceWeights.unknown;
        return sum + weight;
      }, 0);
      const masteryCorrectEvidence = unaidedAttempts.reduce((sum, a) => {
        const weight = TIER_GATE.evidenceWeights[
          String(a.evidenceSource || "unknown") as keyof typeof TIER_GATE.evidenceWeights
        ] ?? TIER_GATE.evidenceWeights.unknown;
        return sum + (a.correct ? weight : 0);
      }, 0);
      const recentAttempts = (attemptData || []).filter(
        (a) => new Date(a.created_at) >= twoWeeksAgo
      );

      let status: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up" = "not_enough_data";
      let evidence = "No practice yet";
      let active = recentAttempts.length > 0;

      if (masteryEvidence < ASSESSMENT.notEnoughDataBelowUnaided) {
        status = "not_enough_data";
        evidence = `${masteryEvidence.toFixed(1).replace(/\.0$/, "")} evidence points`;
      } else {
        const masteryRate = masteryCorrectEvidence / masteryEvidence;
        const ladder = LADDERS[op];
        const stats = tierStats(attempts);
        let highestSolidIdx = -1;
        for (let i = ladder.length - 1; i >= 0; i--) {
          const s = stats[ladder[i].id];
          if (isSolidTierStat(s)) {
            highestSolidIdx = i;
            break;
          }
        }
        const solidLabel = highestSolidIdx >= 0 ? ladder[highestSolidIdx].label : "les bases";
        const expectedIdx = gradeExpectedTierIndex(op, (child as any)?.grade_level);

        if (expectedIdx === -1) {
          status = masteryRate >= ASSESSMENT.onTrackUnaidedRate ? "on_track" : "needs_work";
          evidence = `${masteryCorrectEvidence.toFixed(1).replace(/\.0$/, "")}/${masteryEvidence.toFixed(1).replace(/\.0$/, "")} on ${solidLabel}`;
        } else if (highestSolidIdx >= expectedIdx) {
          status = "on_track";
          evidence = `Solid at ${solidLabel}`;
        } else if (masteryRate >= ASSESSMENT.onTrackUnaidedRate) {
          status = "ready_to_level_up";
          const nextLabel = highestSolidIdx + 1 < ladder.length ? ladder[highestSolidIdx + 1].label : solidLabel;
          evidence = `Solid at ${solidLabel}; ready for ${nextLabel}`;
        } else {
          status = "needs_work";
          evidence = `${masteryCorrectEvidence.toFixed(1).replace(/\.0$/, "")}/${masteryEvidence.toFixed(1).replace(/\.0$/, "")} on ${solidLabel}`;
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

      const { data: episodeData } = await supabase
        .from("tutor_episodes")
        .select("concept, mastered, first_try_correct, items_attempted, created_at")
        .eq("child_id", childId)
        .eq("status", "complete")
        .eq("domain", "language");

      const unaidedAttempts = attemptData || [];
      const recentAttempts = (attemptData || []).filter(
        (a) => new Date(a.created_at) >= twoWeeksAgo
      );
      const worksheetConjugation = (episodeData || []).filter((ep) =>
        isConjugationConcept(ep.concept)
      );
      const worksheetAttempted = worksheetConjugation.reduce(
        (sum, ep) => sum + (ep.items_attempted || 0),
        0
      );
      const worksheetCorrect = worksheetConjugation.reduce(
        (sum, ep) => sum + (ep.first_try_correct || 0),
        0
      );
      const worksheetRecent = worksheetConjugation.some(
        (ep) => new Date(ep.created_at) >= twoWeeksAgo
      );
      const worksheetMastered = worksheetConjugation.some((ep) => !!ep.mastered);

      let status: "on_track" | "needs_work" | "not_enough_data" | "ready_to_level_up" = "not_enough_data";
      let evidence = "No practice yet";
      let active = recentAttempts.length > 0 || worksheetRecent;

      if (worksheetAttempted > 0) {
        const totalAttempts = unaidedAttempts.length + worksheetAttempted;
        const totalCorrect =
          unaidedAttempts.filter((a) => a.was_correct).length + worksheetCorrect;
        const masteryRate = totalCorrect / totalAttempts;
        status =
          worksheetMastered || masteryRate >= ASSESSMENT.onTrackUnaidedRate
            ? "on_track"
            : "needs_work";
        evidence = `${totalCorrect}/${totalAttempts} first try`;
      } else if (unaidedAttempts.length < ASSESSMENT.notEnoughDataBelowUnaided) {
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
        if (isConjugationConcept(ep.concept)) continue;
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
