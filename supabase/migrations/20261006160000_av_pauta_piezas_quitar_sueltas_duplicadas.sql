-- Quita las filas sueltas (es_lote = false) que duplican un lote del mismo
-- (pauta, editor, formato).
--
-- Síntoma: una pauta mostraba "salieron 4" pero "asignadas 8 / listas 8" y la sección
-- Edición quedaba en solo lectura. Causa: el trabajo estaba registrado dos veces — como un
-- lote (cantidad 4) y como 4 filas sueltas del modelo viejo (1 cada una) — y la UI suma
-- ambos; además cualquier fila suelta fuerza el modo "registro anterior".
--
-- Solo se tocan los grupos donde el lote ya cubre exactamente a las sueltas
-- (lote.cantidad = Σ sueltas.cantidad). Los que no cuadran se dejan para revisión manual.
-- Antes de borrar, el lote hereda las listas de las sueltas si eran más (no se pierde
-- trabajo ya entregado). Los triggers de contadores recalculan piezas_por_formato.

with grupos as (
  select
    l.id as lote_id,
    s.pauta_id,
    s.editor_user_id,
    s.formato,
    s.cantidad_sueltas,
    s.listas_sueltas
  from public.av_pauta_piezas l
  join (
    select pauta_id, editor_user_id, formato,
           sum(cantidad) as cantidad_sueltas,
           sum(listas) as listas_sueltas
    from public.av_pauta_piezas
    where es_lote = false and status <> 'cancelado'
    group by pauta_id, editor_user_id, formato
  ) s
    on s.pauta_id = l.pauta_id
   and s.editor_user_id is not distinct from l.editor_user_id
   and s.formato is not distinct from l.formato
  where l.es_lote = true
    and l.cantidad = s.cantidad_sueltas
)
update public.av_pauta_piezas p
set listas = least(p.cantidad, greatest(p.listas, g.listas_sueltas))
from grupos g
where p.id = g.lote_id
  and p.listas < g.listas_sueltas;

delete from public.av_pauta_piezas s
using public.av_pauta_piezas l
where s.es_lote = false
  and s.status <> 'cancelado'
  and l.es_lote = true
  and l.pauta_id = s.pauta_id
  and l.editor_user_id is not distinct from s.editor_user_id
  and l.formato is not distinct from s.formato
  and l.cantidad = (
    select sum(x.cantidad)
    from public.av_pauta_piezas x
    where x.es_lote = false and x.status <> 'cancelado'
      and x.pauta_id = s.pauta_id
      and x.editor_user_id is not distinct from s.editor_user_id
      and x.formato is not distinct from s.formato
  );
