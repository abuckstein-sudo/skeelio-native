#!/usr/bin/env node

import {
  GATE,
  FACT_TIERS,
  gradeExpectedTierId,
  gradeExpectedTierIndex,
  gradeExpectedTierStandard,
  LADDERS,
  Operation,
  startingTier,
} from "../lib/tutorConfig";
import { coverageKeysForQuestion, generateQuestion, pickUncoveredFactKey, producibleCoverageKeysForTier } from "../lib/tutor/generate";
import { factTierCoverageKeys, requiredCoverageKeys, tierStats, currentTierAndBand, Attempt } from "../lib/tutor/ability";
import { pickNextStep } from "../lib/tutor/selector";
import { computeUnlockState } from "../lib/tutor/unlockGraph";
import { TIER_GATE } from "../lib/masteryConfig";
import { recommendationFor } from "../lib/progressGlance";

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

function assertBorrowsAcrossZero(a: number, b: number, message: string) {
  const aStr = String(a);
  const bStr = String(b).padStart(aStr.length, "0");
  let acrossZero = false;
  for (let i = aStr.length - 1; i >= 0; i--) {
    if (Number(aStr[i]) < Number(bStr[i])) {
      for (let j = i - 1; j >= 0; j--) {
        if (Number(aStr[j]) === 0) {
          acrossZero = true;
          break;
        }
      }
    }
    if (acrossZero) break;
  }
  assert(acrossZero, `${message} (${a} - ${b} missing across-zero borrow)`);
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

function operationForTier(tierId: string): Operation {
  for (const [operation, tiers] of Object.entries(LADDERS)) {
    if (tiers.some((tier) => tier.id === tierId)) return operation as Operation;
  }
  throw new Error(`Unknown tier ${tierId}`);
}

function questionToAttempt(question: ReturnType<typeof generateQuestion>): Attempt {
  return {
    tierId: question.tierId,
    correct: true,
    hintUsed: false,
    questionText: `${question.a} ${
      question.operation === "addition"
        ? "+"
        : question.operation === "subtraction"
        ? "−"
        : question.operation === "multiplication"
        ? "×"
        : "÷"
    } ${question.b}`,
    evidenceSource: "adaptive_practice",
  };
}

function assignedA1MasteryAttempts(): Attempt[] {
  const coverageSums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 2, 3, 4];
  return coverageSums.map((sum) => ({
    tierId: "A1",
    correct: true,
    hintUsed: false,
    questionText: `${sum - 1} + 1`,
    evidenceSource: "assigned_homework",
  }));
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
          if (tier.gen.carry === "none" && !(tier.gen.allowResultMaxWithCarry && q.answer === tier.gen.resultMax)) {
            assertNoCarry(q.a, q.b, `${tier.id}(${i}): no carry`);
          }
          if (tier.gen.carry === "required") assertAlwaysCarry(q.a, q.b, `${tier.id}(${i}): required carry`);
          if (tier.gen.resultMax) assertInRange(q.answer, 0, tier.gen.resultMax, `${tier.id}(${i}): result`);
        } else if (tier.gen.kind === "sub") {
          if (tier.gen.borrow === "none" && !(tier.gen.allowMinuendMaxWithBorrow && q.a === tier.gen.aMax)) {
            assertNoBorrow(q.a, q.b, `${tier.id}(${i}): no borrow`);
          }
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

// Test 1: enough unaided A1 evidence → solid at A1, so working tier is A2 (needs-teach)
console.log("Test 1: 12/12 correct at A1 → solid at A1, working on A2");
const attempts1: Attempt[] = Array(12)
  .fill(null)
  .map(() => ({ tierId: "A1", correct: true }));
const band1 = currentTierAndBand(attempts1, "addition", {});
assert(band1.tierId === "A2", `Working tier should be A2, got ${band1.tierId}`);
assert(band1.band === "needs-teach", `Band should be needs-teach, got ${band1.band}`);
assert(band1.advanceReady === false, `Should not be ready to advance at A2 yet`);
console.log(`  ✅ ${band1.tierId} band=${band1.band} advanceReady=${band1.advanceReady}`);

// Test 1b: assigned ladder practice is first-class unaided mastery evidence
console.log("\nTest 1b: assigned-only A1 ladder practice can master A1");
assert(TIER_GATE.evidenceWeights.assigned_homework === 1, "assigned_homework should have full evidence weight");
const assignedOnlyA1 = assignedA1MasteryAttempts();
const assignedStats = tierStats(assignedOnlyA1).A1;
assert(assignedStats.masteryEvidence === 12, `Assigned mastery evidence should be 12, got ${assignedStats.masteryEvidence}`);
assert(
  assignedStats.adaptive_unaided_attempts === 12,
  `Assigned unaided attempts should satisfy adaptive floor, got ${assignedStats.adaptive_unaided_attempts}`
);
assert(assignedStats.coverageMet, "Assigned-only A1 attempts should meet coverage");
const assignedBand = currentTierAndBand(assignedOnlyA1, "addition", {});
assert(assignedBand.tierId === "A2", `Assigned-only mastery should advance to A2, got ${assignedBand.tierId}`);
assert(assignedBand.band === "needs-teach", `Assigned-only next tier should be needs-teach, got ${assignedBand.band}`);
console.log(`  ✅ assigned-only A1 mastery advances to ${assignedBand.tierId}`);

console.log("\nTest 1c: progress-glance recommendations stay plain and targeted");
const coverageAdvice = recommendationFor("addition", "Sums within 10", "developing", { missingFacts: ["7", "8"] });
assert(coverageAdvice.includes("7, 8"), `Coverage advice should name missing facts, got ${coverageAdvice}`);
const strugglingAdvice = recommendationFor("division", "Divide by 3s and 4s", "struggling", null);
assert(strugglingAdvice.includes("Replay"), `Struggling advice should recommend replaying lesson, got ${strugglingAdvice}`);
assert(strugglingAdvice.includes("Divide by 3s and 4s"), `Struggling advice should use the human tier label, got ${strugglingAdvice}`);
assert(!strugglingAdvice.includes("D2"), `Struggling advice should not leak internal tier ids, got ${strugglingAdvice}`);
console.log("  ✅ recommendation helper gives coverage and struggling advice");

console.log("\nTest 1d: French grade year goals are nullable and sourced");
assert(gradeExpectedTierId("multiplication", "CP") === null, "CP multiplication should not have a year goal");
assert(gradeExpectedTierIndex("division", "CE1") === -1, "CE1 division should not have a year goal index");
assert(gradeExpectedTierId("addition", "CE1") === "A6", "CE1 addition goal should be A6");
assert(!!gradeExpectedTierStandard("CE2")?.citation.includes("Éduscol"), "CE2 standard should include the Eduscol citation");
console.log("  ✅ nullable sourced grade goals are available");

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
  addition: [...Array(12).fill({ tierId: "A1", correct: true })], // solid
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
  addition: [...Array(12).fill({ tierId: "A1", correct: true })], // solid
  subtraction: [],
  multiplication: [],
  division: [],
};
const step6 = pickNextStep({}, childProgress6 as any);
assert(step6.operation === "addition", `Should pick addition by canonical tie-break, got ${step6.operation}`);
assert(step6.tierId === "A2", `Should pick A2, got ${step6.tierId}`);
assert(step6.mode === "teach", `A2 is brand-new (0 attempts), should be teach mode, got ${step6.mode}`);
console.log(`  ✅ pickNextStep: ${step6.operation} ${step6.tierId} mode=${step6.mode}`);

