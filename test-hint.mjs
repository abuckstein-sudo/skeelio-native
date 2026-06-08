import { readFileSync } from "node:fs";
const env = readFileSync(".env", "utf8");
const anonKey = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!anonKey) { console.error("anon key not found in .env"); process.exit(1); }
const body = {
  dividend: 96, divisor: 4,
  methodName: "long_division_standard",
  methodDescription: "Long division: divide the leftmost part of the dividend by the divisor, multiply the divisor by the quotient, subtract the result, bring down the next digit of the dividend, repeat until all digits are processed.",
  attempt: 1,
};
const res = await fetch("https://aalqeqjlspxqhxohubfi.supabase.co/functions/v1/division-hint", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
  body: JSON.stringify(body),
});
console.log("HTTP", res.status);
console.log(await res.text());
