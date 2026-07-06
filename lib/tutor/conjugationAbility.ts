import {
  CONJUGATION_GATE,
  CONJUGATION_LADDER,
  CONJUGATION_PRONOUNS,
  ConjugationTier,
  ConjugationTierId,
} from "../conjugationConfig";

export interface ConjugationAttempt {
  verb: string;
  tense: string;
  verb_group: string;
  pronoun: string;
  language?: string | null;
  wasCorrect?: boolean;
  is_correct?: boolean;
  correct?: boolean;
  aided?: boolean;
  hintUsed?: boolean;
}

export interface ConjugationTierStats {
  attempts: number;
  unaidedAttempts: number;
  unaidedCorrect: number;
  distinctVerbsCovered: number;
  pronounsCovered: string[];
  masteryRate: number;
}

export interface ConjugationTierAndBand {
  tierId: ConjugationTierId;
  band: "solid" | "developing" | "struggling" | "needs-teach";
  advanceReady: boolean;
}

export interface ConjugationCoverageProgress {
  pronounsCovered: number;
  requiredPronouns: number;
  verbsCovered: number;
  requiredVerbs: number;
  unaidedAttempts: number;
  requiredAttempts: number;
  needed: {
    pronouns: number;
    verbs: number;
    attempts: number;
    accuracy: number;
  };
}

function attemptCorrect(attempt: ConjugationAttempt): boolean {
  return Boolean(attempt.wasCorrect ?? attempt.is_correct ?? attempt.correct);
}

function attemptAided(attempt: ConjugationAttempt): boolean {
  return Boolean(attempt.aided ?? attempt.hintUsed);
}

function attemptMatchesTier(attempt: ConjugationAttempt, tier: ConjugationTier): boolean {
  const language = attempt.language ?? "fr-FR";
  return language === "fr-FR" && attempt.tense === tier.tense && tier.verbGroups.includes(attempt.verb_group as any);
}

export function conjugationTierStats(attempts: ConjugationAttempt[]): Record<ConjugationTierId, ConjugationTierStats> {
  const stats: Partial<Record<ConjugationTierId, ConjugationTierStats>> = {};

  for (const tier of CONJUGATION_LADDER) {
    const tierAttempts = attempts.filter((attempt) => attemptMatchesTier(attempt, tier));
    const unaidedAttempts = tierAttempts.filter((attempt) => !attemptAided(attempt));
    const unaidedCorrectAttempts = unaidedAttempts.filter(attemptCorrect);
    const verbsCovered = new Set(unaidedCorrectAttempts.map((attempt) => attempt.verb).filter(Boolean));
    const pronounsCovered = new Set(
      unaidedCorrectAttempts
        .map((attempt) => attempt.pronoun)
        .filter((pronoun) => CONJUGATION_PRONOUNS.includes(pronoun as any))
    );

    stats[tier.id] = {
      attempts: tierAttempts.length,
      unaidedAttempts: unaidedAttempts.length,
      unaidedCorrect: unaidedCorrectAttempts.length,
      distinctVerbsCovered: verbsCovered.size,
      pronounsCovered: Array.from(pronounsCovered).sort(
        (a, b) => CONJUGATION_PRONOUNS.indexOf(a as any) - CONJUGATION_PRONOUNS.indexOf(b as any)
      ),
      masteryRate: unaidedAttempts.length > 0 ? unaidedCorrectAttempts.length / unaidedAttempts.length : 0,
    };
  }

  return stats as Record<ConjugationTierId, ConjugationTierStats>;
}

export function isSolidConjugationTier(stat: ConjugationTierStats | undefined): boolean {
  return !!stat &&
    stat.unaidedAttempts >= CONJUGATION_GATE.minAttempts &&
    stat.masteryRate >= CONJUGATION_GATE.masteryRate &&
    stat.pronounsCovered.length >= CONJUGATION_GATE.requiredPronouns &&
    stat.distinctVerbsCovered >= CONJUGATION_GATE.minDistinctVerbs;
}

export function currentConjugationTierAndBand(attempts: ConjugationAttempt[]): ConjugationTierAndBand {
  const stats = conjugationTierStats(attempts);

  let highestSolidTierIndex = -1;
  for (let i = CONJUGATION_LADDER.length - 1; i >= 0; i--) {
    const tier = CONJUGATION_LADDER[i];
    if (isSolidConjugationTier(stats[tier.id])) {
      highestSolidTierIndex = i;
      break;
    }
  }

  if (attempts.length === 0) {
    return { tierId: CONJUGATION_LADDER[0].id, band: "needs-teach", advanceReady: false };
  }

  if (highestSolidTierIndex === -1) {
    const attemptedTier = [...CONJUGATION_LADDER]
      .reverse()
      .find((tier) => (stats[tier.id]?.attempts ?? 0) > 0);
    const tierId = attemptedTier?.id ?? CONJUGATION_LADDER[0].id;
    const tierStat = stats[tierId];
    const band = tierStat.masteryRate < 0.6 && tierStat.attempts >= 3 ? "struggling" : "developing";
    return { tierId, band, advanceReady: false };
  }

  const workingTierIndex = highestSolidTierIndex + 1;
  if (workingTierIndex >= CONJUGATION_LADDER.length) {
    return {
      tierId: CONJUGATION_LADDER[highestSolidTierIndex].id,
      band: "solid",
      advanceReady: true,
    };
  }

  const workingTierId = CONJUGATION_LADDER[workingTierIndex].id;
  const workingStats = stats[workingTierId];
  if (!workingStats || workingStats.attempts === 0) {
    return { tierId: workingTierId, band: "needs-teach", advanceReady: false };
  }

  if (isSolidConjugationTier(workingStats)) {
    return { tierId: workingTierId, band: "solid", advanceReady: true };
  }

  if (workingStats.masteryRate < 0.6 && workingStats.attempts >= 3) {
    return { tierId: workingTierId, band: "struggling", advanceReady: false };
  }

  return { tierId: workingTierId, band: "developing", advanceReady: false };
}

export function conjugationCoverageProgress(
  tier: ConjugationTier | ConjugationTierId,
  attempts: ConjugationAttempt[]
): ConjugationCoverageProgress {
  const tierId = typeof tier === "string" ? tier : tier.id;
  const stat = conjugationTierStats(attempts)[tierId];
  const requiredPronouns = CONJUGATION_GATE.requiredPronouns;
  const requiredVerbs = CONJUGATION_GATE.minDistinctVerbs;
  const requiredAttempts = CONJUGATION_GATE.minAttempts;

  return {
    pronounsCovered: stat.pronounsCovered.length,
    requiredPronouns,
    verbsCovered: stat.distinctVerbsCovered,
    requiredVerbs,
    unaidedAttempts: stat.unaidedAttempts,
    requiredAttempts,
    needed: {
      pronouns: Math.max(0, requiredPronouns - stat.pronounsCovered.length),
      verbs: Math.max(0, requiredVerbs - stat.distinctVerbsCovered),
      attempts: Math.max(0, requiredAttempts - stat.unaidedAttempts),
      accuracy: Math.max(0, CONJUGATION_GATE.masteryRate - stat.masteryRate),
    },
  };
}
