#!/usr/bin/env node

import { LADDERS, GATE, startingTier } from "../lib/tutorConfig";
import { generateQuestion } from "../lib/tutor/generate";
import { tierStats, currentTierAndBand, Attempt } from "../lib/tutor/ability";
import { pickNextStep } from "../lib/tutor/selector";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

function assertInRange(value: number, min: number, max: number, message: string) {
  assert(value >= min && value <= max, `${message} (got ${value}, expected [${min}, ${max}])`);
}

function assertHasCarry(a: number, b: number, message: string) {
  const result = a + b;
  const str = String(result);
  const carry = result > 9; // simplified check for single digit
  if (a < 10 && b < 10) {
    // For single digit, check if result has tens place
    assert(carry, `${message} (${a} + ${b} = ${result}, no carry)`);
  }
}

function assertNoCarry(a: number, b: number, message: string) {
  let hasCarry = false;
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) + Number(bStr[i]) >= 10) {
      hasCarry = true;
      break;
    }
  }
  assert(!hasCarry, `${message} (${a} + ${b} has carry)`);
}

function assertAlwaysCarry(a: number, b: number, message: string) {
  let hasCarry = false;
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) + Number(bStr[i]) >= 10) {
      hasCarry = true;
      break;
    }
  }
  assert(hasCarry, `${message} (${a} + ${b} missing carry)`);
}

function assertHasBorrow(a: number, b: number, message: string) {
  let hasBorrow = false;
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) < Number(bStr[i])) {
      hasBorrow = true;
      break;
    }
  }
  assert(hasBorrow, `${message} (${a} - ${b} missing borrow)`);
}

function assertNoBorrow(a: number, b: number, message: string) {
  let hasBorrow = false;
  const aStr = String(a).padStart(String(Math.max(a, b)).length, "0");
  const bStr = String(b).padStart(String(Math.max(a, b)).length, "0");
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) < Number(bStr[i])) {
      hasBorrow = true;
      break;
    }
  }
  assert(!hasBorrow, `${message} (${a} - ${b} has borrow)`);
}

console.log("\n====== TIER CONSTRAINT TESTS ======\n");

for (const [op, tiers] of Object.entries(LADDERS)) {
  console.log(`\n--- ${op.toUpperCase()} ---`);

  for (const tier of tiers) {
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < 20; i++) {
      try {
        const q = generateQuestion(op as any, tier.id);

        // Verify the answer
        let expectedAnswer = q.answer;
        if (op === "addition") {
          assert(q.a + q.b === expectedAnswer, `A${i}: ${q.a} + ${q.b} should equal ${expectedAnswer}`);
        } else if (op === "subtraction") {
          assert(q.a - q.b === expectedAnswer, `S${i}: ${q.a} - ${q.b} should equal ${expectedAnswer}`);
          assert(q.a >= q.b, `S${i}: a >= b (${q.a} >= ${q.b})`);
        } else if (op === "multiplication") {
          assert(q.a * q.b === expectedAnswer, `M${i}: ${q.a} × ${q.b} should equal ${expectedAnswer}`);
        } else if (op === "division") {
          const quotient = q.answer;
          const rem = q.remainder || 0;
          assert(q.a === q.b * quotient + rem, `D${i}: ${q.a} = ${q.b} × ${quotient} + ${rem}`);
        }

        // Check tier-specific constraints
        if (tier.gen.kind === "add") {
          if (tier.gen.carry === "none") assertNoCarry(q.a, q.b, `${tier.id}(${i}): no carry`);
          if (tier.gen.carry === "required") assertAlwaysCarry(q.a, q.b, `${tier.id}(${i}): required carry`);
          if (tier.gen.resultMax) assertInRange(q.answer, 0, tier.gen.resultMax, `${tier.id}(${i}): result`);
        } else if (tier.gen.kind === "sub") {
          if (tier.gen.borrow === "none") assertNoBorrow(q.a, q.b, `${tier.id}(${i}): no borrow`);
          if (tier.gen.borrow === "required") assertHasBorrow(q.a, q.b, `${tier.id}(${i}): required borrow`);
        } else if (tier.gen.kind === "mulFacts") {
          assert(tier.gen.factors.includes(Math.max(q.a, q.b)) || tier.gen.factors.includes(Math.min(q.a, q.b)), `${tier.id}(${i}): factor from list`);
        } else if (tier.gen.kind === "divFacts") {
          if (tier.gen.remainder === "none") assert(q.remainder === 0 || !q.remainder, `${tier.id}(${i}): no remainder`);
          if (tier.gen.remainder === "required") assert(q.remainder && q.remainder > 0, `${tier.id}(${i}): has remainder`);
        } else if (tier.gen.kind === "divMulti") {
          if (tier.gen.remainder === "none") assert(q.remainder === 0 || !q.remainder, `${tier.id}(${i}): no remainder`);
          if (tier.gen.remainder === "required") assert(q.remainder && q.remainder > 0, `${tier.id}(${i}): has remainder`);
        }

        passed++;
      } catch (e) {
        failed++;
        console.error(`  Error in ${tier.id} iteration ${i}: ${e}`);
      }
    }

    const status = failed === 0 ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status} ${tier.id}: ${passed}/20 questions valid`);
  }
}

console.log("\n====== ABILITY & SELECTOR TESTS ======\n");

// Test 1: 8/8 at A1 → solid at A1, so working tier is A2 (needs-teach)
console.log("Test 1: 8/8 correct at A1 → solid at A1, working on A2");
const attempts1: Attempt[] = Array(8)
  .fill(null)
  .map(() => ({ tierId: "A1", correct: true }));
const band1 = currentTierAndBand(attempts1, "addition", {});
assert(band1.tierId === "A2", `Working tier should be A2, got ${band1.tierId}`);
assert(band1.band === "needs-teach", `Band should be needs-teach, got ${band1.band}`);
assert(band1.advanceReady === false, `Should not be ready to advance at A2 yet`);
console.log(`  ✅ ${band1.tierId} band=${band1.band} advanceReady=${band1.advanceReady}`);

// Test 2: 5/8 at A3 → developing, not ready
console.log("\nTest 2: 5/8 correct at A3 → developing, not ready");
const attempts2: Attempt[] = [
  ...Array(5).fill({ tierId: "A3", correct: true }),
  ...Array(3).fill({ tierId: "A3", correct: false }),
];
const band2 = currentTierAndBand(attempts2, "addition", {});
assert(band2.band === "developing", `Band should be developing, got ${band2.band}`);
assert(band2.advanceReady === false, `Should not be ready to advance`);
console.log(`  ✅ ${band2.tierId} band=${band2.band} advanceReady=${band2.advanceReady}`);

// Test 3: 2/8 at S4 → struggling, should go down
console.log("\nTest 3: 2/8 correct at S4 → struggling");
const attempts3: Attempt[] = [...Array(2).fill({ tierId: "S4", correct: true }), ...Array(6).fill({ tierId: "S4", correct: false })];
const band3 = currentTierAndBand(attempts3, "subtraction", {});
assert(band3.band === "struggling", `Band should be struggling, got ${band3.band}`);
console.log(`  ✅ ${band3.tierId} band=${band3.band}`);

// Test 4: No attempts → starting tier from child config
console.log("\nTest 4: No attempts → use starting tier");
const child4 = { max_addition_number: 100 };
const band4 = currentTierAndBand([], "addition", child4);
assert(band4.tierId === "A3", `Starting tier should be A3 for max_addition_number=100, got ${band4.tierId}`);
assert(band4.band === "needs-teach", `Band should be needs-teach, got ${band4.band}`);
console.log(`  ✅ ${band4.tierId} band=${band4.band}`);

// Test 5: pickNextStep → pick lowest non-solid tier (with attempts)
console.log("\nTest 5: pickNextStep → pick lowest non-solid tier (developing)");
const childProgress = {
  addition: [...Array(8).fill({ tierId: "A1", correct: true })], // solid
  subtraction: [...Array(3).fill({ tierId: "S1", correct: true }), ...Array(1).fill({ tierId: "S1", correct: false })], // developing, 4 attempts
  multiplication: [],
  division: [],
};
const step5 = pickNextStep({}, childProgress as any);
// S1 is the lowest non-solid tier; should be practice since there are attempts
assert(step5.operation === "subtraction", `Should pick subtraction, got ${step5.operation}`);
assert(step5.tierId === "S1", `Should pick S1, got ${step5.tierId}`);
assert(step5.mode === "practice", `S1 has 4 attempts, should be practice mode, got ${step5.mode}`);
console.log(`  ✅ pickNextStep: ${step5.operation} ${step5.tierId} mode=${step5.mode}`);

// Test 6: pickNextStep → brand-new tier (never attempted) should be teach
console.log("\nTest 6: pickNextStep → brand-new tier should be teach mode");
const childProgress6 = {
  addition: [...Array(8).fill({ tierId: "A1", correct: true })], // solid
  subtraction: [],
  multiplication: [],
  division: [],
};
const step6 = pickNextStep({}, childProgress6 as any);
assert(step6.operation === "subtraction", `Should pick subtraction, got ${step6.operation}`);
assert(step6.tierId === "S1", `Should pick S1, got ${step6.tierId}`);
assert(step6.mode === "teach", `S1 is brand-new (0 attempts), should be teach mode, got ${step6.mode}`);
console.log(`  ✅ pickNextStep: ${step6.operation} ${step6.tierId} mode=${step6.mode}`);

console.log("\n====== ALL TESTS COMPLETE ======\n");

if (!process.exitCode) {
  console.log("✅ All tests passed!");
  process.exit(0);
} else {
  console.log("❌ Some tests failed");
  process.exit(1);
}
