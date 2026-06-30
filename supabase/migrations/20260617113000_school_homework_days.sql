create table if not exists public.school_homework_days (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  homework_date date not null,
  source_type text not null default 'manual' check (source_type in ('manual', 'photo')),
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
    task_kind in ('generic', 'reading', 'spelling', 'multiplication', 'signature')
  ),
  status text not null default 'pending' check (
    status in ('pending', 'done', 'waiting_parent')
  ),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  linked_assignment_id uuid references public.assignments(id) on delete set null,
  linked_spelling_list_id uuid,
  completed_at timestamptz,
  completed_by text check (completed_by in ('child', 'adult')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_homework_days_parent_id_idx
  on public.school_homework_days(parent_id);

create index if not exists school_homework_days_child_date_idx
  on public.school_homework_days(child_id, homework_date);

create index if not exists school_homework_items_day_id_idx
  on public.school_homework_items(homework_day_id, sort_order);

create index if not exists school_homework_items_child_id_idx
  on public.school_homework_items(child_id);

alter table public.school_homework_days enable row level security;
alter table public.school_homework_items enable row level security;

drop policy if exists "parents can manage own school homework days" on public.school_homework_days;
create policy "parents can manage own school homework days"
  on public.school_homework_days
  for all
  using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (
      select 1
      from public.children c
      where c.id = child_id
        and c.parent_id = auth.uid()
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
      select 1
      from public.children c
      where c.id = child_id
        and c.parent_id = auth.uid()
    )
  );
