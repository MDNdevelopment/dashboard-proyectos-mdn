-- Responsable de un Ad. Texto sin FK, mismo criterio que campaigns.assignee
-- (se resuelve en JS vía un mapa de usuarios, no vía embed de Supabase).
alter table public.paid_campaigns
  add column if not exists responsable_id text;
