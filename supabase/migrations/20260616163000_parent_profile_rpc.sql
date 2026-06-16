create or replace function public.ensure_current_parent_profile(fallback_full_name text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := auth.email();
  current_name text := coalesce(
    nullif(auth.jwt()->'user_metadata'->>'full_name', ''),
    nullif(auth.jwt()->'user_metadata'->>'name', ''),
    nullif(fallback_full_name, ''),
    split_part(auth.email(), '@', 1),
    'Parent'
  );
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.users (id, email, role, full_name)
  values (current_user_id, current_email, 'parent', current_name)
  on conflict (id) do update
  set
    email = coalesce(public.users.email, excluded.email),
    role = coalesce(public.users.role, excluded.role),
    full_name = coalesce(nullif(public.users.full_name, ''), excluded.full_name);
end;
$$;

grant execute on function public.ensure_current_parent_profile(text) to authenticated;

