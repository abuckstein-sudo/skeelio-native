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
    const { operation, tierLabel, example, steps, method, strategy, child } = body;

    if (!operation || !tierLabel || !example) {
      return json({ error: "operation, tierLabel, and example are required" }, 400);
    }

    if (!strategy) {
      return json({ error: "strategy is required" }, 400);
    }

    const { a, b, answer, remainder } = example;
    if (a == null || b == null || answer == null) {
      return json({ error: "example must have a, b, and answer" }, 400);
    }

    // Determine operation symbol and description
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

    // Build the worked example text
    let exampleText = `${a} ${opSymbol} ${b} = ${answer}`;
    if (remainder != null && remainder > 0) {
      exampleText += ` remainder ${remainder}`;
    }

    // Build steps description if provided
    let stepsText = "";
    if (steps && Array.isArray(steps) && steps.length > 0) {
      stepsText = `\nWorked steps (already computed — DO NOT recompute or change any number):\n${steps.join("\n")}`;
    }

    // Build method description if provided
    let methodLine = "";
    if (method) {
      methodLine = `\nUse this teaching method: ${method}`;
    }

    // Build child context if provided
    let childContext = "";
    if (child) {
      const parts = [];
      if (child.name) parts.push(`The child's name is ${child.name}`);
      if (child.gradeLabel) parts.push(`Grade: ${child.gradeLabel}`);
      if (child.interests && child.interests.length > 0) {
        parts.push(`Interests: ${child.interests.join(", ")}`);
      }
      if (parts.length > 0) {
        childContext = `\nChild context:\n${parts.join("\n")}`;
      }
    }

    // Determine language
    const language = child?.language || "English";

    // System prompt
    const SYSTEM = `You are a warm, encouraging elementary math tutor for children aged 6–10.
Teach in ${language}.
- Use short, concrete sentences.
- NEVER do arithmetic. You are given the worked example and correct answer. Only phrase the teaching around the exact given numbers and answer.
- Never change or invent a number.
- If anything is off-topic, gently redirect to math.`;

    // User prompt
    const user = `Teach this strategy for ${tierLabel} (${opName}):
"${strategy}"

The child has never done this before. Teach ONLY this given strategy. Use the worked example to ILLUSTRATE it, not to teach a different idea. Do NOT invent your own concept or method.

Worked example (already computed — DO NOT recompute or change any number):
${exampleText}${stepsText}${methodLine}${childContext}

Create a teaching introduction and walkthrough:
1. intro: 1–2 sentences that introduce and explain the given strategy
2. example_walkthrough: 2–4 short sentences showing how the strategy applies to this example, using the EXACT given numbers and answer
3. encouragement: 1 short forward-looking nudge like "Ready to try one?" or "Shall we practice?" (NOT praise — the child hasn't practiced yet)

Return STRICT JSON only with keys: intro, example_walkthrough (array of strings), encouragement.
All text in ${language}.`;

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
      console.error("[teach-tier] OpenAI error", res.status, t);
      return json({ error: "OpenAI request failed", status: res.status }, 502);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[teach-tier] RAW:", raw);

    // Parse JSON from response (handle markdown code blocks)
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
      console.error("[teach-tier] parse FAILED", err);
      return json({ error: "parse failed", raw }, 502);
    }

    // Ensure example_walkthrough is an array
    if (!Array.isArray(result.example_walkthrough)) {
      result.example_walkthrough = [result.example_walkthrough];
    }

    return json(result, 200);
  } catch (e) {
    console.error("[teach-tier] error", e);
    return json({ error: String(e) }, 500);
  }
});
