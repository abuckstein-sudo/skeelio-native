import { supabase } from "@/lib/supabase";
import { Operation, LADDERS, GATE, startingTier } from "@/lib/tutorConfig";
import { currentTierAndBand, tierStats, Attempt } from "./ability";

export interface OperationStatus {
  operation: Operation;
  hasAttempts: boolean;
  workingTierId: string;
  workingTierLabel: string;
  band: "solid" | "developing" | "struggling" | "needs-teach";
  highestSolidTierId: string | null;
  highestSolidTierLabel: string | null;
  parentDashboardText: string;
  childHomeText: string;
}

export async function getOperationStatus(
  childId: string,
  operation: Operation,
  child: any
): Promise<OperationStatus> {
  try {
    // Fetch attempt log for this operation, filtering out null tiers
    const { data: attemptData } = await supabase
      .from("learning_attempts")
      .select("tier, was_correct")
      .eq("child_id", childId)
      .eq("topic", operation)
      .not("tier", "is", null);

    const attempts: Attempt[] = (attemptData || []).map((row: any) => ({
      tierId: row.tier,
      correct: row.was_correct,
    }));

    const hasAttempts = attempts.length > 0;

    // Get ability assessment
    const { tierId: workingTierId, band } = currentTierAndBand(
      attempts,
      operation,
      child || {}
    );

    // Find tier labels
    const ladder = LADDERS[operation];
    const workingTierObj = ladder.find((t) => t.id === workingTierId);
    const workingTierLabel = workingTierObj?.label || workingTierId;

    // Find highest solid tier
    let highestSolidTierId: string | null = null;
    let highestSolidTierLabel: string | null = null;

    if (hasAttempts) {
      const stats = tierStats(attempts);
      // Find the highest tier index that is solid (8+ attempts, ≥85% accuracy)
      for (let i = ladder.length - 1; i >= 0; i--) {
        const tier = ladder[i];
        const tierStat = stats[tier.id];
        if (
          tierStat &&
          tierStat.attempts >= GATE.minAttemptsToAdvance &&
          tierStat.accuracy >= GATE.accuracyToAdvance &&
          tierStat.coverageMet
        ) {
          highestSolidTierId = tier.id;
          highestSolidTierLabel = tier.label;
          break;
        }
      }
    }

    // Build parent dashboard text (fuller info)
    let parentDashboardText: string;
    if (hasAttempts) {
      const solidText =
        highestSolidTierId && highestSolidTierLabel
          ? `solid through ${highestSolidTierLabel}`
          : "—";
      parentDashboardText = `Working on ${workingTierLabel} (${band}) — ${solidText}`;
    } else {
      parentDashboardText = `Not practiced yet — starting around ${workingTierLabel}`;
    }

    // Build child home text (kid-friendly, simpler)
    const childHomeText = `Up next: ${workingTierLabel}`;

    return {
      operation,
      hasAttempts,
      workingTierId,
      workingTierLabel,
      band,
      highestSolidTierId,
      highestSolidTierLabel,
      parentDashboardText,
      childHomeText,
    };
  } catch (error) {
    console.error(`[status] error fetching ${operation}:`, error);
    // Return a safe default
    const ladder = LADDERS[operation];
    const startingId = startingTier(operation, child || {});
    const startingTierObj = ladder.find((t) => t.id === startingId);
    const label = startingTierObj?.label || startingId;
    return {
      operation,
      hasAttempts: false,
      workingTierId: startingId,
      workingTierLabel: label,
      band: "needs-teach",
      highestSolidTierId: null,
      highestSolidTierLabel: null,
      parentDashboardText: `Not practiced yet — starting around ${label}`,
      childHomeText: `Up next: ${label}`,
    };
  }
}