// Test 7: pickNextStep → struggling beats developing and needs-teach
console.log("\nTest 7: pickNextStep → struggling band has priority");
const childProgress7 = {
  addition: [...Array(5).fill({ tierId: "A3", correct: true }), ...Array(3).fill({ tierId: "A3", correct: false })],
  subtraction: [...Array(1).fill({ tierId: "S4", correct: true }), ...Array(4).fill({ tierId: "S4", correct: false })],
  multiplication: [],
  division: [],
};
const step7 = pickNextStep({}, childProgress7 as any);
assert(step7.operation === "subtraction", `Should pick struggling subtraction, got ${step7.operation}`);
assert(step7.tierId === "S4", `Should pick S4, got ${step7.tierId}`);
assert(step7.mode === "practice", `S4 has attempts, should be practice mode, got ${step7.mode}`);
console.log(`  ✅ pickNextStep: ${step7.operation} ${step7.tierId} mode=${step7.mode}`);

console.log("\n====== FACT COVERAGE GENERATION TESTS ======\n");

console.log("Test 8: every fact tier can produce every required coverage key");
for (const tierId of FACT_TIERS) {
  const operation = operationForTier(tierId);
  const required = requiredCoverageKeys(tierId);
  assert(required !== null, `${tierId}: should have required coverage keys`);
  const produced = new Set(producibleCoverageKeysForTier(operation, tierId) || []);
  const missing = [...(required || new Set<string>())].filter((key) => !produced.has(key));
  assert(missing.length === 0, `${tierId}: missing producible coverage keys ${missing.join(", ")}`);
}
console.log("  ✅ all FACT_TIERS can produce their required coverage keys");

console.log("\nTest 9: coverage target picker prefers uncovered keys and falls back when complete");
assert(pickUncoveredFactKey("A1", new Set(["2", "3"])) === "4", "A1 should pick first uncovered key 4");
assert(pickUncoveredFactKey("M3", new Set(["3"])) === "4", "M3 should pick uncovered factor 4");
assert(pickUncoveredFactKey("S1", new Set(["2", "3", "4", "5", "6", "7", "8", "9", "10"])) === null, "S1 should fall back when fully covered");
console.log("  ✅ target picker returns uncovered keys and null when complete");

