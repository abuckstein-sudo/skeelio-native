-- Track whether a conjugation answer used per-question help before submission.
-- Aaron applies this migration manually; do not apply automatically from the app.

alter table public.conjugation_practice_attempts
  add column if not exists aided boolean default false;

update public.conjugation_practice_attempts
set aided = false
where aided is null;

alter table public.conjugation_practice_attempts
  alter column aided set default false,
  alter column aided set not null;
