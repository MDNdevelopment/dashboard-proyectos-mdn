-- Vínculo relacional cliente ↔ campaña
-- Agrega client_id (FK a metric_clients) a la tabla campaigns y hace backfill
-- best-effort por nombre, usando el creador de la campaña para derivar la empresa.

alter table public.campaigns
  add column if not exists client_id uuid
    references public.metric_clients(id) on delete set null;

-- Backfill: cruzar campañas existentes con metric_clients por nombre (sin distinguir mayúsculas
-- ni espacios iniciales/finales). La empresa se infiere desde el campo created_by → users.company_id.
-- Las campañas sin coincidencia conservan client_id null y su nombre de texto en campaigns.client.
update public.campaigns
set client_id = mc.id
from public.metric_clients mc
join public.users u on u.company_id::text = mc.company_id::text
where campaigns.client_id is null
  and campaigns.client is not null
  and u.user_id = campaigns.created_by
  and lower(trim(mc.name)) = lower(trim(campaigns.client));
