import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Supabase Edge runtime requires .ts extension for relative imports.
import { callOpenAIChat, resetOpenAIChatBudget } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are analyzing a worksheet image to detect the METHOD being taught.
Your task: Identify the specific PROCEDURE the worksheet demonstrates, not just the topic.

EXAMPLES OF METHODS:
- Multiplication: "partial_products" (break apart, multiply each place separately, sum), "standard_algorithm" (right-to-left with carries), "lattice_method", "area_model"
- Division: "long_division_standard", "short_division", "chunking"
- Addition/Subtraction: "column_method", "number_line", "breaking into parts"
- Fractions: "visual_area", "number_line", "equivalent_fractions_method"

CRITICAL: Respond ONLY with a valid JSON object — no explanation, no prose. Just the JSON.
{
  "subject": "multiplication|division|addition|subtraction|fractions|other",
  "method_name": "short_identifier_of_method",
  "method_description": "The step-by-step PROCEDURE shown. e.g. 'Partial products: multiply each digit place separately, write each partial product on its own row, then sum all rows'",
  "example_observed": "Brief note of what the worksheet showed. e.g. '23 × 14 solved by multiplying 23×4, then 23×10, writing products on separate lines, then adding'",
  "confidence": 0.0-1.0
}

Focus on the METHOD/PROCEDURE, not the topic. If multiple methods appear, pick the primary one demonstrated.`;

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
      console.error("[extract-method] OpenAI error", openaiRes.status, errText);
      return json({ error: "OpenAI request failed", status: openaiRes.status }, 502);
    }

    const data = await openaiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[extract-method] RAW response (full):", raw);

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
    console.log("[extract-method] cleaned JSON:", cleanJson.substring(0, 300));

    let extracted;
    try {
      extracted = JSON.parse(cleanJson);
    } catch (e) {
      console.error("[extract-method] JSON parse FAILED:", e);
      return json({ error: "Failed to parse method extraction", raw }, 502);
    }

    return json(extracted, 200);
  } catch (e) {
    console.error("[extract-method] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
