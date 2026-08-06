-- Permite mover una marca a una línea SIN jefe (p.ej. "Independientes", is_general): en ese
-- caso el usuario elige a mano el responsable de las tareas. reassign_client_open_tasks acepta
-- un responsable explícito; si no se pasa, usa el jefe de la línea destino (comportamiento previo).
-- Para el movimiento DIFERIDO se guarda el responsable elegido en metric_clients.pending_task_assignee
-- para que el cron lo aplique al flipear.

alter table public.metric_clients
  add column if not exists pending_task_assignee text;

-- Se reemplaza la versión de 2 args (migración 20260806040000) por una con responsable opcional.
drop function if exists public.reassign_client_open_tasks(uuid, uuid);

-- Reasignar tareas abiertas de una marca a la línea destino + responsable (explícito o jefe).
create or replace function public.reassign_client_open_tasks(
  p_client_id  uuid,
  p_to_line_id uuid,
  p_assignee   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee text;
begin
  if p_assignee is not null and p_assignee <> '' then
    v_assignee := p_assignee;
  else
    select user_id into v_assignee
      from public.metric_line_members
     where line_id = p_to_line_id and is_lead = true
     limit 1;
  end if;

  update public.tasks
     set team_id      = p_to_line_id,
         assignee_ids = case when v_assignee is not null then array[v_assignee] else assignee_ids end,
         assignee_id  = coalesce(v_assignee, assignee_id)
   where client_id = p_client_id
     and status <> 'Terminado';
end;
$$;

grant execute on function public.reassign_client_open_tasks(uuid, uuid, text) to authenticated;

-- Cron del movimiento diferido: usa el responsable guardado (si lo hay) y lo limpia al flipear.
create or replace function public.apply_due_client_line_moves()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, pending_line_id, pending_task_assignee
      from public.metric_clients
     where pending_line_id is not null
       and line_change_at <= (now() at time zone 'America/Caracas')::date
  loop
    perform public.reassign_client_open_tasks(r.id, r.pending_line_id, r.pending_task_assignee);

    update public.metric_clients
       set line_id                = pending_line_id,
           pending_line_id         = null,
           line_change_at          = null,
           pending_task_assignee   = null,
           social_manager_id       = null,
           designer_id             = null,
           audiovisual_ids         = '[]'::jsonb
     where id = r.id;
  end loop;
end;
$$;
