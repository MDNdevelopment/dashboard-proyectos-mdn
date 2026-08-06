-- Al mover una marca de línea, sus tareas ABIERTAS (status <> 'Terminado') pasan a la línea
-- nueva y su responsable pasa a ser el JEFE de la línea destino (metric_line_members.is_lead).
-- Las tareas 'Terminado' se dejan intactas (histórico de completadas).
--
-- Se implementa como función SECURITY DEFINER reutilizable: la llama el movimiento inmediato
-- (frontend, metricsApi.moveClientToLine) y el cron del movimiento diferido
-- (apply_due_client_line_moves, migración 20260806030000). SECURITY DEFINER evita problemas de
-- RLS (mover tareas de la línea vieja, donde el usuario podría no ser miembro).

-- ── Reasignar las tareas abiertas de una marca a la línea destino + su jefe ──
create or replace function public.reassign_client_open_tasks(
  p_client_id  uuid,
  p_to_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead text;
begin
  -- Jefe de la línea destino (si tiene). Si no hay jefe, se conservan los responsables actuales.
  select user_id into v_lead
    from public.metric_line_members
   where line_id = p_to_line_id and is_lead = true
   limit 1;

  update public.tasks
     set team_id      = p_to_line_id,
         assignee_ids = case when v_lead is not null then array[v_lead] else assignee_ids end,
         assignee_id  = coalesce(v_lead, assignee_id)
   where client_id = p_client_id
     and status <> 'Terminado';
end;
$$;

grant execute on function public.reassign_client_open_tasks(uuid, uuid) to authenticated;

-- ── Cron del movimiento diferido: además de flipear la línea, mover sus tareas ──
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
    select id, pending_line_id
      from public.metric_clients
     where pending_line_id is not null
       and line_change_at <= (now() at time zone 'America/Caracas')::date
  loop
    -- 1. Mover las tareas abiertas de la marca a la línea nueva + jefe destino.
    perform public.reassign_client_open_tasks(r.id, r.pending_line_id);

    -- 2. Aplicar el flip de la marca (y limpiar staff, igual que el mover inmediato).
    update public.metric_clients
       set line_id           = pending_line_id,
           pending_line_id    = null,
           line_change_at     = null,
           social_manager_id  = null,
           designer_id        = null,
           audiovisual_ids    = '[]'::jsonb
     where id = r.id;
  end loop;
end;
$$;
