-- Limpia los nombres AUTOGENERADOS 'Video #N' para que la numeración pase a derivarse del
-- orden (ver piezaOrdinals/piezaDisplayName en utils/audiovisual.js). Solo toca el patrón
-- exacto que producía el viejo defaultPiezaName — cualquier nombre escrito a mano queda
-- intacto, incluso si empieza parecido ('Video #2 intro' no matchea por el ancla $).
--
-- Afecta también a las piezas 'Video #N' que en realidad eran Reels (el generador viejo
-- nunca miró el formato): al vaciar el nombre, la UI pasa a rotularlas según su
-- `pieza.formato` real.
--
-- Confirmado con el usuario antes de aplicar (regla de CLAUDE.md para UPDATEs que
-- descartan datos).
update public.av_pauta_piezas
set nombre = ''
where es_lote = false
  and nombre ~ '^Video #[0-9]+$';
