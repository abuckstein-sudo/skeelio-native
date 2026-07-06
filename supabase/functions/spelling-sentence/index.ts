import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Supabase Edge runtime requires .ts extension for relative imports.
import { callOpenAIChat, resetOpenAIChatBudget } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  resetOpenAIChatBudget();

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const { word, language } = await req.json();
    if (!word || !language) return json({ error: "word and language are required" }, 400);

    const prompt = `Write ONE short, natural sentence in ${language} for a 6–10 year old that uses the word '${word}'.

Rules:
- Return only the sentence, no quotes, no explanation.
- The sentence MUST contain the word exactly as written.
- Use simple present tense when natural.
- Use a concrete, kid-friendly context.
- Keep it short: ideally 6–10 words, max ~12 words.
- Make the French natural and idiomatic.
- Prefer a simple third-person or descriptive sentence over "Je..." openings.
- Avoid repetitive starts like "Je joue...", "J'aime...", "Nous allons...", or "Il y a..." unless clearly best.
- Use natural French collocations. For example, say "dans la rue", never "sur la rue".
- Avoid weapons, smoking, alcohol, romance, death, or scary/adult contexts.`;

    const openaiRes = await callOpenAIChat(OPENAI_API_KEY, {
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
