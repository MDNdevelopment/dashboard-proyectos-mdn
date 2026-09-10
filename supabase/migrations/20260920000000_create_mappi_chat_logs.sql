-- Registro de cada pregunta que le hacen a MAPPI (chat flotante IA), para dejar de depender
-- de que los usuarios avisen por WhatsApp cuando el asistente no puede responder algo.
-- `outcome` lo clasifica netlify/functions/ai-chat.js al cerrar cada request, sin una
-- segunda llamada al modelo (ver comentario ahí). El panel de huecos en
-- Empresa → MAPPI (MappiLogsView.jsx) lee `outcome != 'respondida'` agrupado por frecuencia.
-- Mismo patrón deny-by-default que ceo_analysis/av_workload_insight: solo el service-role
-- (usado en ai-chat.js) escribe; el rol authenticated lee vía una policy explícita para admins.

create table public.mappi_chat_logs (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null,
  user_id      uuid not null,
  question     text not null,
  reply        text,
  tools_used   text[] not null default '{}',
  outcome      text not null check (outcome in ('respondida', 'sin_cobertura', 'error', 'timeout')),
  created_at   timestamptz not null default now()
);

create index mappi_chat_logs_company_outcome_idx
  on public.mappi_chat_logs (company_id, outcome, created_at desc);

alter table public.mappi_chat_logs enable row level security;

-- Solo admins de la misma empresa pueden leer el backlog de huecos. Las escrituras van
-- siempre por service-role (bypassa RLS) desde ai-chat.js: no hay policy de insert para
-- authenticated, así que un cliente normal no puede fabricar entradas.
create policy "Admins leen el log de MAPPI de su empresa"
  on public.mappi_chat_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()
        and u.admin = true
        and u.company_id::text = mappi_chat_logs.company_id
    )
  );
