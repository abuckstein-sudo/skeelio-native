alter table public.children
add column if not exists pin_setup_required boolean not null default false,
add column if not exists intro_seen boolean not null default false;

update public.children
set
  pin_setup_required = false,
  intro_seen = true
where selected_avatar is not null
  and intro_seen = false;
