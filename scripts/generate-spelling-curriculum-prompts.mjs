#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const DEFAULT_TIERS = ["SP1", "SP2", "SP3", "SP4", "INV1", "INV2"];

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const tiers = argValue("--tiers", DEFAULT_TIERS.join(","))
  .split(",")
  .map((tier) => tier.trim())
  .filter(Boolean);
const batchSize = Number(argValue("--batch-size", "25"));
const limit = Number(argValue("--limit", "0"));
const pauseMs = Number(argValue("--pause-ms", "250"));
const dryRun = hasFlag("--dry-run");

if (!supabaseUrl || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let query = supabase
  .from("spelling_curriculum_words")
  .select("id, word, tier_id, strand, frequency, sentence", { count: "exact" })
  .eq("language", "fr-FR")
  .in("tier_id", tiers)
  .is("sentence", null)
  .order("tier_id", { ascending: true })
  .order("frequency", { ascending: true });

if (limit > 0) query = query.limit(limit);

const { data: words, error, count } = await query;
if (error) {
  console.error("Failed to fetch curriculum words:", error);
  process.exit(1);
}

console.log(`Found ${count ?? words.length} words without sentences for tiers ${tiers.join(", ")}.`);
console.log(`This run will process ${words.length} words${dryRun ? " (dry run)" : ""}.`);

if (dryRun) {
  const byTier = words.reduce((acc, row) => {
    acc[row.tier_id] = (acc[row.tier_id] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify(byTier, null, 2));
  process.exit(0);
}

for (let index = 0; index < words.length; index += batchSize) {
  const batch = words.slice(index, index + batchSize);
  console.log(`Processing batch ${index / batchSize + 1}: ${batch.length} words`);

  for (const row of batch) {
    const { data, error: invokeError } = await supabase.functions.invoke("spelling-sentence", {
      body: { word: row.word, language: "French" },
    });

    if (invokeError || !data?.sentence) {
      console.error("Sentence generation failed:", row.word, invokeError || data);
      continue;
    }

    const update = { sentence: data.sentence };
    if (data.audio_url) update.audio_url = data.audio_url;

    const { error: updateError } = await supabase
      .from("spelling_curriculum_words")
      .update(update)
      .eq("id", row.id);

    if (updateError) {
      console.error("Update failed:", row.word, updateError);
      continue;
    }

    console.log(`✓ ${row.tier_id} ${row.word}: ${data.sentence}`);
    if (pauseMs > 0) await sleep(pauseMs);
  }
}
