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
  { id: "SP1", label: "Mots courants — niveau 1", strand: "lexical", order: 1 },
  { id: "SP2", label: "Mots courants — niveau 2", strand: "lexical", order: 2 },
  { id: "SP3", label: "Mots courants — niveau 3", strand: "lexical", order: 3 },
  { id: "SP4", label: "Mots courants — niveau 4", strand: "lexical", order: 4 },
  { id: "SP5", label: "Mots courants — niveau 5", strand: "lexical", order: 5 },
  { id: "SP6", label: "Mots courants — niveau 6", strand: "lexical", order: 6 },
  { id: "SP7", label: "Mots courants — niveau 7", strand: "lexical", order: 7 },
  { id: "SP8", label: "Mots courants — niveau 8", strand: "lexical", order: 8 },
  { id: "INV1", label: "Mots invariables — niveau 1", strand: "invariable", order: 1 },
  { id: "INV2", label: "Mots invariables — niveau 2", strand: "invariable", order: 2 },
  { id: "INV3", label: "Mots invariables — niveau 3", strand: "invariable", order: 3 },
  { id: "INV4", label: "Mots invariables — niveau 4", strand: "invariable", order: 4 },
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
  CE1: { lexical: "SP3", invariable: "INV2" },
  CE2: { lexical: "SP6", invariable: "INV3" },
  CM1: { lexical: "SP8", invariable: "INV4" },
};

export const SPELLING_GRADE_EXPECTED_STANDARDS: Record<"CP" | "CE1" | "CE2" | "CM1", { citation: string }> = {
  CP: { citation: SPELLING_SOURCE_CITATION },
  CE1: { citation: SPELLING_SOURCE_CITATION },
  CE2: { citation: SPELLING_SOURCE_CITATION },
  CM1: { citation: SPELLING_SOURCE_CITATION },
};
