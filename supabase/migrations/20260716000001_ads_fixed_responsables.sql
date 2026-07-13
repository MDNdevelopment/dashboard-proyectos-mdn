-- Responsables "fijas" para el selector de Responsable de Ads (además de las
-- jefas de línea): Katherine Mora y Paola Urdaneta. Mismo patrón de seguridad
-- que 20260713000001_tasks_view_all_flag.sql (match por nombre completo,
-- aborta si hay ambigüedad).
alter table public.users
  add column if not exists ads_responsable_fixed boolean not null default false;

do $$
declare matched_count int;
begin
  select count(*) into matched_count from public.users
  where first_name ilike 'katherine' and last_name ilike 'mora';

  if matched_count = 1 then
    update public.users set ads_responsable_fixed = true
    where first_name ilike 'katherine' and last_name ilike 'mora';
  elsif matched_count = 0 then
    raise notice 'ads_responsable_fixed: no user found matching Katherine Mora — flag not set.';
  else
    raise exception 'ads_responsable_fixed: % users match Katherine Mora — set flag manually to avoid ambiguity.', matched_count;
  end if;
end;
$$;

do $$
declare matched_count int;
begin
  select count(*) into matched_count from public.users
  where first_name ilike 'paola' and last_name ilike 'urdaneta';

  if matched_count = 1 then
    update public.users set ads_responsable_fixed = true
    where first_name ilike 'paola' and last_name ilike 'urdaneta';
  elsif matched_count = 0 then
    raise notice 'ads_responsable_fixed: no user found matching Paola Urdaneta — flag not set.';
  else
    raise exception 'ads_responsable_fixed: % users match Paola Urdaneta — set flag manually to avoid ambiguity.', matched_count;
  end if;
end;
$$;
