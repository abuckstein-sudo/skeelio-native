import { LADDERS, Operation, GenParams, GATE } from "../tutorConfig";
import { coverageKeysForAttempt, requiredCoverageKeys } from "./ability";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function hasCarry(a: number, b: number): boolean {
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) + Number(bStr[i]) >= 10) return true;
  }
  return false;
}

function hasBorrow(a: number, b: number): boolean {
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) < Number(bStr[i])) return true;
  }
  return false;
}

function borrowsAcrossZero(a: number, b: number): boolean {
  const aStr = String(a);
  const bStr = String(b).padStart(aStr.length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    const aDigit = Number(aStr[i]);
    const bDigit = Number(bStr[i]);
    if (aDigit < bDigit) {
      // Need to borrow. Check if there's a 0 between this position and the start.
      for (let j = i - 1; j >= 0; j--) {
        if (Number(aStr[j]) === 0) return true;
      }
    }
  }
  return false;
}

function generateAdd(params: Extract<GenParams, { kind: "add" }>): { a: number; b: number; answer: number } {
  const { aMin, aMax, bMin, bMax, carry, resultMax, allowResultMaxWithCarry } = params;
  let a, b, answer;

  for (let attempt = 0; attempt < 100; attempt++) {
    a = rand(aMin, aMax);
    b = rand(bMin, bMax);
    answer = a + b;

    if (resultMax && answer > resultMax) continue;

    const doesCarry = hasCarry(a, b);
    if (carry === "none" && doesCarry && !(allowResultMaxWithCarry && resultMax !== undefined && answer === resultMax)) continue;
    if (carry === "required" && !doesCarry) continue;

    return { a, b, answer };
  }
  return { a: aMin, b: bMin, answer: aMin + bMin };
}

function generateSub(params: Extract<GenParams, { kind: "sub" }>): { a: number; b: number; answer: number } {
  const { aMin, aMax, bMin, bMax, borrow, acrossZero, allowMinuendMaxWithBorrow } = params;
  let a, b, answer;

  for (let attempt = 0; attempt < 100; attempt++) {
    a = rand(aMin, aMax);
    b = rand(bMin, bMax);

    if (a < b) continue;
    answer = a - b;

    const doesBorrow = hasBorrow(a, b);
    if (borrow === "none" && doesBorrow && !(allowMinuendMaxWithBorrow && a === aMax)) continue;
    if (borrow === "required" && !doesBorrow) continue;

    if (acrossZero && !borrowsAcrossZero(a, b)) continue;

    return { a, b, answer };
  }
  return { a: aMax, b: bMin, answer: aMax - bMin };
}

function acceptsAdd(params: Extract<GenParams, { kind: "add" }>, a: number, b: number): boolean {
  const answer = a + b;
  if (params.resultMax && answer > params.resultMax) return false;
  const doesCarry = hasCarry(a, b);
  if (
    params.carry === "none" &&
    doesCarry &&
    !(params.allowResultMaxWithCarry && params.resultMax !== undefined && answer === params.resultMax)
  ) {
    return false;
  }
  if (params.carry === "required" && !doesCarry) return false;
  return true;
}

function acceptsSub(params: Extract<GenParams, { kind: "sub" }>, a: number, b: number): boolean {
  if (a < b) return false;
  const doesBorrow = hasBorrow(a, b);
  if (params.borrow === "none" && doesBorrow && !(params.allowMinuendMaxWithBorrow && a === params.aMax)) {
    return false;
  }
  if (params.borrow === "required" && !doesBorrow) return false;
  if (params.acrossZero && !borrowsAcrossZero(a, b)) return false;
  return true;
}

function generateMulFacts(params: Extract<GenParams, { kind: "mulFacts" }>): { a: number; b: number; answer: number } {
  const { factors, otherMin, otherMax } = params;
  const factor = factors[Math.floor(Math.random() * factors.length)];
  const other = rand(otherMin, otherMax);
  const [a, b] = Math.random() < 0.5 ? [factor, other] : [other, factor];
  return { a, b, answer: a * b };
}

