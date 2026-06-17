create table if not exists public.child_homework_limits (
  child_id uuid primary key references public.children(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  daily_limit_minutes integer check (daily_limit_minutes is null or daily_limit_minutes >= 1),
  unlocked_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.child_homework_limits enable row level security;

drop policy if exists "parents can manage own child homework limits" on public.child_homework_limits;
create policy "parents can manage own child homework limits"
  on public.child_homework_limits
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
