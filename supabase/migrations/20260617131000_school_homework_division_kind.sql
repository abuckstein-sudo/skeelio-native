alter table public.school_homework_items
  drop constraint if exists school_homework_items_task_kind_check;

alter table public.school_homework_items
  add constraint school_homework_items_task_kind_check
  check (task_kind in ('generic', 'reading', 'spelling', 'multiplication', 'division', 'signature'));
