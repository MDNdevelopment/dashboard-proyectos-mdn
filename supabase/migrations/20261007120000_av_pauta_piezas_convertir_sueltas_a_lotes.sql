-- Convierte las filas sueltas (es_lote = false, una pieza por fila) del modelo viejo al modelo
-- de lotes, para que TODAS las pautas se puedan editar igual en la sección Edición.
--
-- Hasta ahora una sola fila suelta dejaba la pauta entera en "registro anterior, solo
-- lectura" (isLegacyPiezas). Aquí cada grupo (pauta, editor, formato) de sueltas pasa a ser
-- un lote con cantidad = nº de piezas y listas = nº de piezas en 'listo', que es exactamente
-- el resumen que mostraba la tabla de solo lectura (legacyEditorSummary).
--
-- Reglas:
--  1) Las sueltas canceladas se borran: ya no contaban en ningún total.
--  2) Una suelta sin formato pasa al formato de video de la pauta con más `salieron` (V si
--     empatan o si la pauta solo tiene uno de los dos).
--  3) Si el (pauta, editor, formato) YA tiene un lote, el lote gana y las sueltas se
--     descartan SIN sumarse: en estos casos el mismo trabajo quedó registrado dos veces (lote
--     y sueltas), y `salieron` coincide con el lote, no con la suma. El lote hereda las
--     `listas` de las sueltas si eran más, sin pasar de su cantidad (misma idea que
--     20261006160000, pero sin exigir que las cantidades cuadren exactamente).
--  4) Si no hay lote, la suelta más antigua del grupo se convierte en el lote (conserva su
--     created_at, para que Evaluaciones no mueva trabajo viejo al mes actual) y las demás se
--     borran. Un grupo sin editor queda como lote huérfano (editor_user_id null), que la UI
--     ya muestra como "Sin editor".
-- Los triggers de la tabla recalculan status y los contadores de la pauta.

-- 1) Canceladas
delete from public.av_pauta_piezas
where es_lote = false
  and status = 'cancelado';

-- 2) Sueltas sin formato → formato de video de la pauta
update public.av_pauta_piezas p
set formato = case
  when 'V' = any(a.formats) and 'R' = any(a.formats) then
    case
      when coalesce((a.piezas_por_formato->'R'->>'salieron')::int, 0)
         > coalesce((a.piezas_por_formato->'V'->>'salieron')::int, 0) then 'R'
      else 'V'
    end
  when 'R' = any(a.formats) then 'R'
  when 'V' = any(a.formats) then 'V'
  else null
end
from public.av_pautas a
where p.pauta_id = a.id
  and p.es_lote = false
  and p.formato is null;

-- 3) Grupos que ya tienen lote: el lote gana
update public.av_pauta_piezas l
set listas = least(l.cantidad, greatest(l.listas, s.listas_sueltas))
from (
  select pauta_id, editor_user_id, formato, count(*) filter (where status = 'listo') as listas_sueltas
  from public.av_pauta_piezas
  where es_lote = false
  group by pauta_id, editor_user_id, formato
) s
where l.es_lote = true
  and l.pauta_id = s.pauta_id
  and l.editor_user_id is not distinct from s.editor_user_id
  and l.formato is not distinct from s.formato
  and l.listas < s.listas_sueltas;

delete from public.av_pauta_piezas s
using public.av_pauta_piezas l
where s.es_lote = false
  and l.es_lote = true
  and l.pauta_id = s.pauta_id
  and l.editor_user_id is not distinct from s.editor_user_id
  and l.formato is not distinct from s.formato;

-- 4) El resto de las sueltas → un lote por (pauta, editor, formato)
create temporary table _sueltas_grupos on commit drop as
select
  (array_agg(id order by created_at, id))[1] as keep_id,
  count(*)::int as total,
  (count(*) filter (where status = 'listo'))::int as listos
from public.av_pauta_piezas
where es_lote = false
group by pauta_id, editor_user_id, formato;

update public.av_pauta_piezas p
set es_lote = true,
    cantidad = g.total,
    listas = g.listos
from _sueltas_grupos g
where p.id = g.keep_id;

delete from public.av_pauta_piezas
where es_lote = false;
