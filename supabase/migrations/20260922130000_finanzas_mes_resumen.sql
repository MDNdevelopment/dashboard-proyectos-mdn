-- Módulo Finanzas: mes "resumen" (totales sin desglose) para cargar periodos
-- históricos de referencia que no vienen estructurados factura por factura
-- (ver ARQUITECTURA.md §2.15 "Periodo de referencia").
--
-- `fin_months.summary_only`: marca que ese mes NO tiene facturación/cobranza/
-- distribución fila por fila (fin_invoices/fin_payments/fin_distributions
-- quedan vacías para él) — sus totales viven en `fin_month_totals`, una sola
-- fila por mes. El Dashboard y la tendencia leen de ahí cuando el flag está
-- prendido; Facturación/Distribución muestran un aviso en vez de tablas
-- vacías (ver DashboardView.jsx/FacturacionView.jsx/DistribucionView.jsx).

alter table public.fin_months
  add column summary_only boolean not null default false;

create table public.fin_month_totals (
  month_id        uuid primary key references public.fin_months(id) on delete cascade,
  total_facturado numeric(12,2) not null default 0 check (total_facturado >= 0),
  total_cobrado   numeric(12,2) not null default 0 check (total_cobrado >= 0),
  total_gastos    numeric(12,2) not null default 0 check (total_gastos >= 0),
  total_socios    numeric(12,2) not null default 0 check (total_socios >= 0),
  total_ganancia  numeric(12,2) not null default 0 check (total_ganancia >= 0),
  note            text,
  created_by      uuid references public.users(user_id),
  created_at      timestamptz not null default now()
);

-- Mismo criterio de "mes cerrado bloquea escritura" que fin_invoices/
-- fin_payments/fin_distributions (fin_block_closed_month(), ver
-- 20260914202422_create_finanzas.sql) — un mes resumen se carga típicamente
-- ya cerrado, pero la protección debe valer igual si no lo estuviera.
create trigger fin_month_totals_block_closed
  before insert or update or delete on public.fin_month_totals
  for each row execute function public.fin_block_closed_month();

alter table public.fin_month_totals enable row level security;

create policy "fin_month_totals_read" on public.fin_month_totals
  for select to authenticated using (user_can('finanzas'));
create policy "fin_month_totals_insert" on public.fin_month_totals
  for insert to authenticated with check (user_can('finanzas.cerrar_mes'));
create policy "fin_month_totals_update" on public.fin_month_totals
  for update to authenticated
  using (user_can('finanzas.cerrar_mes')) with check (user_can('finanzas.cerrar_mes'));
create policy "fin_month_totals_delete" on public.fin_month_totals
  for delete to authenticated using (user_can('finanzas.cerrar_mes'));

alter publication supabase_realtime add table public.fin_month_totals;
