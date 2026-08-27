-- CNP puede producir varias piezas a partir de un solo requerimiento (ej. una jefa de
-- línea pide "historias de parada" y de un único CNP salen 2 historias). Antes había que
-- crear un CNP por pieza para que el conteo cuadrara, lo que inflaba el número de
-- requerimientos. `pieces` guarda un checklist de piezas con progreso de entrega propio.
--
-- Forma de cada elemento: { id, label, done, custom }.
-- Convención (sin backfill): pieces = '[]' significa 1 pieza — así los CNP existentes y
-- los nuevos con cantidad 1 (el caso mayoritario) no necesitan materializar una lista de
-- un solo elemento. Ver cnpPieceCount/cnpPiecesDelivered en src/components/cnp/constants.js.
alter table public.cnp_requests
  add column if not exists pieces jsonb not null default '[]'::jsonb;
