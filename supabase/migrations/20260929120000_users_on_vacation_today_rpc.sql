-- `vacations` tiene el SELECT restringido a 'empresa.vacaciones.manage' (nivel ≥ 4 + RRHH,
-- ver 20260828170000_restrict_vacations_select.sql). La hoja de "Clientes por social" la
-- descarga cualquier empleado desde Empresa → Clientes, y debe marcar con "(DE VACACIONES)"
-- al social que esté de vacaciones hoy — sin esta función esa marca solo aparecería para
-- dirección/RRHH y la hoja saldría distinta según quién la baje.
--
-- La función expone lo MÍNIMO: los user_id de la propia empresa que hoy están de vacaciones.
-- No devuelve fechas, ni motivo, ni el historial — eso sigue detrás de la capability.
create or replace function public.users_on_vacation_today()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  -- vacations.user_id/company_id son uuid; el resto de la app trabaja con user_id como text
  -- (metric_clients.social_manager_id, metric_line_members.user_id), así que se devuelve text.
  select v.user_id::text
  from public.vacations v
  where v.company_id = (select u.company_id from public.users u where u.user_id = auth.uid())
    and v.status <> 'rejected'
    and v.start_date <= current_date
    and v.end_date >= current_date
$$;

revoke all on function public.users_on_vacation_today() from public;
grant execute on function public.users_on_vacation_today() to authenticated;
