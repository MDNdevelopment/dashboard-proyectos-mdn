-- Varias marcas por tarea — mismo patrón que meetings.client_ids
-- (20260915000000_meetings_multi_client.sql) y cnp_requests.client_ids
-- (20260928000000_cnp_audiovisual_multi_client.sql): un arreglo posicional nuevo,
-- conservando `client_id`/`client` (texto legado) como la marca en la posición 0 para no
-- romper a quien todavía lee el escalar (monitor de Uso, MAPPI, snapshots de desempeño,
-- ceo-analysis).
alter table public.tasks add column if not exists client_ids uuid[] not null default '{}';

update public.tasks
   set client_ids = array[client_id]
 where client_id is not null and cardinality(client_ids) = 0;

create index if not exists tasks_client_ids_idx on public.tasks using gin (client_ids);

-- reassign_client_open_tasks (mover una marca de línea, 20260806040000) filtraba por
-- `client_id = p_client_id` — con el arreglo eso dejaría fuera las tareas donde la marca no
-- está en la posición 0. Se acota además a `cardinality(client_ids) <= 1`: solo se mueven de
-- línea (y de responsable) las tareas de ESA ÚNICA marca — una tarea que cubre varias marcas
-- puede pertenecer a líneas distintas, así que no se arrastra ni se reasigna automáticamente;
-- queda en su línea actual y se ajusta a mano si hace falta.
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
  select user_id into v_lead
    from public.metric_line_members
   where line_id = p_to_line_id and is_lead = true
   limit 1;

  update public.tasks
     set team_id      = p_to_line_id,
         assignee_ids = case when v_lead is not null then array[v_lead] else assignee_ids end,
         assignee_id  = coalesce(v_lead, assignee_id)
   where p_client_id = any(client_ids)
     and cardinality(client_ids) <= 1
     and status <> 'Terminado';
end;
$$;
