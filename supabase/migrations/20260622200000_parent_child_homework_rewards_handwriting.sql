alter table public.children
  add column if not exists allow_child_homework_entry boolean not null default false;

alter table public.school_homework_days
  drop constraint if exists school_homework_days_source_type_check;

alter table public.school_homework_days
  add constraint school_homework_days_source_type_check
  check (source_type in ('manual', 'photo', 'child'));

alter table public.school_homework_items
  drop constraint if exists school_homework_items_completed_by_check;

alter table public.school_homework_items
  add constraint school_homework_items_completed_by_check
  check (completed_by in ('child', 'adult', 'helper'));

alter table public.school_homework_items
  add column if not exists helper_name text;

alter table public.shop_items
  add column if not exists reward_type text not null default 'stars'
    check (reward_type in ('stars', 'behavior')),
  add column if not exists behavior_goal_type text
    check (behavior_goal_type in ('homework_days', 'practice_sessions', 'perfect_sessions', 'helper_confirmed')),
  add column if not exists behavior_goal_count integer
    check (behavior_goal_count is null or behavior_goal_count > 0);
