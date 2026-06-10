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

    const { word, language } = await req.json();
    if (!word || !language) return json({ error: "word and language are required" }, 400);

    const prompt = `Write ONE short, natural sentence in ${language} for a 6–10 year old that uses the word '${word}'. Max ~12 words. The sentence MUST contain the word. Return only the sentence, no quotes, no explanation.`;

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
      console.error("[spelling-sentence] OpenAI error", openaiRes.status, errText);
      return json({ error: "OpenAI request failed", status: openaiRes.status }, 502);
    }

    const data = await openaiRes.json();
    const sentence = data.choices?.[0]?.message?.content ?? "";

    if (!sentence || sentence.trim().length === 0) {
      console.error("[spelling-sentence] Empty response from OpenAI");
      return json({ error: "Empty response from OpenAI" }, 502);
    }

    console.log("[spelling-sentence] generated sentence for", word, ":", sentence.substring(0, 100));
    return json({ sentence: sentence.trim() }, 200);
  } catch (e) {
    console.error("[spelling-sentence] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
