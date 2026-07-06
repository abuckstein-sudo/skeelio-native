export type SpellingStrand = "lexical" | "invariable";

export type SpellingTierId =
  | "SP1"
  | "SP2"
  | "SP3"
  | "SP4"
  | "SP5"
  | "SP6"
  | "SP7"
  | "SP8"
  | "INV1"
  | "INV2"
  | "INV3"
  | "INV4";

export type SpellingTier = {
  id: SpellingTierId;
  label: string;
  strand: SpellingStrand;
  order: number;
};

export const SPELLING_LADDER: SpellingTier[] = [
  { id: "SP1", label: "Mots courants — échelons 1 à 9", strand: "lexical", order: 1 },
  { id: "SP2", label: "Mots courants — échelons 10 à 11", strand: "lexical", order: 2 },
  { id: "SP3", label: "Mots courants — échelons 12 à 13", strand: "lexical", order: 3 },
  { id: "SP4", label: "Mots courants — échelons 14 à 15", strand: "lexical", order: 4 },
  { id: "SP5", label: "Mots courants — échelons 16 à 17", strand: "lexical", order: 5 },
  { id: "SP6", label: "Mots courants — échelons 18 à 19", strand: "lexical", order: 6 },
  { id: "SP7", label: "Mots courants — échelons 20 à 23", strand: "lexical", order: 7 },
  { id: "SP8", label: "Mots courants — échelon 24 et plus", strand: "lexical", order: 8 },
  { id: "INV1", label: "Mots invariables — échelons 1 à 11", strand: "invariable", order: 1 },
  { id: "INV2", label: "Mots invariables — échelons 12 à 15", strand: "invariable", order: 2 },
  { id: "INV3", label: "Mots invariables — échelons 16 à 19", strand: "invariable", order: 3 },
  { id: "INV4", label: "Mots invariables — échelon 20 et plus", strand: "invariable", order: 4 },
];

export const SPELLING_LEXICAL_LADDER = SPELLING_LADDER.filter((tier) => tier.strand === "lexical");
export const SPELLING_INVARIABLE_LADDER = SPELLING_LADDER.filter((tier) => tier.strand === "invariable");

export const SPELLING_GATE = {
  minAttempts: 12,
  masteryRate: 0.85,
  minDistinctWords: 8,
} as const;

export const SPELLING_SOURCE_CITATION =
  "Éduscol — Liste de fréquence lexicale (Ministère de l'Éducation nationale)";

export const SPELLING_GRADE_EXPECTED: Record<
  "CP" | "CE1" | "CE2" | "CM1",
  { lexical: SpellingTierId; invariable: SpellingTierId }
> = {
  CP: { lexical: "SP1", invariable: "INV1" },
  CE1: { lexical: "SP2", invariable: "INV1" },
  CE2: { lexical: "SP4", invariable: "INV2" },
  CM1: { lexical: "SP6", invariable: "INV3" },
};

export const SPELLING_GRADE_EXPECTED_STANDARDS: Record<"CP" | "CE1" | "CE2" | "CM1", { citation: string }> = {
  CP: { citation: SPELLING_SOURCE_CITATION },
  CE1: { citation: SPELLING_SOURCE_CITATION },
  CE2: { citation: SPELLING_SOURCE_CITATION },
  CM1: { citation: SPELLING_SOURCE_CITATION },
};
