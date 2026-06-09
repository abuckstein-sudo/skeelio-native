import { LADDERS, Operation, GenParams, GATE } from "../tutorConfig";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
  const { aMin, aMax, bMin, bMax, carry, resultMax } = params;
  let a, b, answer;

  for (let attempt = 0; attempt < 100; attempt++) {
    a = rand(aMin, aMax);
    b = rand(bMin, bMax);
    answer = a + b;

    if (resultMax && answer > resultMax) continue;

    const doesCarry = hasCarry(a, b);
    if (carry === "none" && doesCarry) continue;
    if (carry === "required" && !doesCarry) continue;

    return { a, b, answer };
  }
  return { a: aMin, b: bMin, answer: aMin + bMin };
}

function generateSub(params: Extract<GenParams, { kind: "sub" }>): { a: number; b: number; answer: number } {
  const { aMin, aMax, bMin, bMax, borrow, acrossZero } = params;
  let a, b, answer;

  for (let attempt = 0; attempt < 100; attempt++) {
    a = rand(aMin, aMax);
    b = rand(bMin, bMax);

    if (a < b) continue;
    answer = a - b;

    const doesBorrow = hasBorrow(a, b);
    if (borrow === "none" && doesBorrow) continue;
    if (borrow === "required" && !doesBorrow) continue;

    if (acrossZero && !borrowsAcrossZero(a, b)) continue;

    return { a, b, answer };
  }
  return { a: aMax, b: bMin, answer: aMax - bMin };
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

export function generateQuestion(operation: Operation, tierId: string, _maxTimesTable?: number): Question {
  const tier = LADDERS[operation].find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);

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
