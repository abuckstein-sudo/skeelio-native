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

// What to actually TEACH for each tier (the strategy/method), keyed by tier id.
// Tunable: edit a line to change how a tier is taught.
export const TEACH_NOTES: Record<string, string> = {
  A1: "Start from the bigger number and count on by the smaller one.",
  A2: "Make ten first: split the second number so one part reaches 10, then add what's left.",
  A3: "Add the ones to the ones; the tens stay the same.",
  A4: "Add the ones, then add the tens — no carrying needed here.",
  A5: "Add the ones first; if they pass 9, carry 1 into the tens, then add the tens.",
  A6: "Work right to left: ones, tens, hundreds, carrying whenever a column passes 9.",
  A7: "Same method, more columns: right to left, carry each time a column passes 9.",
  S1: "Count back from the bigger number by the smaller one.",
  S2: "If the ones are too small to take away, use ten from the front to help.",
  S3: "Subtract the ones from the ones; the tens stay the same.",
  S4: "Subtract the ones, then the tens — no borrowing needed here.",
  S5: "If the top ones are smaller, borrow 1 ten (it becomes 10 ones), then subtract.",
  S6: "Go right to left; borrow from the next column whenever the top digit is too small.",
  S7: "To borrow across a zero, borrow from further left first, then come back.",
  M1: "×1 keeps the number, ×2 is doubling, ×10 adds a zero, ×0 is always 0.",
  M2: "×5 is half of ×10 — or count up by fives.",
  M3: "×3 is double then one more group; ×4 is doubling twice.",
  M4: "Build on facts you know — e.g. 6×7 = 5×7 + 7.",
  M5: "×11 of a single digit writes the digit twice (11×7 = 77); ×12 = ×10 then add the number twice more.",
  M6: "Multiply the ones, then the tens, and add the parts together.",
  M7: "Multiply by the ones, then by the tens, then add the two partial answers.",
  D1: "Division undoes multiplication — ask how many of the divisor fit in.",
  D2: "Use the times table: how many 3s (or 4s) make this number?",
  D3: "Use the matching times-table fact you know to find how many fit.",
  D4: "Find the biggest multiple that fits; what's left over is the remainder.",
  D5: "Share the tens first, then the ones — how many groups fit?",
  D6: "Divide as usual; whatever can't be shared evenly is the remainder.",
  D7: "Divide the front digits, multiply, subtract, bring down the next digit, repeat.",
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
  if (op === "multiplication") {
    // Smart placement based on max_times_table
    const maxTimes = Number(child?.max_times_table ?? 0);
    if (maxTimes <= 2) return "M1"; // ×0, ×1, ×2, ×10
    if (maxTimes <= 5) return "M3"; // ×3, ×4 (or ×5)
    if (maxTimes <= 10) return "M4"; // ×6, ×7, ×8, ×9
    return "M5"; // ×11, ×12 for strong kids
  }
  const d: Record<string, string> = { simple: "D1", long: "D5", not_started: "D1" };
  return d[String(child?.math_division_level)] ?? "D1";
}
