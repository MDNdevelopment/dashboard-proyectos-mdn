-- Reparación puntual: Energon y Maxxis se movieron de Team Georgina a Team Sabrina antes de que
-- el reasignador de tareas estuviera desplegado, dejando sus tareas ABIERTAS descolgadas en la
-- línea vieja. Se reejecuta reassign_client_open_tasks contra la línea ACTUAL de cada cuenta:
-- mueve solo las abiertas (status <> 'Terminado') y les pone al jefe de la línea destino.
-- Idempotente: si las tareas ya están en la línea correcta, el UPDATE interno no cambia nada.
do $$
declare c record;
begin
  for c in
    select id, line_id from public.metric_clients
     where name in ('Energon','Maxxis') and line_id is not null
  loop
    perform public.reassign_client_open_tasks(c.id, c.line_id, null);
  end loop;
end $$;
