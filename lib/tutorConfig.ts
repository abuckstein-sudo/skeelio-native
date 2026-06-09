// tutorConfig.ts — SINGLE SOURCE OF TRUTH for the adaptive math engine.
// Tune freely here: tiers, ranges, and gate numbers. The generator, ability
// logic, selector, and status all READ from this file — nothing hardcodes a number.

export type Operation = "addition" | "subtraction" | "multiplication" | "division";
export type Constraint = "none" | "required" | "either"; // carry / borrow / remainder

export type GenParams =
  | { kind: "add"; aMin: number; aMax: number; bMin: number; bMax: number; carry: Constraint; resultMax?: number }
  | { kind: "sub"; aMin: number; aMax: number; bMin: number; bMax: number; borrow: Constraint; acrossZero?: boolean }
  | { kind: "mulFacts"; factors: number[]; otherMin: number; otherMax: number }
  | { kind: "mulMulti"; aMin: number; aMax: number; bMin: number; bMax: number }
  | { kind: "divFacts"; divisors: number[]; quotientMin: number; quotientMax: number; remainder: Constraint }
  | { kind: "divMulti"; dividendMin: number; dividendMax: number; divisorMin: number; divisorMax: number; remainder: Constraint };

export interface Tier { id: string; label: string; gen: GenParams }

export const LADDERS: Record<Operation, Tier[]> = {
  addition: [
    { id: "A1", label: "Sums within 10", gen: { kind: "add", aMin: 1, aMax: 9, bMin: 1, bMax: 9, carry: "none", resultMax: 10 } },
    { id: "A2", label: "Within 20, crossing ten", gen: { kind: "add", aMin: 2, aMax: 9, bMin: 2, bMax: 9, carry: "required", resultMax: 18 } },
    { id: "A3", label: "2-digit + 1-digit, no carry", gen: { kind: "add", aMin: 10, aMax: 99, bMin: 1, bMax: 9, carry: "none" } },
    { id: "A4", label: "2-digit + 2-digit, no carry", gen: { kind: "add", aMin: 10, aMax: 99, bMin: 10, bMax: 99, carry: "none" } },
    { id: "A5", label: "2-digit + 2-digit, carrying", gen: { kind: "add", aMin: 10, aMax: 99, bMin: 10, bMax: 99, carry: "required" } },
    { id: "A6", label: "3-digit, carrying", gen: { kind: "add", aMin: 100, aMax: 999, bMin: 100, bMax: 999, carry: "required" } },
    { id: "A7", label: "4-digit, carrying", gen: { kind: "add", aMin: 1000, aMax: 9999, bMin: 1000, bMax: 9999, carry: "either" } },
  ],
  subtraction: [
    { id: "S1", label: "Within 10, no borrow", gen: { kind: "sub", aMin: 2, aMax: 10, bMin: 1, bMax: 9, borrow: "none" } },
    { id: "S2", label: "Within 20, crossing ten", gen: { kind: "sub", aMin: 11, aMax: 18, bMin: 2, bMax: 9, borrow: "required" } },
    { id: "S3", label: "2-digit − 1-digit, no borrow", gen: { kind: "sub", aMin: 10, aMax: 99, bMin: 1, bMax: 9, borrow: "none" } },
    { id: "S4", label: "2-digit − 2-digit, no borrow", gen: { kind: "sub", aMin: 10, aMax: 99, bMin: 10, bMax: 99, borrow: "none" } },
    { id: "S5", label: "2-digit − 2-digit, borrowing", gen: { kind: "sub", aMin: 10, aMax: 99, bMin: 10, bMax: 99, borrow: "required" } },
    { id: "S6", label: "3-digit, borrowing", gen: { kind: "sub", aMin: 100, aMax: 999, bMin: 100, bMax: 999, borrow: "required" } },
    { id: "S7", label: "4-digit, borrowing across zeros", gen: { kind: "sub", aMin: 1000, aMax: 9999, bMin: 1000, bMax: 9999, borrow: "required", acrossZero: true } },
  ],
  multiplication: [
    { id: "M1", label: "×0, ×1, ×2, ×10", gen: { kind: "mulFacts", factors: [0, 1, 2, 10], otherMin: 0, otherMax: 12 } },
    { id: "M2", label: "×5", gen: { kind: "mulFacts", factors: [5], otherMin: 0, otherMax: 12 } },
    { id: "M3", label: "×3, ×4", gen: { kind: "mulFacts", factors: [3, 4], otherMin: 0, otherMax: 12 } },
    { id: "M4", label: "×6, ×7, ×8, ×9", gen: { kind: "mulFacts", factors: [6, 7, 8, 9], otherMin: 0, otherMax: 12 } },
    { id: "M5", label: "×11, ×12", gen: { kind: "mulFacts", factors: [11, 12], otherMin: 0, otherMax: 12 } },
    { id: "M6", label: "2-digit × 1-digit", gen: { kind: "mulMulti", aMin: 10, aMax: 99, bMin: 2, bMax: 9 } },
    { id: "M7", label: "2-digit × 2-digit", gen: { kind: "mulMulti", aMin: 10, aMax: 99, bMin: 10, bMax: 99 } },
  ],
  division: [
    { id: "D1", label: "÷1, ÷2, ÷5, ÷10", gen: { kind: "divFacts", divisors: [1, 2, 5, 10], quotientMin: 1, quotientMax: 12, remainder: "none" } },
    { id: "D2", label: "÷3, ÷4", gen: { kind: "divFacts", divisors: [3, 4], quotientMin: 1, quotientMax: 12, remainder: "none" } },
    { id: "D3", label: "÷6, ÷7, ÷8, ÷9", gen: { kind: "divFacts", divisors: [6, 7, 8, 9], quotientMin: 1, quotientMax: 12, remainder: "none" } },
    { id: "D4", label: "Single-digit divisor, with remainder", gen: { kind: "divFacts", divisors: [2, 3, 4, 5, 6, 7, 8, 9], quotientMin: 1, quotientMax: 12, remainder: "required" } },
    { id: "D5", label: "2-digit ÷ 1-digit, exact", gen: { kind: "divMulti", dividendMin: 10, dividendMax: 99, divisorMin: 2, divisorMax: 9, remainder: "none" } },
    { id: "D6", label: "2-digit ÷ 1-digit, with remainder", gen: { kind: "divMulti", dividendMin: 10, dividendMax: 99, divisorMin: 2, divisorMax: 9, remainder: "required" } },
    { id: "D7", label: "Long division", gen: { kind: "divMulti", dividendMin: 100, dividendMax: 999, divisorMin: 2, divisorMax: 25, remainder: "either" } },
  ],
};

