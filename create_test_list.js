const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestList() {
  try {
    // Get first child
    const { data: children, error: childError } = await supabase
      .from("children")
      .select("id, name, parent_id")
      .limit(1);

    if (childError || !children || children.length === 0) {
      console.error("No children found");
      return;
    }

    const childId = children[0].id;
    const parentId = children[0].parent_id || "test-user";
    const childName = children[0].name;

    console.log(`Creating test list for: ${childName} (${childId})`);

    // Create spelling list
    const { data: listData, error: listError } = await supabase
      .from("spelling_lists")
      .insert({
        user_id: parentId,
        student_id: childId,
        title: "Test Set",
        language: "English",
        source_type: "manual",
      })
      .select()
      .single();

    if (listError) {
      console.error("Error creating list:", listError);
      return;
    }

    const listId = listData.id;
    console.log(`✓ Created list: ${listId}`);

    // Create items
    const words = ["beautiful", "house", "yellow", "quiet", "friend"];
    const items = words.map((word, i) => ({
      user_id: parentId,
      student_id: childId,
      list_id: listId,
      item_text: word,
      normalized_text: word.toLowerCase(),
      language: "English",
      item_order: i + 1,
    }));

    const { data: itemsData, error: itemError } = await supabase
      .from("spelling_list_items")
      .insert(items)
      .select();

    if (itemError) {
      console.error("Error creating items:", itemError);
      return;
    }

    console.log(`✓ Created ${itemsData.length} items`);

    console.log("\n=== TEST DATA CREATED ===");
    console.log(`Child: ${childName}`);
    console.log(`List ID: ${listId}`);
    console.log(`Words: ${words.join(", ")}`);
  } catch (error) {
    console.error("Error:", error);
  }
}

createTestList();
