alter table public.school_homework_materials
  add column if not exists category text not null default 'worksheet';

alter table public.school_homework_materials
  drop constraint if exists school_homework_materials_category_check;

alter table public.school_homework_materials
  add constraint school_homework_materials_category_check
  check (category in ('agenda', 'worksheet', 'quiz'));

create index if not exists school_homework_materials_child_category_idx
  on public.school_homework_materials(child_id, category, created_at desc);
