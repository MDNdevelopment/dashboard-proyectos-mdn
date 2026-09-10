-- Restringe la escritura de av_pauta_piezas: antes cualquier empleado con
-- audiovisual.manage (prácticamente todo el depto Audiovisual, ver 20260828000000) podía
-- insertar/actualizar/borrar piezas de CUALQUIER pauta. Ahora solo quien coordina
-- (audiovisual.coordina, admin o Lizdania) o el recurso que grabó esa pauta
-- (av_pautas.recurso_ids) puede escribir sus piezas. Espejo en frontend:
-- canEditPiezasForPauta en src/utils/audiovisual.js.
--
-- recurso_ids es text[]; se castea auth.uid() a text (ver bug de cast corregido en
-- 20260904000000_fix_av_pauta_creator_uuid_cast.sql).

drop policy "av_pauta_piezas_insert" on public.av_pauta_piezas;
drop policy "av_pauta_piezas_update" on public.av_pauta_piezas;
drop policy "av_pauta_piezas_delete" on public.av_pauta_piezas;

create policy "av_pauta_piezas_insert" on public.av_pauta_piezas
  for insert to authenticated
  with check (
    user_can('audiovisual.coordina')
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );

create policy "av_pauta_piezas_update" on public.av_pauta_piezas
  for update to authenticated
  using (
    user_can('audiovisual.coordina')
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  )
  with check (
    user_can('audiovisual.coordina')
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );

create policy "av_pauta_piezas_delete" on public.av_pauta_piezas
  for delete to authenticated
  using (
    user_can('audiovisual.coordina')
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );
