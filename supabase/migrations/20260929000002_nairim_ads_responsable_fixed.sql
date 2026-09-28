-- Agrega a Nairim Fernández como responsable "fija" del selector de Responsable
-- de Ads (además de Katherine Mora y Paola Urdaneta, ver
-- 20260716000001_ads_fixed_responsables.sql), sin ser jefa de línea. Mismo
-- patrón de seguridad: match por nombre completo, aborta si hay ambigüedad.
do $$
declare matched_count int;
begin
  select count(*) into matched_count from public.users
  where first_name ilike 'nairim' and last_name ilike 'fernández';

  if matched_count = 1 then
    update public.users set ads_responsable_fixed = true
    where first_name ilike 'nairim' and last_name ilike 'fernández';
  elsif matched_count = 0 then
    raise notice 'ads_responsable_fixed: no user found matching Nairim Fernández — flag not set.';
  else
    raise exception 'ads_responsable_fixed: % users match Nairim Fernández — set flag manually to avoid ambiguity.', matched_count;
  end if;
end;
$$;
