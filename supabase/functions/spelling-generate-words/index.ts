import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const { language, count, gradeLevel, interests } = await req.json();
    if (!language || !count || !gradeLevel) {
      return json({ error: "language, count, and gradeLevel are required" }, 400);
    }

    const interestPhrase = interests && interests.length > 0
      ? ` themed loosely around ${interests.join(", ")}`
      : "";

    const prompt = `Generate exactly ${count} DISTINCT, age-appropriate spelling words in ${language} for a child in grade ${gradeLevel}${interestPhrase}.
Requirements:
- No proper nouns
- No duplicates
- Single words only (no phrases)
- Each word should be on a separate line
- Return ONLY the list of words, nothing else

Words:`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[spelling-generate-words] OpenAI error", openaiRes.status, errText);
      return json({ error: "OpenAI request failed", status: openaiRes.status }, 502);
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    if (!content || content.trim().length === 0) {
      console.error("[spelling-generate-words] Empty response from OpenAI");
      return json({ error: "Empty response from OpenAI" }, 502);
    }

    // Parse words from response (split by newlines, trim)
    const words = content
      .split("\n")
      .map((w: string) => w.trim())
      .filter((w: string) => w.length > 0 && !w.match(/^[\d\.\-]/)); // Remove empty, numbered lines

    if (words.length === 0) {
      console.error("[spelling-generate-words] No valid words parsed");
      return json({ error: "No valid words generated" }, 502);
    }

    console.log("[spelling-generate-words] generated", words.length, "words for grade", gradeLevel, ":", words.slice(0, 5).join(", "));
    return json({ words: words.slice(0, count) }, 200);
  } catch (e) {
    console.error("[spelling-generate-words] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
