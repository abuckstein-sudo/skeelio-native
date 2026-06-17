import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are reading a school agenda photo for a primary-school child.

Extract only the homework tasks written for the visible day. Preserve the school language and accents.

Rules:
- Return each homework task as one clear line.
- Keep references such as R22 à R24, Liste 65, quiz 4, tables 1x à 5x exactly enough for the app to parse them.
- Ignore dates, signatures, teacher notes, doodles, parent notes, completed checkmarks, and unrelated surrounding text.
- If the agenda includes several days, prefer the day that is centered or most clearly filled in.
- Do not invent missing material or explanations.
- Return STRICT JSON only.

Format:
{
  "items": ["relire R22 à R24", "Pratique Liste 65"],
  "rawText": "relire R22 à R24\\nPratique Liste 65",
  "language": "English" | "French"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || !mimeType) return json({ error: "imageBase64 and mimeType are required" }, 400);

    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[extract-school-homework] OpenAI error", openaiRes.status, errText);
      return json({ error: "OpenAI request failed", status: openaiRes.status }, 502);
    }

    const data = await openaiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
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

    let extracted;
    try {
      extracted = JSON.parse(cleanJson.trim());
    } catch (error) {
      console.error("[extract-school-homework] JSON parse failed", error);
      return json({ error: "Failed to parse homework extraction", raw }, 502);
    }

    const items = Array.isArray(extracted.items)
      ? extracted.items.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];

    const language = extracted.language === "English" ? "English" : "French";
    const rawText = String(extracted.rawText || items.join("\n")).trim();

    return json({ items, rawText, language }, 200);
  } catch (error) {
    console.error("[extract-school-homework] unexpected error", error);
    return json({ error: String(error) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
