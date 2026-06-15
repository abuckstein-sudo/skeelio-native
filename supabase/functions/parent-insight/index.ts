import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParentInsightResponse {
  noticed: string;
  learning: { label: string; plain: string };
  tips: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const input = await req.json();
    const childId = input.childId as string;

    if (!childId) {
      return json({ error: "childId is required" }, 400);
    }

    // Get the authenticated user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Verify the child belongs to the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: childData, error: childError } = await supabase
      .from("children")
      .select("id, parent_id")
      .eq("id", childId)
      .eq("parent_id", user.id)
      .single();

    if (childError || !childData) {
      return json({ error: "Child not found or access denied" }, 403);
    }

    // Gather facts
    // 1. Recent episodes (last 5 completed)
    const { data: recentEpisodes } = await supabase
      .from("tutor_episodes")
      .select("id, concept, mastered, first_try_correct, items_attempted, created_at")
      .eq("child_id", childId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(5);

    // 2. Weak sub-skills from those episodes
    const weakSubSkills: Record<string, number> = {};
    if (recentEpisodes && recentEpisodes.length > 0) {
      const episodeIds = recentEpisodes.map((e) => e.id);
      const { data: attempts } = await supabase
        .from("episode_attempts")
        .select("sub_skill, was_correct")
        .in("episode_id", episodeIds);

      if (attempts) {
        for (const attempt of attempts) {
          if (!attempt.was_correct && attempt.sub_skill) {
            weakSubSkills[attempt.sub_skill] = (weakSubSkills[attempt.sub_skill] || 0) + 1;
          }
        }
      }
    }

    const topWeakSkills = Object.entries(weakSubSkills)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map((e) => e[0]);

    // 3. Current math from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: currentMathAttempts } = await supabase
      .from("learning_attempts")
      .select("subject, topic, skill")
      .eq("child_id", childId)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    const currentMath = currentMathAttempts && currentMathAttempts.length > 0
      ? currentMathAttempts[0]
      : null;

    // 4. Determine current_focus
    const recentEpisodeTime = recentEpisodes && recentEpisodes.length > 0
      ? new Date(recentEpisodes[0].created_at).getTime()
      : 0;
    const currentMathTime = currentMath
      ? new Date(currentMath.created_at as string).getTime()
      : 0;

    const currentFocus = recentEpisodeTime >= currentMathTime
      ? { label: recentEpisodes?.[0]?.concept?.label || "", type: "episode" }
      : currentMath
        ? { label: currentMath.topic || currentMath.skill || "", type: "math" }
        : { label: "", type: "none" };

    // If no recent activity, return friendly invitation
    if (!recentEpisodes || recentEpisodes.length === 0) {
      const result: ParentInsightResponse = {
        noticed: "No practice sessions yet — scan a worksheet to get started and we'll show you what's happening!",
        learning: { label: "", plain: "" },
        tips: [],
      };
      return json(result, 200);
    }

    // Build facts summary for the model
    const factsSummary = `
Recent Episodes: ${recentEpisodes
      .map(
        (e) =>
          `${e.concept?.label || "Unknown"} (${e.mastered ? "mastered" : "needs practice"}, ${e.first_try_correct}/${e.items_attempted} correct on first try)`
      )
      .join("; ")}

${topWeakSkills.length > 0 ? `Areas for practice: ${topWeakSkills.join(", ")}` : ""}

Current focus: ${currentFocus.label}
`;

    const modelPrompt = `You are writing a brief, warm, HONEST note to a parent about their 6–10 year old's learning. Use ONLY these facts — never invent skills, numbers, or outcomes. If a strength and a still-developing area both exist, name both gently and honestly.

FACTS:
${factsSummary}

Return ONLY valid JSON (no markdown fences):
{
  "noticed": "<1–2 sentences: what the child practiced recently and how it went>",
  "learning": {
    "label": "<current_focus label or short phrase>",
    "plain": "<1–2 sentences explaining that concept in plain parent terms and why it matters>"
  },
  "tips": ["<2–3 short, fun, low-prep activities a parent can do at home to reinforce this focus>"]
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: modelPrompt }],
      }),
    });

    if (!response.ok) {
      console.error("[parent-insight] openai error:", response.status);
      // Return with facts but no model content
      const result: ParentInsightResponse = {
        noticed: "Learning is happening! Scan a worksheet to see more details.",
        learning: { label: currentFocus.label, plain: "" },
        tips: [],
      };
      return json(result, 200);
    }

    const responseData = await response.json();
    const rawResponse = responseData.choices?.[0]?.message?.content ?? "";

    let modelResult: ParentInsightResponse = {
      noticed: "",
      learning: { label: currentFocus.label, plain: "" },
      tips: [],
    };

    try {
      // Strip markdown fences if present
      let cleanJson = rawResponse.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(cleanJson);
      modelResult = {
        noticed: parsed.noticed || "",
        learning: parsed.learning || { label: currentFocus.label, plain: "" },
        tips: Array.isArray(parsed.tips) ? parsed.tips : [],
      };
    } catch (e) {
      console.error("[parent-insight] json parse error:", e);
      // Fallback to basic response
      modelResult = {
        noticed: "Learning is happening! Check the details below.",
        learning: { label: currentFocus.label, plain: "" },
        tips: [],
      };
    }

    return json(modelResult, 200);
  } catch (e) {
    console.error("[parent-insight] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
