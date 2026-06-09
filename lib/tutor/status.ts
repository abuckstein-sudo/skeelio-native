import { supabase } from "@/lib/supabase";
import { Operation, LADDERS, startingTier } from "@/lib/tutorConfig";
import { currentTierAndBand, tierStats, Attempt } from "./ability";

export interface OperationStatus {
  operation: Operation;
  hasAttempts: boolean;
  currentTier: string;
  currentTierLabel: string;
  band: "solid" | "developing" | "struggling" | "needs-teach";
  highestSolidTier: string | null;
  highestSolidTierLabel: string | null;
  statusText: string;
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
    const { tierId: currentTierId, band } = currentTierAndBand(
      attempts,
      operation,
      child || {}
    );

    // Find tier labels
    const ladder = LADDERS[operation];
    const currentTierObj = ladder.find((t) => t.id === currentTierId);
    const currentTierLabel = currentTierObj?.label || currentTierId;

    // Find highest solid tier
    let highestSolidTier: string | null = null;
    let highestSolidTierLabel: string | null = null;

    if (hasAttempts) {
      const stats = tierStats(attempts);
      // Find the highest tier index that is solid (8+ attempts, ≥85% accuracy)
      for (let i = ladder.length - 1; i >= 0; i--) {
        const tier = ladder[i];
        const tierStat = stats[tier.id];
        if (
          tierStat &&
          tierStat.attempts >= 8 &&
          tierStat.accuracy >= 0.85 &&
          tierStat.coverageMet
        ) {
          highestSolidTier = tier.id;
          highestSolidTierLabel = tier.label;
          break;
        }
      }
    }

    // Build status text
    let statusText: string;
    if (hasAttempts) {
      const solidText =
        highestSolidTier && highestSolidTierLabel
          ? `solid through ${highestSolidTierLabel}`
          : "—";
      statusText = `Working on ${currentTierLabel} (${band}) — ${solidText}`;
    } else {
      const startingTierLabel =
        ladder.find((t) => t.id === currentTierId)?.label || currentTierId;
      statusText = `Not practiced yet — starting around ${startingTierLabel}`;
    }

    return {
      operation,
      hasAttempts,
      currentTier: currentTierId,
      currentTierLabel,
      band,
      highestSolidTier,
      highestSolidTierLabel,
      statusText,
    };
  } catch (error) {
    console.error(`[status] error fetching ${operation}:`, error);
    // Return a safe default
    const ladder = LADDERS[operation];
    const startingId = startingTier(operation, child || {});
    const startingTierObj = ladder.find((t) => t.id === startingId);
    return {
      operation,
      hasAttempts: false,
      currentTier: startingId,
      currentTierLabel: startingTierObj?.label || startingId,
      band: "needs-teach",
      highestSolidTier: null,
      highestSolidTierLabel: null,
      statusText: `Not practiced yet — starting around ${startingTierObj?.label || startingId}`,
    };
  }
}
