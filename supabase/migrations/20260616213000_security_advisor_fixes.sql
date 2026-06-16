-- Resolve Supabase Security Advisor findings without changing app behavior.
-- Reading passages/questions are shared curriculum content: keep them readable,
-- but block client-side writes by only defining SELECT policies.

do $$
begin
  if to_regclass('public.reading_texts') is not null then
    execute 'alter table public.reading_texts enable row level security';

    execute 'drop policy if exists "shared reading texts are readable" on public.reading_texts';
    execute 'create policy "shared reading texts are readable"
      on public.reading_texts
      for select
      to anon, authenticated
      using (true)';
  end if;

  if to_regclass('public.reading_questions') is not null then
    execute 'alter table public.reading_questions enable row level security';

    execute 'drop policy if exists "shared reading questions are readable" on public.reading_questions';
    execute 'create policy "shared reading questions are readable"
      on public.reading_questions
      for select
      to anon, authenticated
      using (
        exists (
          select 1
          from public.reading_texts rt
          where rt.id = reading_questions.text_id
        )
      )';
  end if;

  if to_regclass('public.latest_spelling_summary') is not null then
    execute 'alter view public.latest_spelling_summary set (security_invoker = true)';
  end if;
end $$;
