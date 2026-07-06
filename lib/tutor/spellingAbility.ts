import {
  SPELLING_GATE,
  SPELLING_INVARIABLE_LADDER,
  SPELLING_LADDER,
  SPELLING_LEXICAL_LADDER,
  SpellingStrand,
  SpellingTier,
  SpellingTierId,
} from "../spellingConfig";

export interface SpellingAttempt {
  word: string;
  tierId: SpellingTierId | null;
  strand: SpellingStrand | null;
  wasCorrect?: boolean;
  is_correct?: boolean;
  correct?: boolean;
  aided?: boolean;
  hintUsed?: boolean;
  createdAt?: string | null;
}

export interface SpellingTierStats {
  attempts: number;
  unaidedAttempts: number;
  unaidedCorrect: number;
  distinctWordsCovered: number;
  masteryRate: number;
}

export interface SpellingTierAndBand {
  tierId: SpellingTierId;
  strand: SpellingStrand;
  band: "solid" | "developing" | "struggling" | "needs-teach";
  advanceReady: boolean;
}

export type SpellingProgressByStrand = Record<SpellingStrand, SpellingTierAndBand>;

export interface SpellingCoverageProgress {
  wordsCovered: number;
  requiredWords: number;
  unaidedAttempts: number;
  requiredAttempts: number;
  needed: {
    words: number;
    attempts: number;
    accuracy: number;
  };
}

function attemptCorrect(attempt: SpellingAttempt): boolean {
  return Boolean(attempt.wasCorrect ?? attempt.is_correct ?? attempt.correct);
}

function attemptAided(attempt: SpellingAttempt): boolean {
  return Boolean(attempt.aided ?? attempt.hintUsed);
}

function attemptMatchesTier(attempt: SpellingAttempt, tier: SpellingTier): boolean {
  return attempt.tierId === tier.id && attempt.strand === tier.strand;
}

function ladderForStrand(strand: SpellingStrand): SpellingTier[] {
  return strand === "lexical" ? SPELLING_LEXICAL_LADDER : SPELLING_INVARIABLE_LADDER;
}

export function spellingTierStats(attempts: SpellingAttempt[]): Record<SpellingTierId, SpellingTierStats> {
  const stats: Partial<Record<SpellingTierId, SpellingTierStats>> = {};

  for (const tier of SPELLING_LADDER) {
    const tierAttempts = attempts.filter((attempt) => attemptMatchesTier(attempt, tier));
    const unaidedAttempts = tierAttempts.filter((attempt) => !attemptAided(attempt));
    const unaidedCorrectAttempts = unaidedAttempts.filter(attemptCorrect);
    const wordsCovered = new Set(unaidedCorrectAttempts.map((attempt) => attempt.word).filter(Boolean));

    stats[tier.id] = {
      attempts: tierAttempts.length,
      unaidedAttempts: unaidedAttempts.length,
      unaidedCorrect: unaidedCorrectAttempts.length,
      distinctWordsCovered: wordsCovered.size,
      masteryRate: unaidedAttempts.length > 0 ? unaidedCorrectAttempts.length / unaidedAttempts.length : 0,
    };
  }

  return stats as Record<SpellingTierId, SpellingTierStats>;
}

export function isSolidSpellingTier(stat: SpellingTierStats | undefined): boolean {
  return !!stat &&
    stat.unaidedAttempts >= SPELLING_GATE.minAttempts &&
    stat.masteryRate >= SPELLING_GATE.masteryRate &&
    stat.distinctWordsCovered >= SPELLING_GATE.minDistinctWords;
}

function currentSpellingTierAndBandForStrand(
  attempts: SpellingAttempt[],
  strand: SpellingStrand
): SpellingTierAndBand {
  const ladder = ladderForStrand(strand);
  const stats = spellingTierStats(attempts);
  const strandAttempts = attempts.filter((attempt) => attempt.strand === strand && attempt.tierId);

  let highestSolidTierIndex = -1;
  for (let i = ladder.length - 1; i >= 0; i--) {
    const tier = ladder[i];
    if (isSolidSpellingTier(stats[tier.id])) {
      highestSolidTierIndex = i;
      break;
    }
  }

  if (strandAttempts.length === 0) {
    return { tierId: ladder[0].id, strand, band: "needs-teach", advanceReady: false };
  }

  if (highestSolidTierIndex === -1) {
    const attemptedTier = [...ladder]
      .reverse()
      .find((tier) => (stats[tier.id]?.attempts ?? 0) > 0);
    const tierId = attemptedTier?.id ?? ladder[0].id;
    const tierStat = stats[tierId];
    const band = tierStat.masteryRate < 0.6 && tierStat.attempts >= 3 ? "struggling" : "developing";
    return { tierId, strand, band, advanceReady: false };
  }

  const workingTierIndex = highestSolidTierIndex + 1;
  if (workingTierIndex >= ladder.length) {
    return {
      tierId: ladder[highestSolidTierIndex].id,
      strand,
      band: "solid",
      advanceReady: true,
    };
  }

  const workingTierId = ladder[workingTierIndex].id;
  const workingStats = stats[workingTierId];
  if (!workingStats || workingStats.attempts === 0) {
    return { tierId: workingTierId, strand, band: "needs-teach", advanceReady: false };
  }

  if (isSolidSpellingTier(workingStats)) {
    return { tierId: workingTierId, strand, band: "solid", advanceReady: true };
  }

  if (workingStats.masteryRate < 0.6 && workingStats.attempts >= 3) {
    return { tierId: workingTierId, strand, band: "struggling", advanceReady: false };
  }

  return { tierId: workingTierId, strand, band: "developing", advanceReady: false };
}

export function currentSpellingTierAndBand(attempts: SpellingAttempt[]): SpellingProgressByStrand {
  return {
    lexical: currentSpellingTierAndBandForStrand(attempts, "lexical"),
    invariable: currentSpellingTierAndBandForStrand(attempts, "invariable"),
  };
}

export function spellingCoverageProgress(
  tier: SpellingTier | SpellingTierId,
  attempts: SpellingAttempt[]
): SpellingCoverageProgress {
  const tierId = typeof tier === "string" ? tier : tier.id;
  const stat = spellingTierStats(attempts)[tierId];
  const requiredWords = SPELLING_GATE.minDistinctWords;
  const requiredAttempts = SPELLING_GATE.minAttempts;

  return {
    wordsCovered: stat.distinctWordsCovered,
    requiredWords,
    unaidedAttempts: stat.unaidedAttempts,
    requiredAttempts,
    needed: {
      words: Math.max(0, requiredWords - stat.distinctWordsCovered),
      attempts: Math.max(0, requiredAttempts - stat.unaidedAttempts),
      accuracy: Math.max(0, SPELLING_GATE.masteryRate - stat.masteryRate),
    },
  };
}
