-- Caché de la recomendación de MAPPI sobre carga de recursos de Audiovisual (recuadro
-- "Recomendaciones" del Home, solo admins). Mismo patrón que 20260817000000_create_ceo_analysis.sql:
-- una fila por empresa (upsert por company_id), TTL diario decidido por el backend.
-- Deny-by-default: solo la función serverless av-workload-insight (service-role) la usa.

create table public.av_workload_insight (
  company_id    text primary key,
  data          jsonb not null,
  generated_at  timestamptz not null default now(),
  generated_by  text
);

alter table public.av_workload_insight enable row level security;
-- Sin políticas para authenticated/anon: deny-by-default. Solo el service-role
-- (usado exclusivamente en netlify/functions/av-workload-insight.js) puede leer/escribir.
