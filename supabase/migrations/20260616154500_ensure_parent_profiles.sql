insert into public.users (id, email, role, full_name)
select
  users.id,
  users.email,
  'parent',
  coalesce(nullif(users.raw_user_meta_data->>'full_name', ''), split_part(users.email, '@', 1), 'Parent')
from auth.users
left join public.users public_users on public_users.id = users.id
where public_users.id is null;

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
