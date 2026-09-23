-- Dos huecos de permisos detectados con un caso real (empleada asignada como
-- grabadora/editora de pautas de Audiovisual que no podía guardar cambios):
--
-- 1. av_pauta_piezas: la política de UPDATE solo dejaba escribir a quien coordina
--    (audiovisual.coordina) o al recurso que grabó la pauta (av_pautas.recurso_ids, ver
--    20260910000000_av_piezas_restrict_recurso.sql). El editor asignado a la pieza
--    (av_pauta_piezas.editor_user_id) — que puede ser una persona distinta del recurso que
--    grabó — nunca tenía permiso para marcar el estado de SU PROPIA pieza. Espejo en
--    frontend: canActOnEditorGroup en src/utils/audiovisual.js.
--
-- 2. av_pautas: la política de UPDATE (20260824000000_av_pautas_open_manage_rls.sql) exige
--    audiovisual.coordina o audiovisual.manage (nivel >= 2), sin excepción para el recurso
--    asignado (recurso_ids). El recurso sí puede editar la sección "Captura por formato"
--    en el cliente (canEditPiezasForPauta ya lo permite), pero el UPDATE real a
--    grabacion_por_formato/piezas_por_formato/recurso_ids quedaba rechazado por RLS si el
--    recurso no tenía además audiovisual.manage — típico en empleados de nivel 1.

drop policy "av_pauta_piezas_update" on public.av_pauta_piezas;

create policy "av_pauta_piezas_update" on public.av_pauta_piezas
  for update to authenticated
  using (
    user_can('audiovisual.coordina')
    or auth.uid()::text = editor_user_id
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  )
  with check (
    user_can('audiovisual.coordina')
    or auth.uid()::text = editor_user_id
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );

drop policy "av_pautas_update" on public.av_pautas;

create policy "av_pautas_update" on public.av_pautas
  for update to authenticated
  using (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.manage')
    or auth.uid()::text = any(recurso_ids)
  )
  with check (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.manage')
    or auth.uid()::text = any(recurso_ids)
  );
