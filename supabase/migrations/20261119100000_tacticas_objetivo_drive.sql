-- Tácticas por marca (F1): objetivo general, link a la carpeta de Drive y datos de cierre.
-- Aplicada a producción el 2026-11-19 (registrada como `tacticas_objetivo_drive`).
-- No toca RLS: lectura abierta y escritura con user_can('ads.manage') siguen igual
-- (ver 20261117140000_ads_ver_todo_y_rls_campaigns.sql).

alter table public.campaigns
  add column if not exists objective text,
  add column if not exists drive_url text,
  add column if not exists closed_at timestamptz;

comment on column public.campaigns.objective is 'Objetivo general de la táctica (texto corto).';
comment on column public.campaigns.drive_url is 'Link a la carpeta de Drive con el PDF y el editable de la táctica.';
comment on column public.campaigns.closed_at is 'Cuándo pasó a Finalizado. Atribuye la táctica al mes de cierre en el score.';

-- Para resolver "la última táctica de cada marca" sin escanear la tabla entera.
create index if not exists campaigns_client_start_idx
  on public.campaigns (client_id, start_date desc);

-- Las tácticas que ya están cerradas toman su fecha de cierre de la última edición.
update public.campaigns
   set closed_at = updated_at
 where status = 'Finalizado'
   and closed_at is null;
