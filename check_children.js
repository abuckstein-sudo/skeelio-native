const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log("URL:", supabaseUrl);
console.log("Key exists:", !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data, error } = await supabase
      .from("children")
      .select("id, name")
      .limit(10);

    if (error) {
      console.error("Error:", error);
      return;
    }

    console.log("Children found:", data.length);
    data.forEach((c) => {
      console.log(`  - ${c.name} (${c.id})`);
    });
  } catch (e) {
    console.error("Exception:", e);
  }
}

check();
