-- Tighten older policies/functions highlighted by Supabase Security Advisor.

do $$
begin
  if to_regprocedure('public.update_skill_mastery()') is not null then
    execute 'alter function public.update_skill_mastery() set search_path = public';
  end if;

  if to_regprocedure('public.update_skill_mastery_after_attempt()') is not null then
    execute 'alter function public.update_skill_mastery_after_attempt() set search_path = public';
  end if;

  if to_regprocedure('public.handle_new_parent_profile()') is not null then
    execute 'revoke execute on function public.handle_new_parent_profile() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.ensure_current_parent_profile(text)') is not null then
    execute 'alter function public.ensure_current_parent_profile(text) security invoker';
    execute 'revoke execute on function public.ensure_current_parent_profile(text) from public, anon';
    execute 'grant execute on function public.ensure_current_parent_profile(text) to authenticated';
  end if;
end $$;

do $$
begin
  if to_regclass('public.learning_session_summaries') is not null then
    execute 'drop policy if exists "Allow authenticated users to insert learning summaries" on public.learning_session_summaries';
    execute 'drop policy if exists "Allow authenticated users to read learning summaries" on public.learning_session_summaries';
    execute 'drop policy if exists "Allow authenticated users to update learning summaries" on public.learning_session_summaries';

    execute 'create policy "parents can read own learning summaries"
      on public.learning_session_summaries
      for select
      to authenticated
      using (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1
          from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )';

    execute 'create policy "parents can insert own learning summaries"
      on public.learning_session_summaries
      for insert
      to authenticated
      with check (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1
          from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )';

    execute 'create policy "parents can update own learning summaries"
      on public.learning_session_summaries
      for update
      to authenticated
      using (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1
          from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )
      with check (
        user_id = auth.uid()
        or parent_id = auth.uid()
        or exists (
          select 1
          from public.children c
          where c.id = learning_session_summaries.student_id
            and c.parent_id = auth.uid()
        )
      )';
  end if;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "TEMP allow anyone read spelling uploads" on storage.objects';
  end if;
end $$;
