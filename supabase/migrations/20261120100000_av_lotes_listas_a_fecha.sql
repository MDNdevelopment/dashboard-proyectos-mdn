-- Piezas editadas «al último día del mes»: devuelve, por lote de edición, cuántas unidades estaban
-- listas en una fecha dada. Lo usan Reportes → Operaciones («6. Nº Piezas vs Piezas editadas») y
-- Audiovisual → Datos para que el número de un mes terminado quede fijo (ver
-- docs/arquitectura/audiovisual.md).
-- Depende de 20261102130000 (av_pieza_listas_log) y 20261102130200 (av_pieza_listas_a_fecha).
-- NO aplicar a producción sin confirmación del desarrollador.
--
-- · Una fila por lote (no por pauta y formato): así la lógica de negocio vive en JS y se prueba
--   con vitest, y Datos recibe los lotes con su `listas` reemplazado.
-- · Sin filtrar es_lote ni status: el contador vivo (av_pautas_sync_formato_counters) suma `listas`
--   de todas las filas del formato y un lote cancelado ya tiene listas = 0.
-- · NULL de av_pieza_listas_a_fecha ⇒ 0: cada alta queda en el historial, así que NULL significa
--   «el lote se creó después de esa fecha».
-- · Una fecha futura devuelve el valor vivo (último registro del historial), así que sirve también
--   para el mes en curso.
-- · SECURITY DEFINER con filtro explícito por la empresa de auth.uid(): la lectura de
--   av_pauta_piezas hoy es `using (true)`; si algún día se restringe, el reporte no quedaría en
--   cero sin aviso.

create or replace function public.av_lotes_listas_a_fecha(p_pauta_ids uuid[], p_fecha date)
returns table (pieza_id uuid, pauta_id uuid, formato text, listas int)
language sql
stable
security definer
set search_path = public
as $$
  select pz.id,
         pz.pauta_id,
         pz.formato,
         least(pz.cantidad, coalesce(public.av_pieza_listas_a_fecha(pz.id, p_fecha), 0))::int
    from public.av_pauta_piezas pz
   where pz.pauta_id = any(p_pauta_ids)
     and pz.company_id = (
       select u.company_id::text from public.users u where u.user_id = auth.uid()
     )
     and pz.formato is not null;
$$;

revoke execute on function public.av_lotes_listas_a_fecha(uuid[], date) from public, anon;
grant execute on function public.av_lotes_listas_a_fecha(uuid[], date) to authenticated, service_role;