console.log("\nTest 10: coverage-aware generation completes A1 and S1 quickly");
for (const tierId of ["A1", "S1"]) {
  const operation = operationForTier(tierId);
  const required = requiredCoverageKeys(tierId);
  assert(required !== null, `${tierId}: should have required keys`);
  const attempts: Attempt[] = [];
  const maxQuestions = (required?.size || 0) * 2;

  for (let i = 0; i < maxQuestions; i++) {
    const coverage = factTierCoverageKeys(tierId, attempts);
    const question = generateQuestion(operation, tierId, undefined, {
      coveredFactKeys: new Set(coverage?.covered || []),
    });
    attempts.push(questionToAttempt(question));
    const nextCoverage = factTierCoverageKeys(tierId, attempts);
    if (nextCoverage && nextCoverage.covered.length === nextCoverage.required.length) break;
  }

  const finalCoverage = factTierCoverageKeys(tierId, attempts);
  assert(
    !!finalCoverage && finalCoverage.covered.length === finalCoverage.required.length,
    `${tierId}: should complete coverage within ${maxQuestions} questions`
  );
  assert(attempts.length <= maxQuestions, `${tierId}: should stay within bounded coverage window`);
  console.log(`  ✅ ${tierId}: covered ${finalCoverage?.covered.length}/${finalCoverage?.required.length} in ${attempts.length} questions`);
}

console.log("\nTest 11: restrictive subtraction fallback still satisfies constraints");
const originalRandom = Math.random;
let randomCalls = 0;
Math.random = () => {
  randomCalls += 1;
  return randomCalls % 2 === 1 ? 0.999999 : 0;
};
try {
  const fallbackQuestion = generateQuestion("subtraction", "S7");
  assertHasBorrow(fallbackQuestion.a, fallbackQuestion.b, "S7 fallback: required borrow");
  assertBorrowsAcrossZero(fallbackQuestion.a, fallbackQuestion.b, "S7 fallback: across-zero borrow");
} finally {
  Math.random = originalRandom;
}
console.log("  ✅ S7 fallback path returns a valid borrowing/across-zero question");

console.log("\nTest 11b: D6/D7 generated dividends stay inside their tier band");
for (const tierId of ["D6", "D7"]) {
  const tier = LADDERS.division.find((candidate) => candidate.id === tierId);
  assert(tier?.gen.kind === "divMulti", `${tierId}: should be a divMulti tier`);
  if (!tier || tier.gen.kind !== "divMulti") continue;

  for (let i = 0; i < 1000; i++) {
    const question = generateQuestion("division", tierId);
    assertInRange(question.a, tier.gen.dividendMin, tier.gen.dividendMax, `${tierId}(${i}): dividend`);
    assert(question.a === question.b * question.answer + (question.remainder || 0), `${tierId}(${i}): division identity`);
  }
}
console.log("  ✅ D6/D7 dividends stay within configured max");

console.log("\n====== SUBJECT UNLOCK GRAPH TESTS ======\n");

const noSolid = {
  addition: null,
  subtraction: null,
  multiplication: null,
  division: null,
};

console.log("Test 12: beginner unlocks addition and independent subjects only");
const unlock1 = computeUnlockState(noSolid, {});
assert(unlock1.addition.unlocked, "Addition should be unlocked for beginners");
assert(unlock1.spelling.unlocked, "Spelling should be unlocked for beginners");
assert(unlock1.conjugation.unlocked, "Conjugation should be unlocked for beginners");
assert(unlock1.reading.unlocked, "Reading should be unlocked for beginners");
assert(!unlock1.subtraction.unlocked, "Subtraction should start locked");
assert(!unlock1.multiplication.unlocked, "Multiplication should start locked");
assert(!unlock1.division.unlocked, "Division should start locked");
assert(!unlock1.word_problems.unlocked, "Word problems should start locked");
console.log("  ✅ beginner unlock state is correct");

console.log("\nTest 13: addition through A1 unlocks subtraction and word problems");
const unlock2 = computeUnlockState({ ...noSolid, addition: "A1" }, {});
assert(unlock2.subtraction.unlocked, "Subtraction should unlock after A1");
assert(unlock2.word_problems.unlocked, "Word problems should unlock after A1");
assert(!unlock2.multiplication.unlocked, "Multiplication should still require A4");
console.log("  ✅ A1 unlocks subtraction and word problems");

console.log("\nTest 14: addition through A4 unlocks multiplication");
const unlock3 = computeUnlockState({ ...noSolid, addition: "A4" }, {});
assert(unlock3.multiplication.unlocked, "Multiplication should unlock after A4");
console.log("  ✅ A4 unlocks multiplication");

console.log("\nTest 15: multiplication through M2 unlocks division");
const unlock4 = computeUnlockState({ ...noSolid, multiplication: "M2" }, {});
assert(unlock4.division.unlocked, "Division should unlock after M2");
console.log("  ✅ M2 unlocks division");

console.log("\nTest 16: parent-set division level no longer bypasses prerequisites");
const unlock5 = computeUnlockState(noSolid, { math_division_level: "long" });
assert(!unlock5.division.unlocked, "Division should still require multiplication mastery");
console.log("  ✅ parent-set division placement does not bypass prerequisites");

console.log("\n====== ALL TESTS COMPLETE ======\n");

if (!process.exitCode) {
  console.log("✅ All tests passed!");
  process.exit(0);
} else {
  console.log("❌ Some tests failed");
  process.exit(1);
}
