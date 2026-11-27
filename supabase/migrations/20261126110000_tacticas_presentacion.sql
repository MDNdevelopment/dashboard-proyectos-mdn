-- Tácticas: link a la presentación web de la táctica (Netlify u otra página), aparte del
-- documento en Drive. Varias tácticas se presentan al cliente como página en Netlify y el campo
-- drive_url solo acepta Drive, así que la presentación necesita su propio campo.
--
-- No cambia ningún dato existente: solo agrega una columna opcional (vacío = null).
-- Aplicada a producción el 2026-11-23 (registrada como `tacticas_presentacion`).

alter table public.campaigns
  add column if not exists presentation_url text;

comment on column public.campaigns.presentation_url is
  'Link a la presentación web de la táctica (p. ej. un sitio en Netlify). Opcional.';
