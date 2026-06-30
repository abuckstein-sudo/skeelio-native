import { LADDERS, Operation, GATE, startingTier, FACT_TIERS } from "../tutorConfig";
import { TIER_GATE } from "../masteryConfig";

export type EvidenceSource = keyof typeof TIER_GATE.evidenceWeights;

export interface Attempt {
  tierId: string;
  correct: boolean;
  hintUsed?: boolean; // true if child opened ANY hint before answering
  questionText?: string | null;
  evidenceSource?: EvidenceSource | string | null;
}

export interface TierStats {
  attempts: number; // total attempts (for display)
  correct: number;
  unaided_attempts: number; // attempts without hints (gate denominator)
  unaided_correct: number; // correct AND NOT hinted
  adaptive_unaided_attempts: number; // non-homework evidence required before advancement
  masteryEvidence: number; // weighted unaided attempts
  masteryCorrectEvidence: number; // weighted unaided correct attempts
  masteryRate: number; // masteryCorrectEvidence / masteryEvidence
  coverage: number;
  coverageMet: boolean;
}

function evidenceWeight(source: Attempt["evidenceSource"]): number {
  const key = String(source || "unknown") as EvidenceSource;
  return TIER_GATE.evidenceWeights[key] ?? TIER_GATE.evidenceWeights.unknown;
}

function parseQuestionNumbers(questionText: string | null | undefined): [number, number] | null {
  if (!questionText) return null;
  const match = questionText.match(/(-?\d+)\s*([+\-−×x*÷/])\s*(-?\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[3])];
}

function rangeKeys(min: number, max: number): Set<string> {
  const keys = new Set<string>();
  for (let n = min; n <= max; n++) keys.add(String(n));
  return keys;
}

export function requiredCoverageKeys(tierId: string): Set<string> | null {
  if (!FACT_TIERS.has(tierId)) return null;
  const tier = Object.values(LADDERS).flat().find((t) => t.id === tierId);
  const gen = tier?.gen;

  if (!gen) return null;
  if (tierId === "A1") return rangeKeys(2, 10);
  if (tierId === "A2") return rangeKeys(11, 18);
  if (tierId === "S1") return rangeKeys(2, 10);
  if (tierId === "S2") return rangeKeys(11, 18);
  if (gen.kind === "mulFacts") return new Set(gen.factors.map(String));
  if (gen.kind === "divFacts") return new Set(gen.divisors.map(String));
  return null;
}

export function coverageKeysForAttempt(tierId: string, attempt: Attempt): string[] {
  const nums = parseQuestionNumbers(attempt.questionText);
  if (!nums) return [];

  const [a, b] = nums;
  if (tierId.startsWith("A")) return [String(a + b)];
  if (tierId.startsWith("S")) return [String(a)];

  const tier = Object.values(LADDERS).flat().find((t) => t.id === tierId);
  const gen = tier?.gen;
  if (gen?.kind === "mulFacts") {
    const factors = new Set(gen.factors);
    return [a, b].filter((n) => factors.has(n)).map(String);
  }
  if (gen?.kind === "divFacts") return [String(b)];

  return [];
}

function coverageForTier(tierId: string, attempts: Attempt[]): { coverage: number; met: boolean } {
  const required = requiredCoverageKeys(tierId);
  if (!required || required.size === 0) return { coverage: 1, met: true };

  const covered = new Set<string>();
  let sawParseableFactAttempt = false;
  for (const attempt of attempts) {
    if (attempt.hintUsed || !attempt.correct) continue;
    const keys = coverageKeysForAttempt(tierId, attempt);
    if (keys.length > 0) sawParseableFactAttempt = true;
    for (const key of keys) {
      if (required.has(key)) covered.add(key);
    }
  }

  if (!sawParseableFactAttempt) return { coverage: 1, met: true };

  const coverage = covered.size / required.size;
  return { coverage, met: coverage >= GATE.factCoverageRequired };
}

export function factTierCoverageProgress(
  tierId: string,
  attempts: Attempt[]
): { covered: number; required: number } | null {
  const required = requiredCoverageKeys(tierId);
  if (!required || required.size === 0) return null;

  const covered = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.hintUsed || !attempt.correct) continue;
    for (const key of coverageKeysForAttempt(tierId, attempt)) {
      if (required.has(key)) covered.add(key);
    }
  }

  return { covered: covered.size, required: required.size };
}

export function factTierCoverageKeys(
  tierId: string,
  attempts: Attempt[]
): { covered: string[]; required: string[] } | null {
  const required = requiredCoverageKeys(tierId);
  if (!required || required.size === 0) return null;

  const covered = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.hintUsed || !attempt.correct) continue;
    for (const key of coverageKeysForAttempt(tierId, attempt)) {
      if (required.has(key)) covered.add(key);
    }
  }

  const sortNumeric = (a: string, b: string) => Number(a) - Number(b);
  return {
    covered: Array.from(covered).sort(sortNumeric),
    required: Array.from(required).sort(sortNumeric),
  };
}

export function factTierCoverageGapAfterOtherGates(
  tierId: string,
  attempts: Attempt[]
): { covered: number; required: number } | null {
  const stat = tierStats(attempts)[tierId];
  const progress = factTierCoverageProgress(tierId, attempts);
  if (!stat || !progress || progress.covered >= progress.required) return null;

  const otherGatesMet =
    stat.masteryEvidence >= GATE.minAttemptsToAdvance &&
    stat.adaptive_unaided_attempts >= TIER_GATE.minAdaptiveUnaidedAttempts &&
    stat.masteryRate >= GATE.accuracyToAdvance;

  return otherGatesMet && !stat.coverageMet ? progress : null;
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
    const adaptive_unaided_attempts = unaidedAttempts.filter(
      (a) => (a.evidenceSource || "unknown") !== "assigned_homework"
    ).length;
    const masteryEvidence = unaidedAttempts.reduce((sum, a) => sum + evidenceWeight(a.evidenceSource), 0);
    const masteryCorrectEvidence = unaidedAttempts.reduce(
      (sum, a) => sum + (a.correct ? evidenceWeight(a.evidenceSource) : 0),
      0
    );
    const total = tierAttempts.length;
    const coverage = coverageForTier(tierId, tierAttempts);

    stats[tierId] = {
      attempts: total,
      correct,
      unaided_attempts,
      unaided_correct,
      adaptive_unaided_attempts,
      masteryEvidence,
      masteryCorrectEvidence,
      masteryRate: masteryEvidence > 0 ? masteryCorrectEvidence / masteryEvidence : 0,
      coverage: coverage.coverage,
      coverageMet: coverage.met,
    };
  }

  return stats;
}

export function isSolidTierStat(tierStat: TierStats | undefined): boolean {
  return !!tierStat &&
    tierStat.masteryEvidence >= GATE.minAttemptsToAdvance &&
    tierStat.adaptive_unaided_attempts >= TIER_GATE.minAdaptiveUnaidedAttempts &&
    tierStat.masteryRate >= GATE.accuracyToAdvance &&
    tierStat.coverageMet;
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
  const { strugglingFloor } = GATE;

  // Find the highest tier the child is SOLID at:
  // enough weighted UNAIDED evidence, enough adaptive evidence, 85%+ mastery, and coverage met
  let highestSolidTierIndex = -1;
  for (let i = ladder.length - 1; i >= 0; i--) {
    const tier = ladder[i];
    const tierStat = stats[tier.id];
    if (isSolidTierStat(tierStat)) {
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
    if (isSolidTierStat(workingStats)) {
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