function generateMulMulti(params: Extract<GenParams, { kind: "mulMulti" }>): { a: number; b: number; answer: number } {
  const { aMin, aMax, bMin, bMax } = params;
  const a = rand(aMin, aMax);
  const b = rand(bMin, bMax);
  return { a, b, answer: a * b };
}

function generateDivFacts(params: Extract<GenParams, { kind: "divFacts" }>): { a: number; b: number; answer: number; remainder: number } {
  const { divisors, quotientMin, quotientMax, remainder } = params;
  const divisor = divisors[Math.floor(Math.random() * divisors.length)];
  const quotient = rand(quotientMin, quotientMax);
  let rem = 0;

  if (remainder === "required") {
    rem = rand(1, divisor - 1);
  } else if (remainder === "either") {
    rem = Math.random() < 0.5 ? rand(1, divisor - 1) : 0;
  }

  const dividend = divisor * quotient + rem;
  return { a: dividend, b: divisor, answer: quotient, remainder: rem };
}

function generateDivMulti(params: Extract<GenParams, { kind: "divMulti" }>): { a: number; b: number; answer: number; remainder: number } {
  const { dividendMin, dividendMax, divisorMin, divisorMax, remainder } = params;
  const divisor = rand(divisorMin, divisorMax);
  const quotient = Math.floor(rand(Math.ceil(dividendMin / divisor), Math.floor(dividendMax / divisor)));
  let rem = 0;

  if (remainder === "required") {
    rem = rand(1, divisor - 1);
  } else if (remainder === "either") {
    rem = Math.random() < 0.5 ? rand(1, divisor - 1) : 0;
  }

  const dividend = divisor * quotient + rem;
  return { a: dividend, b: divisor, answer: quotient, remainder: rem };
}

export interface Question {
  operation: Operation;
  tierId: string;
  a: number;
  b: number;
  answer: number;
  remainder?: number;
}

export interface GenerationOptions {
  coveredFactKeys?: Iterable<string>;
}

export function questionTextForCoverage(question: Pick<Question, "operation" | "a" | "b">): string {
  const symbol =
    question.operation === "addition"
      ? "+"
      : question.operation === "subtraction"
      ? "−"
      : question.operation === "multiplication"
      ? "×"
      : "÷";
  return `${question.a} ${symbol} ${question.b}`;
}

export function coverageKeysForQuestion(question: Question): string[] {
  return coverageKeysForAttempt(question.tierId, {
    tierId: question.tierId,
    correct: true,
    questionText: questionTextForCoverage(question),
  });
}

function requiredKeysForTier(tierId: string): string[] {
  const required = requiredCoverageKeys(tierId);
  return required ? Array.from(required).sort((a, b) => Number(a) - Number(b)) : [];
}

export function producibleCoverageKeysForTier(operation: Operation, tierId: string): string[] | null {
  const tier = LADDERS[operation].find((t) => t.id === tierId);
  if (!tier || requiredKeysForTier(tierId).length === 0) return null;

  const keys = new Set<string>();
  const gen = tier.gen;

  if (gen.kind === "add") {
    for (let a = gen.aMin; a <= gen.aMax; a++) {
      for (let b = gen.bMin; b <= gen.bMax; b++) {
        if (!acceptsAdd(gen, a, b)) continue;
        coverageKeysForQuestion({ operation, tierId, a, b, answer: a + b }).forEach((key) => keys.add(key));
      }
    }
  } else if (gen.kind === "sub") {
    for (let a = gen.aMin; a <= gen.aMax; a++) {
      for (let b = gen.bMin; b <= gen.bMax; b++) {
        if (!acceptsSub(gen, a, b)) continue;
        coverageKeysForQuestion({ operation, tierId, a, b, answer: a - b }).forEach((key) => keys.add(key));
      }
    }
  } else if (gen.kind === "mulFacts") {
    gen.factors.forEach((factor) => keys.add(String(factor)));
  } else if (gen.kind === "divFacts") {
    gen.divisors.forEach((divisor) => keys.add(String(divisor)));
  } else {
    return null;
  }

  return Array.from(keys).sort((a, b) => Number(a) - Number(b));
}

