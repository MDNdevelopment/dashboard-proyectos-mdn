-- Fusiona lotes de fotos duplicados por (pauta_id, editor_user_id) y evita que vuelva a
-- pasar.
--
-- Causa real: antes de esta sesión, cada clic en "+" del stepper de "Asignadas" disparaba
-- un INSERT/UPDATE independiente calculado sobre el estado del render en que ocurrió el
-- clic (ver Stepper.jsx). Con clics rápidos, dos clics podían ver ambos `lote === null` (ni
-- uno ni otro se había enterado todavía del insert del otro) y los dos llamaban a
-- `createLotePieza`, creando DOS filas `es_lote = true` para el mismo editor en la misma
-- pauta en vez de una. La UI solo lee/edita la primera (`loteOf` usa `.find()`), así que la
-- segunda queda invisible — pero sigue sumando a `cantidad`/`listas` en los totales, y
-- consume cupo del pool `faltantes` compartido sin que el coordinador pueda verla ni
-- corregirla. Síntoma reportado: escribir "80" en Asignadas y que quede en 79 — la unidad
-- que falta vive en el lote huérfano.
--
-- El fix en el cliente (acumular los clics del Stepper y serializar la escritura) ya
-- existe en esta misma sesión; esta migración repara los datos ya duplicados y agrega un
-- índice único como red de seguridad adicional (cubre incluso una carrera entre dos
-- pestañas/usuarios distintos, que el fix del cliente no puede prevenir por sí solo).

-- 1) Fusionar: sumar cantidad/listas de todos los lotes de un mismo (pauta, editor) en el
--    primero creado, y borrar el resto. Los totales de la pauta no cambian — solo se
--    consolidan filas internas que ya sumaban al total.
with grupos as (
  select
    pauta_id,
    editor_user_id,
    (array_agg(id order by created_at))[1] as keep_id,
    sum(cantidad) as total_cantidad,
    sum(listas) as total_listas
  from public.av_pauta_piezas
  where es_lote = true
  group by pauta_id, editor_user_id
  having count(*) > 1
)
update public.av_pauta_piezas p
set cantidad = g.total_cantidad,
    listas = g.total_listas
from grupos g
where p.id = g.keep_id;

with grupos as (
  select pauta_id, editor_user_id, (array_agg(id order by created_at))[1] as keep_id
  from public.av_pauta_piezas
  where es_lote = true
  group by pauta_id, editor_user_id
  having count(*) > 1
)
delete from public.av_pauta_piezas p
using grupos g
where p.es_lote = true
  and p.pauta_id = g.pauta_id
  and p.editor_user_id is not distinct from g.editor_user_id
  and p.id <> g.keep_id;

-- 2) Blindaje: a partir de ahora, la base de datos impide un segundo lote para el mismo
--    (pauta, editor) — un INSERT que lo intente falla con un error visible en vez de crear
--    un duplicado silencioso. NULL se trata como distinto de NULL en un índice único de
--    Postgres, así que lotes huérfanos (editor_user_id null, ver RemoveEditorDialog) no
--    chocan entre sí.
create unique index if not exists av_pauta_piezas_lote_unico_por_editor
  on public.av_pauta_piezas (pauta_id, editor_user_id)
  where es_lote = true;
