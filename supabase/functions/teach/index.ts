import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Supabase Edge runtime requires .ts extension for relative imports.
import { callOpenAIChat, resetOpenAIChatBudget } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEACH_PROMPT = (
  item: Record<string, unknown>,
  childAnswer: string,
  concept: Record<string, unknown>,
  language: string,
  gradeBand: string,
  attempt: number
) => {
  const attemptStyle =
    attempt === 1
      ? "Restate the rule with a CLEAR WORKED EXAMPLE. Show the steps."
      : attempt === 2
        ? "Use a DIFFERENT representation: break into smaller steps, or use a concrete word-picture / analogy. Do NOT repeat the explanation from attempt 1."
        : "Use the SIMPLEST POSSIBLE VERSION. A friendly analogy or the most concrete example. Do NOT repeat previous explanations.";

  return `You are a warm, encouraging tutor for a child aged 6–10 in grade/band ${gradeBand}. The child just got a problem wrong.

ITEM:
Question: ${item.question}
Correct answer: ${item.correct_answer}
Child's answer: ${childAnswer}
Sub-skill: ${item.sub_skill}
Concept: ${concept.label}

INSTRUCTION:
First, diagnose the child's mistake:
- RULE error: the grammar rule wasn't applied (e.g., forgot -s, used the wrong rule)
- SPELLING error: the rule WAS applied but the word is MISSPELLED — often phonetically, spelled the way it sounds (e.g., "leevres" for "livres", "mézon" for "maison")

THEN address the actual mistake in ${language}, in 2–4 short sentences + one tiny worked example:
- For SPELLING/phonetic: gently acknowledge what they got right, then say they spelled it the way it sounds and give the correct spelling clearly (you may spell it out letter by letter if helpful)
- For RULE: teach the rule as you normally would
Be warm and encouraging — never make the child feel bad.

ATTEMPT ${attempt}: ${attemptStyle}

IMPORTANT:
- GROUND everything in the correct answer: ${item.correct_answer}. Do NOT compute a new answer or contradict it.
- For attempt 2+, use a completely DIFFERENT explanation style from any previous attempt.
- Keep it simple for a ${gradeBand} student.
- Always reassure the child.
- NEVER conflate RULE and SPELLING errors — address what actually happened.

Return ONLY this JSON (no explanation):
{
  "explanation": "<2–4 sentences + one worked example, in ${language}>"
}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  resetOpenAIChatBudget();

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const input = await req.json();
    const item = input.item as Record<string, unknown>;
    const childAnswer = input.child_answer as string;
    const concept = input.concept as Record<string, unknown>;
    const language = input.language as string;
    const gradeBand = input.grade_band as string;
    const attempt = input.attempt as number || 1;

    if (!item || !childAnswer || !concept || !language || !gradeBand) {
      return json({ error: "Missing required fields: item, child_answer, concept, language, grade_band" }, 400);
    }

    const prompt = TEACH_PROMPT(item, childAnswer, concept, language, gradeBand, attempt);

    const response = await callOpenAIChat(OPENAI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[teach] openai error:", response.status);
      return json({ error: "Failed to generate explanation" }, 500);
    }

    const responseData = await response.json();
    const rawResponse = responseData.choices?.[0]?.message?.content ?? "";

    let explanation = "";
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        explanation = parsed.explanation || "Essaye encore!";
      } else {
        explanation = rawResponse;
      }
    } catch {
      explanation = rawResponse;
    }

    return json({
      explanation,
    }, 200);
  } catch (e) {
    console.error("[teach] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
