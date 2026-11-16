-- Chequeo de temporada: los estados de una pieza pasan a ser los mismos que ofrece la hoja
-- «Seguimiento - Navidad».
--
-- La hoja tiene dos listas: la columna DISEÑO (y las tarjetas) y la columna AUDIOVISUAL.
-- «N/A» no es un estado: es no tener la pieza (la fila no existe). Una pieza sin estado
-- equivale a la celda en blanco de la hoja, así que `status` pasa a admitir null.
--
--   DISEÑO / tarjetas : pendiente_redes, enviado_diseno, en_modificacion, enviado_cliente,
--                       aprobado, pendiente_cliente
--   AUDIOVISUAL       : pendiente_grabar, agendado, en_edicion, enviado_cliente, aprobado,
--                       pendiente_cliente, en_diseno
--
-- seasonal_pieces se creó en 20261116100000 con otro vocabulario (pendiente, en_produccion,
-- ajustes, publicado…). La tabla está vacía en este punto, así que solo se reemplaza la
-- restricción; no hay datos que convertir.

alter table public.seasonal_pieces
  alter column status drop not null,
  alter column status drop default;

alter table public.seasonal_pieces
  drop constraint if exists seasonal_pieces_status_check;

alter table public.seasonal_pieces
  add constraint seasonal_pieces_status_check check (
    status is null
    or status in (
      'pendiente_redes', 'enviado_diseno', 'en_modificacion', 'enviado_cliente',
      'aprobado', 'pendiente_cliente',
      'pendiente_grabar', 'agendado', 'en_edicion', 'en_diseno'
    )
  );
