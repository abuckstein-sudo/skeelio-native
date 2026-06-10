const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data, error } = await supabase
    .from("spelling_lists")
    .select("student_id")
    .order("student_id");

  if (error) {
    console.error("Error:", error);
    return;
  }

  const groups = {};
  for (const row of data) {
    groups[row.student_id] = (groups[row.student_id] || 0) + 1;
  }

  console.log("Student ID counts (grouped):");
  const sorted = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [id, count] of sorted) {
    console.log(`  ${id}: ${count} list(s)`);
  }
}

check().catch(console.error);
