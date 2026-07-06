-- Prompt cache fields for system spelling curriculum words.
-- This table is separate from user-owned spelling_lists/spelling_list_items.
-- Do not apply automatically; Aaron reviews and runs this migration.

alter table public.spelling_curriculum_words
  add column if not exists sentence text,
  add column if not exists audio_url text;
