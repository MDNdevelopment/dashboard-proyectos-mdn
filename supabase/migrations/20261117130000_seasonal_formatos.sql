-- Chequeo de temporada: nuevas opciones de la columna FORMATO.
--
-- Antes: diseno | foto | reel. Ahora son las del desplegable de la hoja:
--   diseno_arte      → «Diseño - Arte»
--   diseno_video     → «Diseño - Video»
--   audiovisual_reel → «Audiovisual Reel»
--   ia               → «IA»
-- «Audiovisual - Foto» ya no existe como formato.
--
-- La tabla no tiene formatos cargados (verificado antes de escribir esta migración), así que
-- no hay datos que convertir. Si alguien cargó alguno antes de aplicarla, falla en vez de
-- descartarlo en silencio.

do $$
begin
  if exists (select 1 from public.seasonal_pieces where formato is not null) then
    raise exception 'seasonal_pieces tiene formatos cargados: convertirlos a los nuevos antes de aplicar';
  end if;
end;
$$;

alter table public.seasonal_pieces
  drop constraint if exists seasonal_pieces_formato_check;

alter table public.seasonal_pieces
  add constraint seasonal_pieces_formato_check check (
    formato is null or formato in ('diseno_arte', 'diseno_video', 'audiovisual_reel', 'ia')
  );
