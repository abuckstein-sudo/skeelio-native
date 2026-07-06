-- Track whether a spelling attempt used help/hints.
-- Aaron applies this migration; do not apply automatically from the app.

alter table public.spelling_practice_attempts
  add column if not exists aided boolean;

update public.spelling_practice_attempts
set aided = false
where aided is null;

alter table public.spelling_practice_attempts
  alter column aided set default false,
  alter column aided set not null;