export function pickUncoveredFactKey(tierId: string, coveredFactKeys: Iterable<string>): string | null {
  const covered = new Set(coveredFactKeys);
  return requiredKeysForTier(tierId).find((key) => !covered.has(key)) || null;
}

function generateQuestionForFactKey(operation: Operation, tierId: string, targetKey: string): Question | null {
  const tier = LADDERS[operation].find((t) => t.id === tierId);
  if (!tier) return null;

  const gen = tier.gen;
  const candidates: Question[] = [];

  if (gen.kind === "add") {
    for (let a = gen.aMin; a <= gen.aMax; a++) {
      for (let b = gen.bMin; b <= gen.bMax; b++) {
        if (!acceptsAdd(gen, a, b)) continue;
        const question = { operation, tierId, a, b, answer: a + b };
        if (coverageKeysForQuestion(question).includes(targetKey)) candidates.push(question);
      }
    }
  } else if (gen.kind === "sub") {
    for (let a = gen.aMin; a <= gen.aMax; a++) {
      for (let b = gen.bMin; b <= gen.bMax; b++) {
        if (!acceptsSub(gen, a, b)) continue;
        const question = { operation, tierId, a, b, answer: a - b };
        if (coverageKeysForQuestion(question).includes(targetKey)) candidates.push(question);
      }
    }
  } else if (gen.kind === "mulFacts") {
    const factor = Number(targetKey);
    if (!gen.factors.includes(factor)) return null;
    const other = rand(gen.otherMin, gen.otherMax);
    const [a, b] = Math.random() < 0.5 ? [factor, other] : [other, factor];
    return { operation, tierId, a, b, answer: a * b };
  } else if (gen.kind === "divFacts") {
    const divisor = Number(targetKey);
    if (!gen.divisors.includes(divisor)) return null;
    const quotient = rand(gen.quotientMin, gen.quotientMax);
    let remainder = 0;
    if (gen.remainder === "required") {
      remainder = rand(1, divisor - 1);
    } else if (gen.remainder === "either") {
      remainder = Math.random() < 0.5 ? rand(1, divisor - 1) : 0;
    }
    const dividend = divisor * quotient + remainder;
    return { operation, tierId, a: dividend, b: divisor, answer: quotient, remainder };
  }

  return pickOne(candidates);
}

export function generateQuestion(
  operation: Operation,
  tierId: string,
  _maxTimesTable?: number,
  options?: GenerationOptions
): Question {
  const tier = LADDERS[operation].find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);

  const targetKey = options?.coveredFactKeys ? pickUncoveredFactKey(tierId, options.coveredFactKeys) : null;
  if (targetKey) {
    const targetedQuestion = generateQuestionForFactKey(operation, tierId, targetKey);
    if (targetedQuestion) return targetedQuestion;
  }

  const { kind } = tier.gen;
  let result;

  if (kind === "add") {
    result = generateAdd(tier.gen);
  } else if (kind === "sub") {
    result = generateSub(tier.gen);
  } else if (kind === "mulFacts") {
    result = generateMulFacts(tier.gen);
  } else if (kind === "mulMulti") {
    result = generateMulMulti(tier.gen);
  } else if (kind === "divFacts") {
    result = generateDivFacts(tier.gen);
  } else if (kind === "divMulti") {
    result = generateDivMulti(tier.gen);
  } else {
    throw new Error(`Unknown gen kind: ${kind}`);
  }

  return {
    operation,
    tierId,
    a: result.a,
    b: result.b,
    answer: result.answer,
    remainder: result.remainder,
  };
}

