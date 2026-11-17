-- Chequeo de temporada: la columna AUDIOVISUAL vuelve a tener su propia lista de estados.
--
-- La hoja «Seguimiento - Navidad» ofrece en AUDIOVISUAL: N/A, Pendiente por grabar, Agendado,
-- En edición, Enviado al cliente, Aprobado, Pendiente cliente y En diseño. DISEÑO (y las
-- tarjetas) mantiene la suya. En 20261117100000 el CHECK de audiovisual_status solo admitía la
-- lista de DISEÑO; aquí se amplía con los estados propios de audiovisual. Solo se relaja una
-- restricción: no se toca ningún dato.

alter table public.seasonal_pieces
  drop constraint if exists seasonal_pieces_audiovisual_status_check;

alter table public.seasonal_pieces
  add constraint seasonal_pieces_audiovisual_status_check check (
    audiovisual_status is null or audiovisual_status in (
      'na', 'pendiente_grabar', 'agendado', 'en_edicion', 'enviado_cliente',
      'aprobado', 'pendiente_cliente', 'en_diseno',
      -- los de DISEÑO se conservan por si alguna fila ya los usa
      'pendiente_redes', 'enviado_diseno', 'en_modificacion'
    )
  );
