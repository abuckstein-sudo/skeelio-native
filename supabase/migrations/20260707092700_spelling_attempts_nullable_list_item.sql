-- Curriculum tier spelling attempts are not backed by a user spelling list item.
-- User-list attempts still write real list_id and item_id values.
alter table public.spelling_practice_attempts
  alter column list_id drop not null,
  alter column item_id drop not null;
