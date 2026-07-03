-- Skeelio schema baseline snapshot.
--
-- This migration is intentionally idempotent: CREATE TABLE IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, conditional policy replacement, and no data writes.
-- It is safe to run against the current live database as a no-op/reconciliation
-- baseline after review.
--
-- Source note: this file is reconstructed from repo-known schema facts in the
-- existing migrations and app references. The earlier live audit CSV artifacts
-- describing all live tables/policies were not present in this checkout.
-- Tables/functions still without complete repo source are listed at the end.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Parent profiles
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'parent',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_parent_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role, full_name)
  values (
    new.id,
    new.email,
    'parent',
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1), 'Parent')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_parent_profile();

create or replace function public.ensure_current_parent_profile(fallback_full_name text default null)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := auth.email();
  current_name text := coalesce(
    nullif(auth.jwt()->'user_metadata'->>'full_name', ''),
    nullif(auth.jwt()->'user_metadata'->>'name', ''),
    nullif(fallback_full_name, ''),
    split_part(auth.email(), '@', 1),
    'Parent'
  );
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.users (id, email, role, full_name)
  values (current_user_id, current_email, 'parent', current_name)
  on conflict (id) do update
  set
    email = coalesce(public.users.email, excluded.email),
    role = coalesce(public.users.role, excluded.role),
    full_name = coalesce(nullif(public.users.full_name, ''), excluded.full_name);
end;
$$;

revoke execute on function public.handle_new_parent_profile() from public, anon, authenticated;
revoke execute on function public.ensure_current_parent_profile(text) from public, anon;
grant execute on function public.ensure_current_parent_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Legacy core app tables. These predate tracked migrations, so the definitions
-- below are conservative app-known shapes rather than a full live dump.
-- ---------------------------------------------------------------------------

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age integer,
  grade_level text,
  school_system text,
  selected_avatar text,
  home_background text,
  pin text,
  pin_setup_required boolean not null default false,
  intro_seen boolean not null default false,
  preferred_language text,
  languages text[],
  focus_subjects text[],
  max_addition_number integer,
  max_times_table integer,
  math_subtraction_level integer,
  math_division_level integer,
  word_problems_enabled boolean not null default false,
  allow_child_homework_entry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.children
  add column if not exists pin_setup_required boolean not null default false,
  add column if not exists intro_seen boolean not null default false,
  add column if not exists allow_child_homework_entry boolean not null default false;