// The mastery gate — THIS IS THE PEDAGOGY. Tune these to make it easier/harder.
export const GATE = {
  minAttemptsToAdvance: 8,   // need at least this many attempts at a tier
  accuracyToAdvance: 0.85,   // and this accuracy, to be "solid" and advance
  strugglingFloor: 0.60,     // below this at a tier → step down a tier
  factCoverageRequired: 1.0, // fraction of a fact-tier's facts that must be seen (1.0 = all)
  rangeHardHalfMinAttempts: 2, // for range tiers, min attempts landing in the harder half
};

// Where a child STARTS on each ladder before we've measured them (from parent-set ceilings).
// After real attempts exist, measured ability overrides this.
export function startingTier(op: Operation, child: any): string {
  if (op === "addition") {
    const n = Number(child?.max_addition_number ?? 0);
    return n >= 1000 ? "A6" : n >= 100 ? "A3" : "A1";
  }
  if (op === "subtraction") {
    const m: Record<string, string> = { "10": "S1", "100": "S3", "1000_plus": "S6", not_started: "S1" };
    return m[String(child?.math_subtraction_level)] ?? "S1";
  }
  if (op === "multiplication") return "M1"; // facts climb; max_times_table caps which facts appear
  const d: Record<string, string> = { simple: "D1", long: "D5", not_started: "D1" };
  return d[String(child?.math_division_level)] ?? "D1";
}
