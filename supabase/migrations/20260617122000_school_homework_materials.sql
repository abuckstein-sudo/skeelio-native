create table if not exists public.school_homework_materials (
  id uuid primary key default gen_random_uuid(),
  homework_item_id uuid not null references public.school_homework_items(id) on delete cascade,
  homework_day_id uuid not null references public.school_homework_days(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  material_type text not null check (material_type in ('image', 'text')),
  title text,
  storage_bucket text,
  storage_path text,
  text_content text,
  created_at timestamptz not null default now()
);

create index if not exists school_homework_materials_item_id_idx
  on public.school_homework_materials(homework_item_id, created_at);

create index if not exists school_homework_materials_child_id_idx
  on public.school_homework_materials(child_id);

alter table public.school_homework_materials enable row level security;

drop policy if exists "parents can manage own school homework materials" on public.school_homework_materials;
create policy "parents can manage own school homework materials"
  on public.school_homework_materials
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