// Generate an ILLUSTRATIVE example for teaching (not trivial cases)
export function pickTeachExample(operation: Operation, tierId: string): Question {
  const tier = LADDERS[operation].find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);

  const { kind } = tier.gen;

  // For addition facts, pick strategy-appropriate examples
  if (kind === "add") {
    // A1: count_on (5–9) + (2–4)
    if (tierId === "A1") {
      const larger = Math.floor(Math.random() * 5) + 5; // 5-9
      const smaller = Math.floor(Math.random() * 3) + 2; // 2-4
      const answer = larger + smaller;
      return { operation, tierId, a: larger, b: smaller, answer };
    }
    // A2: make_ten (sum 11–18)
    if (tierId === "A2") {
      let a, b, answer;
      for (let i = 0; i < 50; i++) {
        a = Math.floor(Math.random() * 9) + 1; // 1-9
        b = Math.floor(Math.random() * 9) + 1; // 1-9
        answer = a + b;
        if (answer >= 11 && answer <= 18) break;
      }
      const larger = Math.max(a!, b!);
      const smaller = Math.min(a!, b!);
      return { operation, tierId, a: larger, b: smaller, answer: answer! };
    }
  }

  // For subtraction facts, pick strategy-appropriate examples
  if (kind === "sub") {
    // S1, S2: minuend ≥ 6, subtrahend 2–4, answer ≥ 1
    const minuend = Math.floor(Math.random() * 14) + 6; // 6-19
    const subtrahend = Math.floor(Math.random() * 3) + 2; // 2-4
    // Ensure result is at least 1
    const actualSubtrahend = Math.min(subtrahend, minuend - 1);
    const answer = minuend - actualSubtrahend;
    return { operation, tierId, a: minuend, b: actualSubtrahend, answer };
  }

  if (kind === "mulFacts") {
    // Pick a non-trivial factor (not 0 or 1)
    const factors = (tier.gen as any).factors.filter((f: number) => f !== 0 && f !== 1);
    if (factors.length === 0) {
      // Fallback to generateQuestion if no non-trivial factors
      return generateQuestion(operation, tierId);
    }
    const factor = factors[Math.floor(Math.random() * factors.length)];
    const other = Math.floor(Math.random() * 7) + 3; // 3-9
    const [a, b] = Math.random() < 0.5 ? [factor, other] : [other, factor];
    const answer = a * b;
    return { operation, tierId, a, b, answer };
  }

  if (kind === "divFacts") {
    // Pick a divisor that's not 1
    const divisors = (tier.gen as any).divisors.filter((d: number) => d !== 1);
    if (divisors.length === 0) {
      return generateQuestion(operation, tierId);
    }
    const divisor = divisors[Math.floor(Math.random() * divisors.length)];
    const quotient = Math.floor(Math.random() * 7) + 3; // 3-9
    const remainder = (tier.gen as any).remainder === "required" ? Math.floor(Math.random() * (divisor - 1)) + 1 : 0;
    const dividend = divisor * quotient + remainder;
    return { operation, tierId, a: dividend, b: divisor, answer: quotient, remainder: remainder > 0 ? remainder : undefined };
  }

  // For procedural tiers (add, sub, mulMulti, divMulti), generate and reject degenerate cases
  for (let attempts = 0; attempts < 50; attempts++) {
    const q = generateQuestion(operation, tierId);

    // Reject if either operand is 0
    if (q.a === 0 || q.b === 0) continue;

    // For add/sub, ensure the constraint is actually exercised
    if (kind === "add") {
      const hasCarry = hasCarryInAdd(q.a, q.b);
      const constraintRequired = (tier.gen as any).carry === "required";
      if (constraintRequired && !hasCarry) continue; // Need carry but don't have it
      if ((tier.gen as any).carry === "none" && hasCarry) continue; // Shouldn't have carry but do
    }

    if (kind === "sub") {
      const hasBorrow = hasBorrowInSub(q.a, q.b);
      const constraintRequired = (tier.gen as any).borrow === "required";
      if (constraintRequired && !hasBorrow) continue;
      if ((tier.gen as any).borrow === "none" && hasBorrow) continue;
    }

    // For mulMulti/divMulti, just ensure no 0 operands (which we already checked)
    return q;
  }

  // Fallback if we can't find a good example
  return generateQuestion(operation, tierId);
}

function hasCarryInAdd(a: number, b: number): boolean {
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) + Number(bStr[i]) >= 10) return true;
  }
  return false;
}

function hasBorrowInSub(a: number, b: number): boolean {
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) < Number(bStr[i])) return true;
  }
  return false;
}
