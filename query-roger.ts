import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  console.log("=== Querying children ===\n");
  const { data: children, error: childrenErr } = await supabase
    .from("children")
    .select("*");

  if (childrenErr) {
    console.error("Error:", childrenErr);
  } else {
    console.log(`Found ${children?.length || 0} children:`);
    children?.forEach((child: any) => {
      console.log(`  - ${child.name} (${child.id}), grade ${child.grade_level}`);
    });
  }

  const rogerId = "0b266a82-ec3c-4156-9c11-f954a3874a25";
  console.log(`\n=== Querying mastery for Roger (ID: ${rogerId}) ===\n`);

  const { data: mastery, error: masteryErr } = await supabase
    .from("skill_mastery")
    .select("*")
    .eq("child_id", rogerId);

  if (masteryErr) {
    console.error("Error:", masteryErr);
  } else {
    console.log(`Found ${mastery?.length || 0} mastery records:`);
    mastery?.forEach((m: any) => {
      const score = m.total_attempts > 0
        ? Math.round((m.correct_attempts / m.total_attempts) * 100)
        : 0;
      console.log(
        `  - ${m.topic} (${m.skill}): ${score}% (${m.correct_attempts}/${m.total_attempts} correct)`
      );
    });
  }

  if (!mastery || mastery.length === 0) {
    console.log(
      "\nNo mastery data found. Checking all children IDs in skill_mastery table..."
    );
    const { data: allMastery, error: allErr } = await supabase
      .from("skill_mastery")
      .select("child_id");

    if (allErr) {
      console.error("Error:", allErr);
    } else {
      const uniqueIds = [...new Set(allMastery?.map((m: any) => m.child_id))];
      console.log(`\nUnique child IDs with mastery data: ${uniqueIds.join(", ")}`);
    }
  }
}

main().catch(console.error);
