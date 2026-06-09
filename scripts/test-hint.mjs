#!/usr/bin/env node

import { readFileSync } from "node:fs";

// Helper: compute steps for examples (inline version of lib/tutor/steps.ts logic)
function computeSteps(operation, a, b, remainder) {
  if (operation === "multiplication") {
    // Single-digit: one line
    if (a < 10 && b < 10) return [];
    // Multi-digit: show partial products
    const smaller = Math.min(a, b);
    const larger = Math.max(a, b);
    const bStr = String(smaller).split("").map(Number);
    const steps = [];
    for (let i = bStr.length - 1; i >= 0; i--) {
      const digit = bStr[i];
      const partial = larger * digit;
      const shiftedPower = bStr.length - 1 - i;
      if (digit === 0) {
        steps.push(`${larger} × ${digit} = 0 (shift by ${shiftedPower} position${shiftedPower !== 1 ? "s" : ""}).`);
      } else {
        steps.push(`${larger} × ${digit} = ${partial} (shift by ${shiftedPower} position${shiftedPower !== 1 ? "s" : ""}).`);
      }
    }
    return steps;
  }

  if (operation === "subtraction") {
    const aStr = String(a);
    const bStr = String(b).padStart(aStr.length, "0");
    let hasBorrow = false;
    for (let i = aStr.length - 1; i >= 0; i--) {
      const aDig = Number(aStr[i]);
      const bDig = Number(bStr[i]);
      if (aDig < bDig) {
        hasBorrow = true;
        break;
      }
    }
    if (!hasBorrow) return [];

    const steps = [];
    let borrow = 0;
    for (let i = aStr.length - 1; i >= 0; i--) {
      const aDig = Number(aStr[i]);
      const bDig = Number(bStr[i]);
      const effective_a = aDig - borrow;
      if (effective_a < bDig) {
        steps.push(`Column ${aStr.length - i}: Can't take ${bDig} from ${aDig}, borrow 10. ${effective_a + 10} − ${bDig} = ${effective_a + 10 - bDig}.`);
        borrow = 1;
      } else {
        if (borrow > 0) {
          steps.push(`Column ${aStr.length - i}: ${aDig} − ${bDig} − (borrow) = ${effective_a - bDig}.`);
        }
        borrow = 0;
      }
    }
    return steps;
  }

  if (operation === "division") {
    if (a < 10 && b < 10) return [];

    const steps = [];
    const dividendStr = String(a);
    let current = 0;
    let quotient = "";
    let stepNum = 1;

    for (let i = 0; i < dividendStr.length; i++) {
      const digit = Number(dividendStr[i]);
      current = current * 10 + digit;

      const q = Math.floor(current / b);
      const product = q * b;
      const rem = current - product;

      if (quotient.length > 0 || q > 0) {
        steps.push(
          `Step ${stepNum}: Look at ${current}. ${b} goes in ${q} time(s). ${q} × ${b} = ${product}. ${current} − ${product} = ${rem}.`
        );
        quotient += String(q);
        stepNum++;
      } else if (i < dividendStr.length - 1) {
        steps.push(`Step ${stepNum}: Look at ${current}. ${b} doesn't go in, continue.`);
        stepNum++;
      }

      if (i < dividendStr.length - 1) {
        const nextDigit = dividendStr[i + 1];
        steps.push(`Bring down ${nextDigit} to make ${rem * 10 + Number(nextDigit)}.`);
      } else {
        if (rem > 0) {
          steps.push(`Final remainder: ${rem}.`);
        }
      }

      current = rem;
    }

    return steps;
  }

  return [];
}

// Read .env to get Supabase credentials
const env = readFileSync(".env", "utf8");
const anonKey = env
  .match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]
  ?.trim()
  .replace(/^["']|["']$/g, "");

if (!anonKey) {
  console.error("anon key not found in .env");
  process.exit(1);
}

const baseUrl = "https://aalqeqjlspxqhxohubfi.supabase.co";
const functionUrl = `${baseUrl}/functions/v1/practice-hint`;

const testCases = [
  {
    name: "Multiplication (French, hintLevel 1)",
    payload: {
      operation: "multiplication",
      problem: { a: 7, b: 8, answer: 56 },
      steps: computeSteps("multiplication", 7, 8),
      hintLevel: 1,
      language: "French",
    },
  },
  {
    name: "Subtraction (English, hintLevel 1, with borrow)",
    payload: {
      operation: "subtraction",
      problem: { a: 52, b: 27, answer: 25 },
      steps: computeSteps("subtraction", 52, 27),
      hintLevel: 1,
      language: "English",
    },
  },
  {
    name: "Division (French, hintLevel 1, long division standard)",
    payload: {
      operation: "division",
      problem: { a: 432, b: 5, answer: 86, remainder: 2 },
      steps: computeSteps("division", 432, 5, 2),
      hintLevel: 1,
      method: "long_division_standard",
      language: "French",
    },
  },
  {
    name: "Division (French, hintLevel 2, escalation)",
    payload: {
      operation: "division",
      problem: { a: 432, b: 5, answer: 86, remainder: 2 },
      steps: computeSteps("division", 432, 5, 2),
      hintLevel: 2,
      method: "long_division_standard",
      language: "French",
    },
  },
];

console.log("Testing practice-hint Edge Function\n");
console.log("=".repeat(80) + "\n");

for (const test of testCases) {
  console.log(`Test: ${test.name}`);
  console.log(`Payload:`);
  console.log(`  operation: ${test.payload.operation}`);
  console.log(`  problem: ${test.payload.problem.a} ${test.payload.operation === "subtraction" ? "−" : test.payload.operation === "multiplication" ? "×" : "÷"} ${test.payload.problem.b} = ${test.payload.problem.answer}`);
  console.log(`  hintLevel: ${test.payload.hintLevel}`);
  console.log(`  steps: ${test.payload.steps.length} steps`);
  if (test.payload.method) console.log(`  method: ${test.payload.method}`);
  console.log(`  language: ${test.payload.language}`);
  console.log("");

  try {
    const res = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(test.payload),
    });

    if (!res.ok) {
      console.error(`ERROR: HTTP ${res.status}`);
      console.error(await res.text());
      console.log("");
      continue;
    }

    const result = await res.json();
    console.log("Response JSON:");
    console.log(JSON.stringify(result, null, 2));
    console.log("");
    console.log("-".repeat(80) + "\n");
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    console.log("");
  }
}
