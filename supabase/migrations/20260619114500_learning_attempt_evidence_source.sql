alter table public.learning_attempts
  add column if not exists evidence_source text not null default 'unknown';

alter table public.learning_attempts
  drop constraint if exists learning_attempts_evidence_source_check;

alter table public.learning_attempts
  add constraint learning_attempts_evidence_source_check
  check (evidence_source in ('adaptive_practice', 'assigned_homework', 'word_problem', 'unknown'));