create table if not exists public.rewards (
  child_id uuid primary key references public.children(id) on delete cascade,
  stars integer not null default 0,
  streak_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  subject text not null,
  focus text,
  mode text not null default 'practice',
  question_count integer not null default 0,
  due_date date,
  status text not null default 'pending',
  progress_index integer,
  correct_count integer,
  custom_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  subject text,
  topic text,
  skill text,
  tier text,
  question_text text,
  was_correct boolean not null default false,
  ai_hint_used boolean not null default false,
  evidence_source text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.tutor_episodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  source text,
  image_path text,
  domain text,
  language text,
  grade_band text,
  concept jsonb,
  lesson text,
  status text not null default 'pending',
  mastered boolean not null default false,
  items_attempted integer not null default 0,
  first_try_correct integer not null default 0,
  unaided_streak_max integer not null default 0,
  due_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.episode_attempts (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.tutor_episodes(id) on delete cascade,
  parent_id uuid references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  sub_skill text,
  question text,
  expected_answer text,
  child_answer text,
  was_correct boolean not null default false,
  aided boolean not null default false,
  attempt_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.worksheets (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  image_path text,
  analysis jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.child_teaching_methods (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  operation text,
  method_name text,
  method_description text,
  created_at timestamptz not null default now()
);

create table if not exists public.spelling_lists (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_id uuid references auth.users(id) on delete cascade,
  title text,
  language text,
  created_at timestamptz not null default now()
);

create table if not exists public.spelling_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.spelling_lists(id) on delete cascade,
  word text not null,
  sentence text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.spelling_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.children(id) on delete cascade,
  list_id uuid references public.spelling_lists(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress',
  total_items integer not null default 0,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0
);

create table if not exists public.spelling_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.spelling_practice_sessions(id) on delete cascade,
  item_id uuid references public.spelling_list_items(id) on delete set null,
  student_id uuid references public.children(id) on delete cascade,
  list_id uuid references public.spelling_lists(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  item_text text,
  student_answer text,
  is_correct boolean not null default false,
  attempt_number integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.conjugation_questions (
  id uuid primary key default gen_random_uuid(),
  language text,
  verb text,
  verb_group text,
  tense text,
  pronoun text,
  correct_answer text,
  created_at timestamptz not null default now()
);

create table if not exists public.conjugation_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.children(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress',
  total_items integer not null default 0,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0
);

create table if not exists public.conjugation_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.conjugation_practice_sessions(id) on delete cascade,
  question_id uuid references public.conjugation_questions(id) on delete set null,
  student_id uuid references public.children(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  given_answer text,
  correct_answer text,
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Objectives and rewards
-- ---------------------------------------------------------------------------

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  title text not null,
  description text,
  cost_stars integer not null check (cost_stars > 0),
  category text,
  image_emoji text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  reward_type text not null default 'stars' check (reward_type in ('stars', 'behavior')),
  behavior_goal_type text check (behavior_goal_type in ('homework_days', 'practice_sessions', 'perfect_sessions', 'helper_confirmed')),
  behavior_goal_count integer check (behavior_goal_count is null or behavior_goal_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_items
  add column if not exists reward_type text not null default 'stars',
  add column if not exists behavior_goal_type text,
  add column if not exists behavior_goal_count integer;

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  shop_item_id uuid not null references public.shop_items(id) on delete cascade,
  stars_spent integer not null check (stars_spent > 0),
  status text not null default 'requested' check (
    status in ('requested', 'approved', 'rejected', 'fulfilled', 'cancelled')
  ),
  note text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_objectives (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  description text,
  subject text,
  skill_area text,
  target_type text not null check (target_type in ('stars', 'sessions', 'assignments', 'streak')),
  target_value integer not null check (target_value > 0),
  current_value integer not null default 0 check (current_value >= 0),
  reward_item_id uuid references public.shop_items(id) on delete set null,
  due_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists shop_items_parent_id_idx on public.shop_items(parent_id);
create index if not exists shop_items_child_id_idx on public.shop_items(child_id);
create index if not exists reward_redemptions_parent_id_idx on public.reward_redemptions(parent_id);
create index if not exists reward_redemptions_child_id_idx on public.reward_redemptions(child_id);
create index if not exists parent_objectives_parent_id_idx on public.parent_objectives(parent_id);
create index if not exists parent_objectives_child_id_idx on public.parent_objectives(child_id);

alter table public.shop_items enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.parent_objectives enable row level security;

drop policy if exists "parents can manage own shop items" on public.shop_items;
create policy "parents can manage own shop items"
  on public.shop_items
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and (
      child_id is null
      or exists (
        select 1 from public.children c
        where c.id = child_id and c.parent_id = auth.uid()
      )
    )
  );

drop policy if exists "parents can manage own reward redemptions" on public.reward_redemptions;
create policy "parents can manage own reward redemptions"
  on public.reward_redemptions
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.children c
      where c.id = child_id and c.parent_id = auth.uid()
    )
  );

drop policy if exists "parents can manage own objectives" on public.parent_objectives;
create policy "parents can manage own objectives"
  on public.parent_objectives
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.children c
      where c.id = child_id and c.parent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- School homework
-- ---------------------------------------------------------------------------

create table if not exists public.school_homework_days (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  homework_date date not null,
  source_type text not null default 'manual' check (source_type in ('manual', 'photo', 'child')),
  raw_input text,
  status text not null default 'active' check (status in ('active', 'complete', 'archived')),
  total_active_seconds integer not null default 0 check (total_active_seconds >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(child_id, homework_date)
);

create table if not exists public.school_homework_items (
  id uuid primary key default gen_random_uuid(),
  homework_day_id uuid not null references public.school_homework_days(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  task_text text not null,
  task_kind text not null default 'generic' check (
    task_kind in ('generic', 'reading', 'worksheet', 'spelling', 'multiplication', 'division', 'signature')
  ),
  status text not null default 'pending' check (
    status in ('pending', 'done', 'waiting_parent')
  ),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  linked_assignment_id uuid references public.assignments(id) on delete set null,
  linked_spelling_list_id uuid,
  completed_at timestamptz,
  completed_by text check (completed_by in ('child', 'adult', 'helper')),
  helper_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_homework_days
  add column if not exists total_active_seconds integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.school_homework_items
  add column if not exists linked_assignment_id uuid,
  add column if not exists linked_spelling_list_id uuid,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by text,
  add column if not exists helper_name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.school_homework_materials (
  id uuid primary key default gen_random_uuid(),
  homework_item_id uuid not null references public.school_homework_items(id) on delete cascade,
  homework_day_id uuid not null references public.school_homework_days(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  material_type text not null check (material_type in ('image', 'text', 'document')),
  title text,
  storage_bucket text,
  storage_path text,
  text_content text,
  category text not null default 'worksheet' check (category in ('agenda', 'worksheet', 'quiz')),
  created_at timestamptz not null default now()
);

alter table public.school_homework_materials
  add column if not exists category text not null default 'worksheet';

create table if not exists public.child_homework_limits (
  child_id uuid primary key references public.children(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  daily_limit_minutes integer check (daily_limit_minutes is null or daily_limit_minutes >= 1),
  unlocked_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_homework_days_parent_id_idx on public.school_homework_days(parent_id);
create index if not exists school_homework_days_child_date_idx on public.school_homework_days(child_id, homework_date);
create index if not exists school_homework_items_day_id_idx on public.school_homework_items(homework_day_id, sort_order);
create index if not exists school_homework_items_child_id_idx on public.school_homework_items(child_id);
create index if not exists school_homework_materials_item_id_idx on public.school_homework_materials(homework_item_id, created_at);
create index if not exists school_homework_materials_child_id_idx on public.school_homework_materials(child_id);
create index if not exists school_homework_materials_child_category_idx on public.school_homework_materials(child_id, category, created_at desc);

alter table public.school_homework_days enable row level security;
alter table public.school_homework_items enable row level security;
alter table public.school_homework_materials enable row level security;
alter table public.child_homework_limits enable row level security;

drop policy if exists "parents can manage own school homework days" on public.school_homework_days;
create policy "parents can manage own school homework days"
  on public.school_homework_days
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.children c
      where c.id = child_id and c.parent_id = auth.uid()
    )
  );

drop policy if exists "parents can manage own school homework items" on public.school_homework_items;
create policy "parents can manage own school homework items"
  on public.school_homework_items
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.children c
      where c.id = child_id and c.parent_id = auth.uid()
    )
  );

drop policy if exists "parents can manage own school homework materials" on public.school_homework_materials;
create policy "parents can manage own school homework materials"
  on public.school_homework_materials
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.children c
      where c.id = child_id and c.parent_id = auth.uid()
    )
  );

drop policy if exists "parents can manage own child homework limits" on public.child_homework_limits;
create policy "parents can manage own child homework limits"
  on public.child_homework_limits
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.children c
      where c.id = child_id and c.parent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Learning/tutor additive columns and security policies for legacy live tables.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.learning_attempts') is not null then
    alter table public.learning_attempts
      add column if not exists evidence_source text not null default 'unknown';
    alter table public.learning_attempts
      drop constraint if exists learning_attempts_evidence_source_check;
    alter table public.learning_attempts
      add constraint learning_attempts_evidence_source_check
      check (evidence_source in ('adaptive_practice', 'assigned_homework', 'word_problem', 'unknown'));
  end if;

  if to_regclass('public.tutor_episodes') is not null then
    alter table public.tutor_episodes add column if not exists due_date date;
  end if;

  if to_regclass('public.reading_texts') is not null then
    execute 'alter table public.reading_texts enable row level security';
    execute 'drop policy if exists "shared reading texts are readable" on public.reading_texts';
    execute $sql$create policy "shared reading texts are readable"
      on public.reading_texts
      for select
      to anon, authenticated
      using (true)$sql$;
  end if;

  if to_regclass('public.reading_questions') is not null then
    execute 'alter table public.reading_questions enable row level security';
    execute 'drop policy if exists "shared reading questions are readable" on public.reading_questions';
    execute $sql$create policy "shared reading questions are readable"
      on public.reading_questions
      for select
      to anon, authenticated
      using (
        exists (
          select 1
          from public.reading_texts rt
          where rt.id = reading_questions.text_id
        )
      )$sql$;
  end if;

  if to_regclass('public.learning_session_summaries') is not null then
    execute 'drop policy if exists "Allow authenticated users to insert learning summaries" on public.learning_session_summaries';
    execute 'drop policy if exists "Allow authenticated users to read learning summaries" on public.learning_session_summaries';
    execute 'drop policy if exists "Allow authenticated users to update learning summaries" on public.learning_session_summaries';

    execute $sql$create policy "parents can read own learning summaries"
      on public.learning_session_summaries
      for select
      to authenticated
      using (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1 from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )$sql$;

    execute $sql$create policy "parents can insert own learning summaries"
      on public.learning_session_summaries
      for insert
      to authenticated
      with check (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1 from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )$sql$;

    execute $sql$create policy "parents can update own learning summaries"
      on public.learning_session_summaries
      for update
      to authenticated
      using (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1 from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )
      with check (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1 from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )$sql$;
  end if;

  if to_regprocedure('public.update_skill_mastery()') is not null then
    execute 'alter function public.update_skill_mastery() set search_path = public';
  end if;

  if to_regprocedure('public.update_skill_mastery_after_attempt()') is not null then
    execute 'alter function public.update_skill_mastery_after_attempt() set search_path = public';
  end if;

  if to_regclass('public.latest_spelling_summary') is not null then
    execute 'alter view public.latest_spelling_summary set (security_invoker = true)';
  end if;

  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "TEMP allow anyone read spelling uploads" on storage.objects';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Known live/app objects still without complete CREATE source after this
-- baseline because the live audit CSV dump was unavailable locally:
-- learning_session_summaries, reading_questions, reading_texts,
-- latest_spelling_summary, update_skill_mastery(),
-- update_skill_mastery_after_attempt().
