-- Tácticas: fechas opcionales ("Sin fecha") y link a la carpeta de la marca en Drive.
-- Aplicada a producción el 2026-11-20 (registrada como `tacticas_sin_fecha_y_carpeta`), antes de
-- cargar el ÍNDICE TÁCTICAS MDN (106 tácticas; son las únicas con drive_folder_url).
-- Para cargar el ÍNDICE TÁCTICAS MDN: 16 tácticas reales no tienen fecha todavía y cada
-- táctica trae, además de su documento (drive_url), la carpeta de la marca en TÁCTICAS MDN.
--
-- No cambia ningún dato existente: solo relaja dos NOT NULL y agrega una columna opcional.
-- Lo que depende de las fechas ya ignora las tácticas sin fecha porque compara con null:
--   - enqueue_campaign_closures(): end_date < hoy → null, no la cierra.
--   - enqueue_tactic_expiry_reminders(): end_date in (hoy, hoy+3) → null, no avisa.
--   - employee_score_inputs(): least(coalesce(closed_at, end_date), end_date) → null, no cuenta.

alter table public.campaigns
  alter column start_date drop not null,
  alter column end_date drop not null;

alter table public.campaigns
  add column if not exists drive_folder_url text;

comment on column public.campaigns.drive_url is
  'Link al documento (o carpeta) de la táctica en Drive.';
comment on column public.campaigns.drive_folder_url is
  'Link a la carpeta de la marca en TÁCTICAS MDN (brief y todas sus tácticas).';
