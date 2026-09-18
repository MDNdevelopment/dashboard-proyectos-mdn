-- Al mover una marca de línea con prorrateo ("Pasan a línea nueva este mes"), el frontend
-- necesita upsertear metric_reports de AMBAS líneas (origen y destino) en el mismo mes. La
-- policy metric_reports_insert (20260828160400) solo permite escribir en la línea de la que
-- el usuario es miembro (o ver_all/admin) — un jefe de línea (nivel 3) que mueve una cuenta
-- HACIA su propia línea no es miembro de la línea de origen ajena, así que el upsert a esa
-- línea viola RLS ("new row violates row-level security policy for table metric_reports").
--
-- Se resuelve igual que reassign_client_open_tasks (20260806040000/20260806050000): una
-- función SECURITY DEFINER que valida acceso solo a la línea DESTINO (la que el usuario
-- controla) y escribe los dos reportes con privilegios elevados.

create or replace function public.move_client_line_reports(
  p_company_id   uuid,
  p_from_line_id uuid,
  p_to_line_id   uuid,
  p_year         int,
  p_month        int,
  p_from_data    jsonb,
  p_to_data      jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = p_to_line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  ) then
    raise exception 'No tienes permiso para mover cuentas a esta línea';
  end if;

  if p_from_line_id is not null then
    insert into public.metric_reports (company_id, line_id, year, month, data, updated_at)
    values (p_company_id, p_from_line_id, p_year, p_month, p_from_data, now())
    on conflict (line_id, year, month)
    do update set data = excluded.data, updated_at = excluded.updated_at, company_id = excluded.company_id;
  end if;

  insert into public.metric_reports (company_id, line_id, year, month, data, updated_at)
  values (p_company_id, p_to_line_id, p_year, p_month, p_to_data, now())
  on conflict (line_id, year, month)
  do update set data = excluded.data, updated_at = excluded.updated_at, company_id = excluded.company_id;
end;
$$;

grant execute on function public.move_client_line_reports(uuid, uuid, uuid, int, int, jsonb, jsonb) to authenticated;
