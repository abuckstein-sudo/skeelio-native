-- Allow curriculum-tier spelling practice sessions that are not backed by a user spelling list.
-- User-list practice still writes a real list_id; this only permits tier sessions to store null.

alter table public.spelling_practice_sessions
  alter column list_id drop not null;
