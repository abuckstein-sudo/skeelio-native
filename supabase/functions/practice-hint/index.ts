import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const body = await req.json();
    const { operation, problem, steps, hintLevel, method, language } = body;

    if (!operation || !problem || !steps || hintLevel == null) {
      return json(
        { error: "operation, problem, steps, and hintLevel are required" },
        400
      );
    }

    const { a, b, answer, remainder } = problem;
    if (a == null || b == null || answer == null) {
      return json({ error: "problem must have a, b, and answer" }, 400);
    }

    // Determine operation symbol
    let opSymbol = "+";
    let opName = "addition";
    if (operation === "subtraction") {
      opSymbol = "−";
      opName = "subtraction";
    } else if (operation === "multiplication") {
      opSymbol = "×";
      opName = "multiplication";
    } else if (operation === "division") {
      opSymbol = "÷";
      opName = "division";
    }

    // Build problem description
    let problemText = `${a} ${opSymbol} ${b}`;
    if (remainder != null && remainder > 0) {
      problemText += ` (expecting ${answer} remainder ${remainder})`;
    } else {
      problemText += ` (expecting ${answer})`;
    }

    // Determine how many steps to reveal based on hintLevel
    // Level 1: no steps revealed, just nudge to start
    // Level 2+: reveal progressively more steps
    const stepsToReveal = Math.max(0, hintLevel - 1);
    const revealedSteps = steps.slice(0, stepsToReveal);
    const revealsAnswer = hintLevel > steps.length;

    // Build steps context
    let stepsContext = `The worked steps (already computed — DO NOT recompute or change any number):\n${steps.join("\n")}`;
    if (revealedSteps.length > 0) {
      stepsContext += `\n\nSteps already revealed to the child:\n${revealedSteps.join("\n")}`;
    }

    // Build method context
    const methodLine = method
      ? `The child's school teaches ${opName} as "${method}".`
      : "";

    // System prompt
    const SYSTEM = `You are a warm, encouraging math tutor for children aged 6–10.
Give exactly ONE hint at a time.
NEVER do arithmetic. You are given the worked steps and the correct answer.
Only reference the EXACT numbers and answer provided.
Never invent, recompute, or change any number.
Respond in ${language || "English"}.`;

    // User prompt
    const user = `Problem: ${problemText} (in ${opName})
${methodLine}

${stepsContext}

The child is stuck and asking for help (hint level ${hintLevel}).
${revealedSteps.length > 0 ? `The first ${revealedSteps.length} step(s) have already been shown.` : "No steps have been revealed yet."}

Give exactly ONE piece of guidance:
${
  hintLevel === 1
    ? "Give a warm, gentle nudge to START the first step. Do NOT reveal the full step or the answer."
    : `Reveal the next step of guidance (step ${stepsToReveal + 1}), or if all steps are revealed, walk through the final calculation to the answer.`
}

If this hint reveals the final answer, set reveals_answer to true; otherwise false.

Return STRICT JSON only: { hint: string, reveals_answer: boolean }
All text in ${language || "English"}.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("[practice-hint] OpenAI error", res.status, t);
      return json({ error: "OpenAI request failed", status: res.status }, 502);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[practice-hint] RAW:", raw);

    // Parse JSON from response
    let c = raw.trim();
    if (c.startsWith("```")) {
      const f = c.lastIndexOf("```");
      if (f > 3) c = c.substring(c.indexOf("\n") + 1, f);
    }
    const a_idx = c.indexOf("{");
    const b_idx = c.lastIndexOf("}");
    if (a_idx !== -1 && b_idx !== -1 && b_idx > a_idx) {
      c = c.substring(a_idx, b_idx + 1);
    }

    let result;
    try {
      result = JSON.parse(c.trim());
    } catch (err) {
      console.error("[practice-hint] parse FAILED", err);
      return json({ error: "parse failed", raw }, 502);
    }

    return json(result, 200);
  } catch (e) {
    console.error("[practice-hint] error", e);
    return json({ error: String(e) }, 500);
  }
});
