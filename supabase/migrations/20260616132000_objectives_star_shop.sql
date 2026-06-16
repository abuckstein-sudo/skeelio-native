-- Draft migration for parent objectives and star shop.
-- Review before applying to production Supabase.

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
        select 1
        from public.children c
        where c.id = child_id
          and c.parent_id = auth.uid()
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
      select 1
      from public.children c
      where c.id = child_id
        and c.parent_id = auth.uid()
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
      select 1
      from public.children c
      where c.id = child_id
        and c.parent_id = auth.uid()
    )
  );

