import { supabase } from "./supabase";

export async function addStars(childId: string, delta: number, streakBump: number = 0) {
  try {
    // Read current rewards
    const { data: existing, error: readError } = await supabase
      .from("rewards")
      .select("stars, streak_days")
      .eq("child_id", childId)
      .maybeSingle();

    if (readError) {
      console.error("[addStars] read error:", readError);
      return;
    }

    const newStars = (existing?.stars ?? 0) + delta;
    const newStreak = (existing?.streak_days ?? 0) + streakBump;

    if (existing) {
      // Update existing row
      const { error: updateError } = await supabase
        .from("rewards")
        .update({
          stars: newStars,
          streak_days: newStreak,
          updated_at: new Date().toISOString(),
        })
        .eq("child_id", childId);

      if (updateError) {
        console.error("[addStars] update error:", updateError);
        console.log("[addStars]", { childId, delta, error: updateError.message, newStars });
        return;
      }
    } else {
      // Insert new row
      const { error: insertError } = await supabase.from("rewards").insert({
        child_id: childId,
        stars: newStars,
        streak_days: newStreak,
      });

      if (insertError) {
        console.error("[addStars] insert error:", insertError);
        console.log("[addStars]", { childId, delta, error: insertError.message, newStars });
        return;
      }
    }

    console.log("[addStars]", { childId, delta, error: null, newStars });
  } catch (err) {
    console.error("[addStars] exception:", err);
    console.log("[addStars]", { childId, delta, error: String(err), newStars: undefined });
  }
}
