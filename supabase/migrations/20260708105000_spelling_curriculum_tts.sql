-- Neural TTS metadata for system spelling curriculum words.
-- Do not apply automatically; Aaron reviews and runs this migration.

alter table public.spelling_curriculum_words
  add column if not exists audio_url text,
  add column if not exists voice text,
  add column if not exists sentence_audio_url text;

create index if not exists spelling_curriculum_words_tts_missing_idx
  on public.spelling_curriculum_words (language, tier_id, frequency)
  where excluded = false and (audio_url is null or sentence_audio_url is null);
