import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Supabase Edge runtime requires .ts extension for relative imports.
import { callOpenAIChat, resetOpenAIChatBudget } from "../_shared/openai.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

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
    const { strokes, width, height, language, questionText } = await req.json();
    if (!Array.isArray(strokes) || strokes.length === 0) {
      return json({ text: "" }, 200);
    }

    const compactStrokes = strokes.slice(0, 18).map((stroke: any) => ({
      points: Array.isArray(stroke?.points)
        ? stroke.points.slice(0, 220).map((point: any) => [
            Math.round(Number(point.x) || 0),
            Math.round(Number(point.y) || 0),
          ])
        : [],
    })).filter((stroke: any) => stroke.points.length > 1);

    const prompt = `You are recognizing a young child's short handwritten answer from stylus/finger stroke coordinates.

Canvas: ${Math.round(Number(width) || 0)} x ${Math.round(Number(height) || 0)}.
Language: ${language === "fr" ? "French" : "English"}.
Question context: ${String(questionText || "").slice(0, 300)}

Return STRICT JSON only: {"text":"recognized answer","confidence":0.0}

Rules:
- The answer is short: usually 1 word to a few words, or a simple number.
- confidence is a number from 0 to 1 for how sure you are that the text is correct.
- Use confidence below 0.75 when the strokes are ambiguous enough that a child should try again.
- Preserve French accents only when they are clear or strongly implied.
- Do not explain.
- If unreadable, return {"text":"","confidence":0}.

Strokes:
${JSON.stringify(compactStrokes)}`;

    const openaiRes = await callOpenAIChat(OPENAI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[recognize-handwriting-answer] OpenAI error", openaiRes.status, errText);
      return json({ error: "OpenAI request failed", status: openaiRes.status }, 502);
    }

    const data = await openaiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseJson(raw);
    const text = String(parsed?.text || "").trim();
    const rawConfidence = Number(parsed?.confidence);
    const confidence = Math.max(0, Math.min(1, Number.isFinite(rawConfidence) ? rawConfidence : (text ? 1 : 0)));
    return json({ text, confidence }, 200);
  } catch (error) {
    console.error("[recognize-handwriting-answer] unexpected error", error);
    return json({ error: String(error) }, 500);
  }
});

function parseJson(raw: string): any {
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
  try {
    return JSON.parse(cleanJson);
  } catch {
    return { text: "", confidence: 0 };
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
