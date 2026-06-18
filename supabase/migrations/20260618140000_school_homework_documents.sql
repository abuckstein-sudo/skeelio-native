alter table public.school_homework_items
  drop constraint if exists school_homework_items_task_kind_check;

alter table public.school_homework_items
  add constraint school_homework_items_task_kind_check
  check (task_kind in ('generic', 'reading', 'worksheet', 'spelling', 'multiplication', 'division', 'signature'));

alter table public.school_homework_materials
  drop constraint if exists school_homework_materials_material_type_check;

alter table public.school_homework_materials
  add constraint school_homework_materials_material_type_check
  check (material_type in ('image', 'text', 'document'));
