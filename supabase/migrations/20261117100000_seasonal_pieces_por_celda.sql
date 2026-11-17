-- Chequeo de temporada: una fila por celda (cliente × slot) con las tres columnas de la hoja.
--
-- Antes seasonal_pieces tenía UNA fila por pieza (cliente × slot × tipo) con un solo `status`.
-- La hoja «Seguimiento - Navidad» tiene, por fecha, tres columnas: FORMATO, DISEÑO y
-- AUDIOVISUAL; y por tarjeta, una sola de estado. Ahora la fila las refleja tal cual:
--
--   formato            : diseno | foto | reel (null = en blanco)
--   diseno_status      : estado de la columna DISEÑO (y de las tarjetas)
--   audiovisual_status : estado de la columna AUDIOVISUAL
--
-- DISEÑO, AUDIOVISUAL y las tarjetas comparten la misma lista de estados. «N/A» ahora es un
-- valor guardado ('na'); null = celda en blanco. Las tarjetas solo usan diseno_status.
--
-- La tabla está vacía (verificado antes de escribir esta migración), así que no hay datos que
-- convertir. RLS, realtime e índices no cambian: las policies no dependen de estas columnas.

-- Red de seguridad: si alguien ya cargó piezas, no se descartan en silencio.
do $$
begin
  if exists (select 1 from public.seasonal_pieces) then
    raise exception 'seasonal_pieces tiene datos: convertirlos a una fila por celda antes de aplicar';
  end if;
end;
$$;

alter table public.seasonal_pieces
  drop constraint if exists seasonal_pieces_unique,
  drop constraint if exists seasonal_pieces_piece_type_check,
  drop constraint if exists seasonal_pieces_status_check;

alter table public.seasonal_pieces
  drop column if exists piece_type,
  drop column if exists status;

alter table public.seasonal_pieces
  add column formato text,
  add column diseno_status text,
  add column audiovisual_status text;

alter table public.seasonal_pieces
  add constraint seasonal_pieces_formato_check check (
    formato is null or formato in ('diseno', 'foto', 'reel')
  ),
  add constraint seasonal_pieces_diseno_status_check check (
    diseno_status is null or diseno_status in (
      'na', 'pendiente_redes', 'enviado_diseno', 'en_modificacion',
      'enviado_cliente', 'aprobado', 'pendiente_cliente'
    )
  ),
  add constraint seasonal_pieces_audiovisual_status_check check (
    audiovisual_status is null or audiovisual_status in (
      'na', 'pendiente_redes', 'enviado_diseno', 'en_modificacion',
      'enviado_cliente', 'aprobado', 'pendiente_cliente'
    )
  ),
  add constraint seasonal_pieces_unique unique (campaign_id, client_id, slot_key);
