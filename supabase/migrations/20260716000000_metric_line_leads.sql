-- Marca real de "líder de línea" (antes solo era convención: el nombre de la
-- línea coincidía con el nombre de pila de la jefa). Se guarda como dato en
-- vez de comparar nombres en cada consulta, para poder reasignar el liderazgo
-- desde la UI de Líneas más adelante sin tocar código.
alter table public.metric_line_members
  add column if not exists is_lead boolean not null default false;

-- Sembrado inicial: para cada línea, si existe (por compañía) un usuario cuyo
-- first_name coincide con el nombre de la línea, se le marca como líder —
-- agregándola como miembro si aún no lo era.
do $$
declare
  r record;
  matched_user text;
begin
  for r in select id, company_id, name from public.metric_lines loop
    select user_id::text into matched_user
    from public.users
    where company_id::text = r.company_id::text
      and first_name ilike r.name
    limit 1;

    if matched_user is not null then
      insert into public.metric_line_members (line_id, user_id, is_lead)
      values (r.id, matched_user, true)
      on conflict (line_id, user_id) do update set is_lead = true;
    end if;
  end loop;
end;
$$;
