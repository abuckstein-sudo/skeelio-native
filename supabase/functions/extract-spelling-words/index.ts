import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Supabase Edge runtime requires .ts extension for relative imports.
import { callOpenAIChat, resetOpenAIChatBudget } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are reading a spelling list from a photo of a child's worksheet. Extract each list ENTRY exactly as written, one per array element, preserving accents, apostrophes (e.g. l'éléphant), and articles (e.g. un animal, des animaux).

Rules:
- If an entry shows two forms separated by '/' (singular/plural, e.g. 'un animal/des animaux'), output BOTH as separate entries, each keeping its article: 'un animal' and 'des animaux'.
- Keep multi-word entries together (e.g. 'un cheval', 'l'affiche'); do NOT split them into individual words.
- Do not drop or merge entries; preserve their order.
- Ignore list titles/headings (e.g. 'Liste 25') and any numbering/bullets.
- If several lists are visible, extract ONLY the list that is fully visible and centered/boxed; ignore lists cut off at the edges.
- Detect the language (English or French).
- Return ONLY a JSON object, no explanation.

Return STRICT JSON format:
{
  "words": ["entry1", "entry2", ...],
  "language": "English" | "French"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  resetOpenAIChatBudget();

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || !mimeType) return json({ error: "imageBase64 and mimeType are required" }, 400);

    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const openaiRes = await callOpenAIChat(OPENAI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "user", content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ] },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[extract-spelling-words] OpenAI error", openaiRes.status, errText);
      return json({ error: "OpenAI request failed", status: openaiRes.status }, 502);
    }

    const data = await openaiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[extract-spelling-words] RAW response (first 300 chars):", raw.substring(0, 300));

    // Parse JSON from response
    let cleanJson = raw.trim();
    if (cleanJson.startsWith("```")) {
      const endFence = cleanJson.lastIndexOf("```");
      if (endFence > 3) cleanJson = cleanJson.substring(cleanJson.indexOf("\n") + 1, endFence);
    }
    const jsonStart = cleanJson.indexOf("{");
    const jsonEnd = cleanJson.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
    }
    cleanJson = cleanJson.trim();
    console.log("[extract-spelling-words] cleaned JSON:", cleanJson.substring(0, 300));

    let extracted;
    try {
      extracted = JSON.parse(cleanJson);
    } catch (e) {
      console.error("[extract-spelling-words] JSON parse FAILED:", e);
      return json({ error: "Failed to parse spelling words", raw }, 502);
    }

    // Validate structure
    if (!Array.isArray(extracted.words)) {
      console.error("[extract-spelling-words] words is not an array");
      return json({ error: "Invalid response: words must be an array" }, 502);
    }

    if (!extracted.language || !["English", "French"].includes(extracted.language)) {
      console.error("[extract-spelling-words] invalid language:", extracted.language);
      return json({ error: "Invalid language (must be English or French)" }, 502);
    }

    console.log("[extract-spelling-words] extracted", extracted.words.length, "words in", extracted.language);
    return json(extracted, 200);
  } catch (e) {
    console.error("[extract-spelling-words] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
