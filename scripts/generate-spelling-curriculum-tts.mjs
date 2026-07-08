#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const DEFAULT_TIERS = ["SP1", "SP2", "SP3", "SP4", "INV1", "INV2"];
const OPENAI_VOICES = ["alloy", "echo", "fable", "nova", "onyx", "shimmer"];
const DEFAULT_BUCKET = "spelling-audio";
const TTS_MODEL = "tts-1-hd";
const COST_PER_MILLION_CHARS_USD = 30;

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

function slugPart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "word";
}

function assignedVoice(stableIndex) {
  return OPENAI_VOICES[stableIndex % OPENAI_VOICES.length];
}

async function ensurePublicBucket(supabase, bucket) {
  const { data, error } = await supabase.storage.getBucket(bucket);
  if (!error && data) return;

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    allowedMimeTypes: ["audio/mpeg"],
    fileSizeLimit: 2 * 1024 * 1024,
  });
  if (createError) throw createError;
}

async function createSpeechMp3({ apiKey, input, voice }) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice,
      input,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS failed ${response.status}: ${errorText}`);
  }

  return response.arrayBuffer();
}

async function uploadMp3({ supabase, bucket, path, bytes }) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: "audio/mpeg",
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function generateClip({ supabase, bucket, apiKey, row, kind, input, voice }) {
  const path = `curriculum/${row.tier_id}/${row.strand}/${row.frequency}-${slugPart(row.word)}-${row.id}-${kind}.mp3`;
  const bytes = await createSpeechMp3({ apiKey, input, voice });
  return uploadMp3({ supabase, bucket, path, bytes });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const tiers = argValue("--tiers", DEFAULT_TIERS.join(","))
  .split(",")
  .map((tier) => tier.trim())
  .filter(Boolean);
const bucket = argValue("--bucket", DEFAULT_BUCKET);
const batchSize = Number(argValue("--batch-size", "20"));
const limit = Number(argValue("--limit", "0"));
const pauseMs = Number(argValue("--pause-ms", "500"));
const dryRun = hasFlag("--dry-run");

if (!supabaseUrl || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
  process.exit(1);
}

if (!dryRun && !openaiApiKey) {
  console.error("Set OPENAI_API_KEY before running TTS generation.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let query = supabase
  .from("spelling_curriculum_words")
  .select("id, word, tier_id, strand, frequency, language, sentence, audio_url, sentence_audio_url, voice", { count: "exact" })
  .eq("language", "fr-FR")
  .eq("excluded", false)
  .in("tier_id", tiers)
  .order("tier_id", { ascending: true })
  .order("strand", { ascending: true })
  .order("frequency", { ascending: true })
  .order("word", { ascending: true })
  .order("id", { ascending: true });

if (limit > 0) query = query.limit(limit);

const { data: rows, error, count } = await query;
if (error) {
  console.error("Failed to fetch curriculum words:", error);
  process.exit(1);
}

const candidates = (rows || []).map((row, index) => ({
  ...row,
  assignedVoice: row.voice || assignedVoice(index),
  stableIndex: index,
}));
const missingWordClips = candidates.filter((row) => !row.audio_url);
const missingSentenceClips = candidates.filter((row) => row.sentence && !row.sentence_audio_url);
const missingSentenceText = candidates.filter((row) => !row.sentence);
const totalChars = missingWordClips.reduce((sum, row) => sum + row.word.length, 0) +
  missingSentenceClips.reduce((sum, row) => sum + row.sentence.length, 0);
const estimatedCost = (totalChars / 1_000_000) * COST_PER_MILLION_CHARS_USD;
const voiceCounts = candidates.reduce((acc, row) => {
  acc[row.assignedVoice] = (acc[row.assignedVoice] || 0) + 1;
  return acc;
}, {});

console.log(`Fetched ${count ?? candidates.length} active fr-FR curriculum words for tiers ${tiers.join(", ")}.`);
console.log(`Storage bucket: ${bucket}`);
console.log(`TTS model: ${TTS_MODEL}`);
console.log(`Voice distribution: ${JSON.stringify(voiceCounts)}`);
console.log(`Missing word clips: ${missingWordClips.length}`);
console.log(`Missing sentence clips: ${missingSentenceClips.length}`);
console.log(`Rows without sentence text, skipped for sentence TTS: ${missingSentenceText.length}`);
console.log(`Estimated input characters: ${totalChars}`);
console.log(`Estimated TTS cost at $${COST_PER_MILLION_CHARS_USD}/1M chars: $${estimatedCost.toFixed(2)}`);

if (dryRun) {
  console.log("Dry run only. No OpenAI, storage, or database writes performed.");
  process.exit(0);
}

await ensurePublicBucket(supabase, bucket);

let generatedWordClips = 0;
let generatedSentenceClips = 0;
let updatedRows = 0;
let failedRows = 0;

for (let index = 0; index < candidates.length; index += batchSize) {
  const batch = candidates.slice(index, index + batchSize);
  console.log(`Processing batch ${index / batchSize + 1}: ${batch.length} words`);

  for (const row of batch) {
    const voice = row.assignedVoice;
    const update = {};

    try {
      if (!row.voice) update.voice = voice;

      if (!row.audio_url) {
        update.audio_url = await generateClip({
          supabase,
          bucket,
          apiKey: openaiApiKey,
          row,
          kind: "word",
          input: row.word,
          voice,
        });
        generatedWordClips += 1;
      }

      if (row.sentence && !row.sentence_audio_url) {
        update.sentence_audio_url = await generateClip({
          supabase,
          bucket,
          apiKey: openaiApiKey,
          row,
          kind: "sentence",
          input: row.sentence,
          voice,
        });
        generatedSentenceClips += 1;
      }

      if (Object.keys(update).length > 0) {
        const { error: updateError } = await supabase
          .from("spelling_curriculum_words")
          .update(update)
          .eq("id", row.id);
        if (updateError) throw updateError;
        updatedRows += 1;
      }

      console.log(`✓ ${row.tier_id} ${row.word} (${voice})`);
    } catch (err) {
      failedRows += 1;
      console.error(`✗ ${row.tier_id} ${row.word}:`, err);
    }

    if (pauseMs > 0) await sleep(pauseMs);
  }
}

console.log("TTS generation complete.");
console.log(JSON.stringify({
  updatedRows,
  generatedWordClips,
  generatedSentenceClips,
  failedRows,
}, null, 2));
