-- Abre la escritura de av_pautas a cualquier empleado con 'audiovisual.manage', sin exigir
-- membresía de línea (metric_line_members).
--
-- Contexto: "audiovisual.manage" (botón "Solicitar pauta") se abrió a todos los empleados
-- de la empresa (antes exigía nivel 2+); la mayoría de los empleados regulares nunca fueron
-- registrados como miembros de una metric_line (eso históricamente solo se hacía para
-- jefes/coordinadores de línea). El check `task_user_in_line(line_id)` de las políticas
-- insert/update/delete bloqueaba entonces el insert vía RLS ("new row violates row-level
-- security policy") para cualquier empleado sin línea, sin importar el cliente elegido.
--
-- Decisión: cualquier empleado con 'audiovisual.manage' puede solicitar/editar/borrar
-- pautas de cualquier cliente de la empresa (coherente con que el filtro de clientes del
-- lado cliente ya mostraba todos los clientes para quien no tiene línea asignada).
drop policy if exists "av_pautas_insert" on public.av_pautas;
drop policy if exists "av_pautas_update" on public.av_pautas;
drop policy if exists "av_pautas_delete" on public.av_pautas;

create policy "av_pautas_insert" on public.av_pautas
  for insert to authenticated
  with check (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  );

create policy "av_pautas_update" on public.av_pautas
  for update to authenticated
  using (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  )
  with check (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  );

create policy "av_pautas_delete" on public.av_pautas
  for delete to authenticated
  using (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  );
