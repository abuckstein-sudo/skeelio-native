import { LADDERS, Operation, GATE, startingTier } from "../tutorConfig";

export interface Attempt {
  tierId: string;
  correct: boolean;
  hintUsed?: boolean; // true if child opened ANY hint before answering
}

export interface TierStats {
  attempts: number; // total attempts (for display)
  correct: number;
  unaided_attempts: number; // attempts without hints (gate denominator)
  unaided_correct: number; // correct AND NOT hinted
  masteryRate: number; // unaided_correct / unaided_attempts (true unaided mastery)
  coverageMet: boolean;
}

export function tierStats(attempts: Attempt[]): Record<string, TierStats> {
  const stats: Record<string, TierStats> = {};

  for (const tierId of new Set(attempts.map((a) => a.tierId))) {
    const tierAttempts = attempts.filter((a) => a.tierId === tierId);
    const correct = tierAttempts.filter((a) => a.correct).length;

    // Filter to UNAIDED attempts only for mastery measurement
    const unaidedAttempts = tierAttempts.filter((a) => !a.hintUsed);
    const unaided_attempts = unaidedAttempts.length;
    const unaided_correct = unaidedAttempts.filter((a) => a.correct).length;
    const total = tierAttempts.length;

    stats[tierId] = {
      attempts: total,
      correct,
      unaided_attempts,
      unaided_correct,
      masteryRate: unaided_attempts > 0 ? unaided_correct / unaided_attempts : 0,
      coverageMet: true, // simplified for now; fact-tiers would need divisor/factor tracking
    };
  }

  return stats;
}

export interface TierAndBand {
  tierId: string;
  band: "solid" | "developing" | "struggling" | "needs-teach";
  advanceReady: boolean;
}

export function currentTierAndBand(
  attempts: Attempt[],
  operation: Operation,
  child: any
): TierAndBand {
  const stats = tierStats(attempts);
  const ladder = LADDERS[operation];
  const { minAttemptsToAdvance, accuracyToAdvance, strugglingFloor } = GATE;

  // Find the highest tier the child is SOLID at:
  // 8+ UNAIDED attempts AND 85%+ UNAIDED mastery (correct without hints) AND coverage met
  let highestSolidTierIndex = -1;
  for (let i = ladder.length - 1; i >= 0; i--) {
    const tier = ladder[i];
    const tierStat = stats[tier.id];
    if (
      tierStat &&
      tierStat.unaided_attempts >= minAttemptsToAdvance &&
      tierStat.masteryRate >= accuracyToAdvance &&
      tierStat.coverageMet
    ) {
      highestSolidTierIndex = i;
      break;
    }
  }

  // If no attempts at all, working tier is the starting tier
  if (attempts.length === 0) {
    const startTier = startingTier(operation, child);
    return {
      tierId: startTier,
      band: "needs-teach",
      advanceReady: false,
    };
  }

  // If no solid tier, find the highest tier with attempts
  if (highestSolidTierIndex === -1) {
    // Find highest tier with attempts
    const attemptedTiers = Object.keys(stats).sort(
      (a, b) => ladder.findIndex((t) => t.id === a) - ladder.findIndex((t) => t.id === b)
    );
    const workingTierId = attemptedTiers[attemptedTiers.length - 1];
    const workingStats = stats[workingTierId];

    let band: "solid" | "developing" | "struggling" = "developing";
    if (workingStats.masteryRate < strugglingFloor && workingStats.attempts >= 3) {
      band = "struggling";
    }

    return {
      tierId: workingTierId,
      band,
      advanceReady: false,
    };
  }

  // Working tier is the next tier after the highest solid tier
  const workingTierIndex = highestSolidTierIndex + 1;

  // If at the end of the ladder, they're done (shouldn't happen often)
  if (workingTierIndex >= ladder.length) {
    const lastTierId = ladder[highestSolidTierIndex].id;
    return {
      tierId: lastTierId,
      band: "solid",
      advanceReady: true,
    };
  }

  const workingTierId = ladder[workingTierIndex].id;
  const workingStats = stats[workingTierId];

  let band: "solid" | "developing" | "struggling" | "needs-teach" = "needs-teach";
  let advanceReady = false;

  if (workingStats) {
    // Has attempts at the working tier
    // Advance requires 8+ UNAIDED attempts AND 85%+ UNAIDED mastery AND coverage
    if (
      workingStats.unaided_attempts >= minAttemptsToAdvance &&
      workingStats.masteryRate >= accuracyToAdvance &&
      workingStats.coverageMet
    ) {
      band = "solid";
      advanceReady = true;
    } else if (workingStats.masteryRate < strugglingFloor && workingStats.attempts >= 3) {
      band = "struggling";
    } else {
      band = "developing";
    }
  }

  return {
    tierId: workingTierId,
    band,
    advanceReady,
  };
}
