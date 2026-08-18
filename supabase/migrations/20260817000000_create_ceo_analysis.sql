-- Caché del análisis ejecutivo generado por IA (Gemini) para el recuadro del Home.
-- Una fila por empresa (upsert por company_id); el backend decide si regenerar según
-- el TTL diario. Contiene datos financieros y estratégicos, así que a diferencia de
-- otras tablas del módulo Métricas, aquí NO se abre RLS a "authenticated": se deja
-- deny-by-default. El único acceso es la función serverless ceo-analysis, que usa el
-- cliente service-role (bypassa RLS) y hace su propia comprobación de tenant + allowlist
-- de usuarios autorizados (ver netlify/functions/ceo-analysis.js).

create table public.ceo_analysis (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null unique,
  data          jsonb not null,
  generated_at  timestamptz not null default now(),
  generated_by  uuid
);

alter table public.ceo_analysis enable row level security;
-- Sin políticas para authenticated/anon: deny-by-default. Solo el service-role
-- (usado exclusivamente en netlify/functions/ceo-analysis.js) puede leer/escribir.
