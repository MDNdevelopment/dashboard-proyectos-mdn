-- Checklist de acciones para Tácticas (tabla `campaigns`).
-- Array jsonb de ítems { id, title, done }; el % de cumplimiento se deriva en la UI
-- (checklistProgress). Solo aplica a Tácticas, no a paid_campaigns (Ads).
alter table public.campaigns
  add column if not exists checklist jsonb not null default '[]'::jsonb;
