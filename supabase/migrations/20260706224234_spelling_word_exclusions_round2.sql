-- Round 2 spelling curriculum exclusions.
-- Flag confirmed unsuitable words for young-child spelling practice, and clear
-- their generated sentences so they cannot be served if a caller misses the
-- excluded=false filter.

update public.spelling_curriculum_words
set
  excluded = true,
  exclusion_reason = case word
    when 'carabine' then 'Weapon; exclude from young-child practice.'
    when 'sabre' then 'Weapon; exclude from young-child practice.'
    when 'cadavre' then 'Corpse/death theme; exclude from young-child practice.'
    when 'fumer' then 'Smoking/tobacco; exclude from young-child practice.'
    when 'tabac' then 'Tobacco; exclude from young-child practice.'
    when 'périr' then 'Death verb; exclude from young-child practice.'
    when 'jouir' then 'Mature/sexual ambiguity; exclude from young-child practice.'
    when 'vierge' then 'Mature/sexual/religious ambiguity; exclude from young-child practice.'
    when 'armée' then 'Military/war theme; exclude from young-child practice.'
    when 'gibier' then 'Hunting/killed-animal theme; exclude from young-child practice.'
    when 'esclave' then 'Slavery/mature historical theme; exclude from young-child practice.'
    when 'chasse' then 'Hunting theme; exclude from young-child practice.'
    when 'chasseur' then 'Hunting theme; exclude from young-child practice.'
    when 'coupable' then 'Crime/guilt theme; exclude from young-child practice.'
    when 'procureur' then 'Legal/criminal justice theme; exclude from young-child practice.'
    when 'victime' then 'Harm/crime-adjacent theme; exclude from young-child practice.'
    when 'juge' then 'Legal/criminal justice theme; exclude from young-child practice.'
    when 'tribunal' then 'Legal/criminal justice theme; exclude from young-child practice.'
    when 'punir' then 'Punishment theme; exclude from young-child practice.'
    when 'fou' then 'Insult/mental-health usage; exclude from young-child practice.'
    when 'sot' then 'Insult; exclude from young-child practice.'
    when 'menteur' then 'Insult/lying accusation; exclude from young-child practice.'
    when 'indigne' then 'Insult/shaming usage; exclude from young-child practice.'
    when 'diable' then 'Religious/scary figure; exclude from young-child practice.'
    when 'saint' then 'Religious content; exclude from young-child practice.'
    when 'dieu' then 'Religious content; exclude from young-child practice.'
    when 'messe' then 'Religious content; exclude from young-child practice.'
    when 'piété' then 'Religious content; exclude from young-child practice.'
    when 'prière' then 'Religious content; exclude from young-child practice.'
    when 'religion' then 'Religious content; exclude from young-child practice.'
    when 'sacré' then 'Religious/profanity ambiguity; exclude from young-child practice.'
    else 'Excluded from young-child practice.'
  end,
  sentence = null
where language = 'fr-FR'
  and (tier_id, word) in (
    ('SP2', 'chasse'),
    ('SP2', 'chasseur'),
    ('SP2', 'diable'),
    ('SP3', 'carabine'),
    ('SP3', 'coupable'),
    ('SP3', 'esclave'),
    ('SP3', 'fumer'),
    ('SP3', 'procureur'),
    ('SP3', 'punir'),
    ('SP3', 'sabre'),
    ('SP3', 'saint'),
    ('SP3', 'victime'),
    ('SP4', 'armée'),
    ('SP4', 'cadavre'),
    ('SP4', 'dieu'),
    ('SP4', 'fou'),
    ('SP4', 'gibier'),
    ('SP4', 'indigne'),
    ('SP4', 'jouir'),
    ('SP4', 'juge'),
    ('SP4', 'menteur'),
    ('SP4', 'messe'),
    ('SP4', 'périr'),
    ('SP4', 'piété'),
    ('SP4', 'prière'),
    ('SP4', 'religion'),
    ('SP4', 'sacré'),
    ('SP4', 'sot'),
    ('SP4', 'tabac'),
    ('SP4', 'tribunal'),
    ('SP4', 'vierge')
  );
