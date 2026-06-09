#!/usr/bin/env node

import { readFileSync } from "node:fs";

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
const functionUrl = `${baseUrl}/functions/v1/teach-tier`;

const testCases = [
  {
    name: "Multiplication (Roger, French, CE1)",
    payload: {
      operation: "multiplication",
      tierLabel: "×11, ×12",
      example: { a: 11, b: 7, answer: 77 },
      child: {
        name: "Roger",
        gradeLabel: "CE1 (France)",
        language: "French",
      },
    },
  },
  {
    name: "Division (Long division, French, with steps)",
    payload: {
      operation: "division",
      tierLabel: "Long division",
      example: { a: 432, b: 5, answer: 86, remainder: 2 },
      steps: [
        "Step 1: Look at 4. 5 doesn't go into 4, so look at 43.",
        "Step 2: 5 goes into 43 eight times (8 × 5 = 40). Write 8 above the 3. Subtract: 43 − 40 = 3.",
        "Step 3: Bring down the 2 to make 32.",
        "Step 4: 5 goes into 32 six times (6 × 5 = 30). Write 6 above the 2. Subtract: 32 − 30 = 2.",
        "Final answer: 86 remainder 2",
      ],
      method: "long_division_standard",
      child: { language: "French" },
    },
  },
  {
    name: "Addition (2-digit + 2-digit, English)",
    payload: {
      operation: "addition",
      tierLabel: "2-digit + 2-digit, carrying",
      example: { a: 47, b: 58, answer: 105 },
      child: { language: "English" },
    },
  },
];

console.log("Testing teach-tier Edge Function\n");
console.log("=".repeat(80) + "\n");

for (const test of testCases) {
  console.log(`Test: ${test.name}`);
  console.log(`Payload: ${JSON.stringify(test.payload, null, 2)}`);
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
