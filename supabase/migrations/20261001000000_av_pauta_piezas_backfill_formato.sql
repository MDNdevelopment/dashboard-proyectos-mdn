-- Backfill de `formato` en piezas viejas sin clasificar, en pautas con un solo formato de
-- video activo (V+F, R+F, o V/R solos sin Foto).
--
-- Hasta ahora, una pauta con más de un formato marcado (ej. Video+Foto) obligaba a elegir
-- el formato pieza por pieza en el checklist genérico, aunque Foto nunca pasa por ahí (vive
-- en su propio lote, `es_lote = true`). El cliente deja de pedir ese dato cuando solo hay un
-- formato de video activo además de Foto — pero las piezas creadas ANTES de este cambio en
-- esas pautas quedaron con `formato = null` porque el selector era obligatorio y a veces no
-- se completaba. Con el selector ya oculto para este caso, esas piezas quedarían sin forma
-- de corregirse desde la UI — y el usuario confirmó que, en una pauta de un solo formato de
-- video, una pieza sin clasificar "nunca será una foto": corresponde a ese único formato.
--
-- Efecto secundario correcto (no un bug nuevo): al quedar con `formato` real, el trigger
-- `av_pautas_sync_formato_counters` (migración 20260910000000) empieza a contar estas piezas
-- en "Editadas" de ese formato si ya estaban en `status = 'listo'` — hoy no las contaba por
-- tener `formato: null`.
update public.av_pauta_piezas p
set formato = sub.only_format
from (
  select a.id as pauta_id, (array_remove(a.formats, 'F'))[1] as only_format
  from public.av_pautas a
  where coalesce(array_length(array_remove(a.formats, 'F'), 1), 0) = 1
) sub
where p.pauta_id = sub.pauta_id
  and p.es_lote = false
  and p.formato is null;
