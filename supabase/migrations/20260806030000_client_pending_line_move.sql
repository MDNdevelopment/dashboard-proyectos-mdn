-- Cambio de línea DIFERIDO de una cuenta: cuando al mover se elige que "este mes cuenta
-- para la línea vieja", la cuenta se queda completa en su línea actual hasta fin de mes y
-- pasa sola a la nueva el 1° del próximo mes. Esto evita que syncReportClients borre las
-- métricas del mes de la línea vieja (reconstruye el operativo desde la cartera actual).
--
-- Un pg_cron diario aplica el flip cuando llega la fecha. Mismo patrón que
-- 20260806000000_campaign_autoclose_cron.sql.

-- ── Columnas de cambio pendiente ────────────────────────────────────────────
alter table public.metric_clients
  add column if not exists pending_line_id uuid references public.metric_lines(id) on delete set null,
  add column if not exists line_change_at date;

-- ── Función: aplicar los cambios de línea que ya vencieron ──────────────────
create or replace function public.apply_due_client_line_moves()
returns void
language sql
security definer
set search_path = public
as $$
  update public.metric_clients
     set line_id           = pending_line_id,
         pending_line_id    = null,
         line_change_at     = null,
         -- el staff asignado era de la línea vieja: se limpia al flipear (igual que el mover inmediato)
         social_manager_id  = null,
         designer_id        = null,
         audiovisual_ids    = '[]'::jsonb
   where pending_line_id is not null
     and line_change_at <= (now() at time zone 'America/Caracas')::date;
$$;

-- ── Schedule: todos los días a las 06:00 Caracas (10:00 UTC) ─────────────────
-- Antes del cron de campañas (07:00) para que el nuevo mes ya tenga la línea correcta.
-- Idempotente: re-ejecutar la migración es seguro.
select cron.schedule(
  'apply-due-client-line-moves',
  '0 10 * * *',
  $$select public.apply_due_client_line_moves()$$
)
where not exists (
  select 1 from cron.job where jobname = 'apply-due-client-line-moves'
);
