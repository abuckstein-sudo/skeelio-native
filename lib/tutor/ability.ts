import { LADDERS, Operation, GATE, startingTier } from "../tutorConfig";

export interface Attempt {
  tierId: string;
  correct: boolean;
}

export interface TierStats {
  attempts: number;
  correct: number;
  accuracy: number;
  coverageMet: boolean;
}

export function tierStats(attempts: Attempt[]): Record<string, TierStats> {
  const stats: Record<string, TierStats> = {};

  for (const tierId of new Set(attempts.map((a) => a.tierId))) {
    const tierAttempts = attempts.filter((a) => a.tierId === tierId);
    const correct = tierAttempts.filter((a) => a.correct).length;
    const total = tierAttempts.length;
    stats[tierId] = {
      attempts: total,
      correct,
      accuracy: total > 0 ? correct / total : 0,
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

  // If no attempts, start at the designated tier.
  if (attempts.length === 0) {
    const startTier = startingTier(operation, child);
    return {
      tierId: startTier,
      band: "needs-teach",
      advanceReady: false,
    };
  }

  // Find the highest tier with attempts.
  const attemptedTiers = Object.keys(stats).sort(
    (a, b) => ladder.findIndex((t) => t.id === a) - ladder.findIndex((t) => t.id === b)
  );
  const currentTierId = attemptedTiers[attemptedTiers.length - 1];
  const currentStats = stats[currentTierId];

  const { minAttemptsToAdvance, accuracyToAdvance, strugglingFloor } = GATE;

  let band: "solid" | "developing" | "struggling" = "developing";
  let advanceReady = false;

  if (
    currentStats.attempts >= minAttemptsToAdvance &&
    currentStats.accuracy >= accuracyToAdvance &&
    currentStats.coverageMet
  ) {
    band = "solid";
    advanceReady = true;
  } else if (currentStats.accuracy < strugglingFloor && currentStats.attempts >= 3) {
    band = "struggling";
  }

  return {
    tierId: currentTierId,
    band,
    advanceReady,
  };
}
