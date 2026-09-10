-- Marca las pautas fuera del plan mensual como "Extra", visible en solicitudes,
-- agendadas, realizadas y el calendario (ExtraBadge).
alter table public.av_pautas
  add column if not exists extra boolean not null default false;
