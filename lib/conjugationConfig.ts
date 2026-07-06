export type ConjugationTierId =
  | "CJ1"
  | "CJ2"
  | "CJ3"
  | "CJ4"
  | "CJ5"
  | "CJ6"
  | "CJ7"
  | "CJ8"
  | "CJ9"
  | "CJ10"
  | "CJ11";

export type ConjugationVerbGroup = "groupe_1" | "groupe_2" | "groupe_3" | "irregulier";

export type ConjugationTier = {
  id: ConjugationTierId;
  label: string;
  tense: string;
  verbGroups: ConjugationVerbGroup[];
};

export const CONJUGATION_LADDER: ConjugationTier[] = [
  { id: "CJ1", label: "Présent des verbes irréguliers", tense: "présent", verbGroups: ["irregulier"] },
  { id: "CJ2", label: "Présent des verbes du 1er groupe", tense: "présent", verbGroups: ["groupe_1"] },
  {
    id: "CJ3",
    label: "Futur simple des verbes irréguliers et du 1er groupe",
    tense: "futur simple",
    verbGroups: ["irregulier", "groupe_1"],
  },
  {
    id: "CJ4",
    label: "Imparfait des verbes irréguliers et du 1er groupe",
    tense: "imparfait",
    verbGroups: ["irregulier", "groupe_1"],
  },
  {
    id: "CJ5",
    label: "Passé composé des verbes du 1er groupe et irréguliers",
    tense: "passé composé",
    verbGroups: ["groupe_1", "irregulier"],
  },
  { id: "CJ6", label: "Présent des verbes du 2e groupe", tense: "présent", verbGroups: ["groupe_2"] },
  { id: "CJ7", label: "Présent des verbes du 3e groupe", tense: "présent", verbGroups: ["groupe_3"] },
  {
    id: "CJ8",
    label: "Futur simple des verbes des 2e et 3e groupes",
    tense: "futur simple",
    verbGroups: ["groupe_2", "groupe_3"],
  },
  {
    id: "CJ9",
    label: "Imparfait des verbes des 2e et 3e groupes",
    tense: "imparfait",
    verbGroups: ["groupe_2", "groupe_3"],
  },
  {
    id: "CJ10",
    label: "Passé composé des verbes des 2e et 3e groupes",
    tense: "passé composé",
    verbGroups: ["groupe_2", "groupe_3"],
  },
  {
    id: "CJ11",
    label: "Passé simple des verbes réguliers et irréguliers",
    tense: "passé simple",
    verbGroups: ["groupe_1", "groupe_2", "groupe_3", "irregulier"],
  },
];

export const CONJUGATION_GATE = {
  minAttempts: 12,
  masteryRate: 0.85,
  requiredPronouns: 6,
  minDistinctVerbs: 5,
} as const;

export const CONJUGATION_PRONOUNS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"] as const;

export const CONJUGATION_GRADE_EXPECTED: Record<"CP" | "CE1" | "CE2" | "CM1", ConjugationTierId | null> = {
  CP: null,
  CE1: "CJ5",
  CE2: "CJ10",
  CM1: "CJ11",
};

export const CONJUGATION_GRADE_EXPECTED_STANDARDS: Record<"CP" | "CE1" | "CE2" | "CM1", { citation: string }> = {
  CP: { citation: "Éduscol — Attendus de fin d'année, CP Français (Ministère de l'Éducation nationale)" },
  CE1: { citation: "Éduscol — Attendus de fin d'année, CE1 Français (Ministère de l'Éducation nationale)" },
  CE2: { citation: "Éduscol — Attendus de fin d'année, CE2 Français (Ministère de l'Éducation nationale)" },
  CM1: { citation: "Éduscol — Attendus de fin d'année, CM1 Français (Ministère de l'Éducation nationale)" },
};
