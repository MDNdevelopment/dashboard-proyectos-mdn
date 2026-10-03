-- Rediseño del módulo Pautas (3/3): un lote por (editor, formato) para TODOS los formatos.
--
-- Hasta ahora el lote (es_lote = true, cantidad/listas) existía solo para Fotos; Video y
-- Reel creaban una fila por pieza con su propio estado. La nueva sección "Edición" registra
-- cantidades (asignadas / listas) por editor y por formato, así que un editor puede tener
-- a la vez un lote de Reel y otro de Video 4K en la misma pauta. El índice único de
-- 20261001000001 (pauta, editor) lo impedía; se reemplaza por (pauta, editor, formato).
--
-- No se migran datos: las pautas viejas con filas sueltas quedan en solo lectura en la UI
-- (ver `isLegacyPiezas`). Los triggers de contadores no cambian: ya suman `listas` por
-- formato.
drop index if exists public.av_pauta_piezas_lote_unico_por_editor;

create unique index if not exists av_pauta_piezas_lote_unico_por_editor_formato
  on public.av_pauta_piezas (pauta_id, editor_user_id, formato)
  where es_lote = true;
