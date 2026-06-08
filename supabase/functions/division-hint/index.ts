import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const SYSTEM = `You are Skeelio, an AI homework tutor for children aged 6-9.
RULES:
- Stay strictly on the math problem.
- Never give the final answer in hint_1.
- Use warm, encouraging, age-appropriate language. Short sentences.
- If asked anything off-topic, harmful, medical, violent, adult, or personal, gently say "Let's keep this to math!"
- Never collect personal info; never ask for location/contact.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);
    const { dividend, divisor, methodName, methodDescription, attempt } = await req.json();
    if (dividend == null || divisor == null) return json({ error: "dividend and divisor are required" }, 400);

    const hasMethod = !!(methodName && methodDescription);
    const methodBlock = hasMethod
      ? `This child's school teaches division using: ${methodName}.
Method description: ${methodDescription}
Coach the child through THIS method, step by step, for ${dividend} ÷ ${divisor}. Use the method's own vocabulary (divide, multiply, subtract, bring down). Do NOT use a different method, dot arrays, or reframe it as sharing or repeated subtraction.`
      : `Coach the child through ${dividend} ÷ ${divisor} in warm, concrete language.`;

    const user = `A child (age 6-9) is working on ${dividend} ÷ ${divisor}.${attempt ? ` Attempt #${attempt}.` : ""}

${methodBlock}

Rules:
- hint_1 must be ONE SHORT SENTENCE (<=18 words) giving the FIRST step. It must NOT state the final answer.
- hint_2 must be ONE SHORT SENTENCE (<=18 words) giving the NEXT step. It MAY state the final answer.
- Use the EXACT numbers given. Do not invent or recompute beyond the method's steps.
- Keep "encouragement" under 12 words and "parent_note" under 20 words.

Return STRICT JSON only (no prose, no markdown), keys: hint_1, hint_2, encouragement, parent_note.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [ { role: "system", content: SYSTEM }, { role: "user", content: user } ] }),
    });
    if (!res.ok) { const t = await res.text(); console.error("[division-hint] OpenAI error", res.status, t); return json({ error: "OpenAI request failed", status: res.status }, 502); }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[division-hint] RAW:", raw);
    let c = raw.trim();
    if (c.startsWith("```")) { const f = c.lastIndexOf("```"); if (f > 3) c = c.substring(c.indexOf("\n") + 1, f); }
    const s = c.indexOf("{"), e = c.lastIndexOf("}");
    if (s !== -1 && e !== -1 && e > s) c = c.substring(s, e + 1);
    let hint;
    try { hint = JSON.parse(c.trim()); } catch (err) { console.error("[division-hint] parse FAILED", err); return json({ error: "parse failed", raw }, 502); }
    return json(hint, 200);
  } catch (e) { console.error("[division-hint] error", e); return json({ error: String(e) }, 500); }
});

function json(body, status) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
