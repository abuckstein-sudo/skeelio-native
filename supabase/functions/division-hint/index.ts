import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Supabase Edge runtime requires .ts extension for relative imports.
import { callOpenAIChat, resetOpenAIChatBudget } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const SYSTEM = `You are Skeelio, an AI homework tutor for children aged 6-9.
RULES:
- Use warm, encouraging, age-appropriate language. Short sentences.
- You are GIVEN the exact, already-computed steps. NEVER do your own arithmetic, never change or invent a number. Only phrase the given steps in kid-friendly words.
- Never reveal the final answer in hint_1.
- If asked anything off-topic/harmful/personal, gently say "Let's keep this to math!"`;

function longDivisionSteps(dividend: number, divisor: number) {
  const digits = String(dividend).split("").map(Number);
  const steps: any[] = [];
  let remainder = 0, quotient = "";
  for (let i = 0; i < digits.length; i++) {
    const current = remainder * 10 + digits[i];
    const q = Math.floor(current / divisor);
    const product = q * divisor;
    remainder = current - product;
    quotient += String(q);
    steps.push({ current, quotientDigit: q, product, remainderAfter: remainder, nextDigit: digits[i + 1] ?? null });
  }
  return { steps, finalQuotient: parseInt(quotient, 10), finalRemainder: remainder };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  resetOpenAIChatBudget();
  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);
    const { dividend, divisor, methodName, methodDescription, attempt } = await req.json();
    if (dividend == null || divisor == null) return json({ error: "dividend and divisor are required" }, 400);

    const { steps, finalQuotient, finalRemainder } = longDivisionSteps(Number(dividend), Number(divisor));
    const stepLines = steps.map((s, i) =>
      `Step ${i + 1}: look at ${s.current}. ${divisor} goes into ${s.current} ${s.quotientDigit} time(s). ${s.quotientDigit} × ${divisor} = ${s.product}. ${s.current} − ${s.product} = ${s.remainderAfter}.` +
      (s.nextDigit != null ? ` Bring down the ${s.nextDigit} to make ${s.remainderAfter * 10 + s.nextDigit}.` : ``)
    ).join("\n");

    const methodLine = (methodName && methodDescription)
      ? `The child's school teaches division as "${methodName}": ${methodDescription} Use this method's vocabulary (divide, multiply, subtract, bring down).`
      : `Use standard long-division vocabulary (divide, multiply, subtract, bring down).`;

    const user = `A child (age 6-9) is dividing ${dividend} ÷ ${divisor}.${attempt ? ` Attempt #${attempt}.` : ""}
${methodLine}

Worked steps (already computed — DO NOT recompute or change any number):
${stepLines}
Final answer: ${finalQuotient}${finalRemainder ? ` remainder ${finalRemainder}` : ``}.

Write two progressive hints using ONLY the numbers above:
- hint_1: ONE warm sentence (<=18 words) for the FIRST step (how many times the divisor fits into the leading part). Do NOT reveal the final answer.
- hint_2: ONE warm sentence (<=18 words) for the NEXT action (multiply, subtract, bring down). Mention the final answer only if the division is fully complete.
Do NOT use dot arrays or reframe as sharing/repeated subtraction.

Return STRICT JSON only, keys: hint_1, hint_2, encouragement, parent_note. encouragement <12 words, parent_note <20 words.`;

    const res = await callOpenAIChat(OPENAI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
    });
    if (!res.ok) { const t = await res.text(); console.error("[division-hint] OpenAI error", res.status, t); return json({ error: "OpenAI request failed", status: res.status }, 502); }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[division-hint] RAW:", raw);
    let c = raw.trim();
    if (c.startsWith("```")) { const f = c.lastIndexOf("```"); if (f > 3) c = c.substring(c.indexOf("\n") + 1, f); }
    const a = c.indexOf("{"), b = c.lastIndexOf("}");
    if (a !== -1 && b !== -1 && b > a) c = c.substring(a, b + 1);
    let hint;
    try { hint = JSON.parse(c.trim()); } catch (err) { console.error("[division-hint] parse FAILED", err); return json({ error: "parse failed", raw }, 502); }
    return json({ ...hint, finalQuotient, finalRemainder }, 200);
  } catch (e) { console.error("[division-hint] error", e); return json({ error: String(e) }, 500); }
});

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
