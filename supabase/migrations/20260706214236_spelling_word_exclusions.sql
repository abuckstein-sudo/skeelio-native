-- Flag curriculum spelling words that should be excluded from child practice.
-- This keeps the sourced Dubois-Buyse rows intact while letting tier reads skip
-- words that are unsuitable for ages 6-10.

alter table public.spelling_curriculum_words
  add column if not exists excluded boolean,
  add column if not exists exclusion_reason text;

update public.spelling_curriculum_words
set excluded = false
where excluded is null;

alter table public.spelling_curriculum_words
  alter column excluded set default false,
  alter column excluded set not null;

update public.spelling_curriculum_words
set
  excluded = true,
  exclusion_reason = case word
    when 'pipe' then 'Smoking/adult object; exclude from young-child practice.'
    when 'arme' then 'Weapon; exclude from young-child practice.'
    when 'mort' then 'Death theme; exclude from young-child practice.'
    when 'tuer' then 'Violence/death verb; exclude from young-child practice.'
    when 'voleur' then 'Crime theme; exclude from young-child practice.'
    when 'crime' then 'Crime theme; exclude from young-child practice.'
    when 'prison' then 'Crime/punishment theme; exclude from young-child practice.'
    when 'canon' then 'Weapon/war theme; exclude from young-child practice.'
    when 'soldat' then 'War theme; exclude from young-child practice.'
    when 'vin' then 'Alcohol; exclude from young-child practice.'
    when 'bataille' then 'Violence/war theme; exclude from young-child practice.'
    when 'sang' then 'Blood/injury theme; exclude from young-child practice.'
    when 'mortel' then 'Death/fatality theme; exclude from young-child practice.'
    when 'tombeau' then 'Death/grave theme; exclude from young-child practice.'
    else 'Excluded from young-child practice.'
  end
where language = 'fr-FR'
  and (tier_id, word) in (
    ('SP1', 'pipe'),
    ('SP1', 'arme'),
    ('SP1', 'mort'),
    ('SP1', 'tuer'),
    ('SP2', 'voleur'),
    ('SP2', 'crime'),
    ('SP2', 'prison'),
    ('SP3', 'canon'),
    ('SP3', 'soldat'),
    ('SP3', 'vin'),
    ('SP4', 'bataille'),
    ('SP4', 'sang'),
    ('SP4', 'mortel'),
    ('SP4', 'tombeau')
  );

create index if not exists spelling_curriculum_words_active_tier_idx
  on public.spelling_curriculum_words (language, tier_id, strand, frequency)
  where excluded = false;
