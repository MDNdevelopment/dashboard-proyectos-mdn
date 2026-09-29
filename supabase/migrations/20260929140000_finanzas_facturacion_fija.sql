-- Facturación fija del mes: todos los clientes activos, sin agregarlos a mano.
--
-- Antes, la facturación de un mes se sembraba UNA sola vez (seedRecurringInvoices
-- abortaba si el mes ya tenía alguna factura) y solo con los clientes que tenían
-- `monthly_fee > 0`. Consecuencia: los clientes activos sin mensualidad cargada en
-- su perfil nunca aparecían, y un mes creado por otro camino (p. ej. el que abre
-- `closeMonth`, o una visita a otra tab) se quedaba vacío para siempre porque el
-- botón "Abrir mes" ya no se mostraba. Ahora la vista reconcilia en cada visita:
-- inserta los clientes activos que falten y no toca los que ya están.
--
-- Esta migración habilita las dos piezas que ese cambio necesita en la base:
--   1. Un cargo puede quedar en 0 ("Sin monto") cuando ni el perfil de la marca ni
--      el mes anterior dicen cuánto paga — la fila aparece igual, marcada para
--      editar, en vez de desaparecer.
--   2. `fin_invoice_exclusions` recuerda las facturaciones borradas a propósito,
--      para que la reconciliación no las vuelva a crear.

-- ── 1. Un cargo puede valer 0 (pendiente de asignarle monto) ──────────────────
alter table public.fin_invoices drop constraint fin_invoices_amount_check;
alter table public.fin_invoices add constraint fin_invoices_amount_check check (amount >= 0);

-- ── 2. fin_invoice_exclusions: "a esta marca no le factures desde este mes" ────
-- Se inserta al eliminar la facturación de un cliente, y se borra al volver a
-- agregársela. La exclusión aplica al mes indicado y a TODOS los siguientes
-- (la lectura filtra por (year, month) <= mes consultado): si borras el cargo de
-- una marca en octubre es porque dejó de facturar, no solo por ese mes — de lo
-- contrario reaparecería sola en noviembre y habría que borrarla cada mes.
create table public.fin_invoice_exclusions (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null,
  client_id  uuid not null references public.metric_clients(id) on delete cascade,
  year       int not null,
  month      int not null check (month between 1 and 12),
  created_by uuid references public.users(user_id),
  created_at timestamptz not null default now(),
  unique (company_id, client_id, year, month)
);

create index fin_invoice_exclusions_lookup_idx
  on public.fin_invoice_exclusions (company_id, year, month);

alter table public.fin_invoice_exclusions enable row level security;

create policy "fin_invoice_exclusions_read" on public.fin_invoice_exclusions
  for select to authenticated using (user_can('finanzas'));
create policy "fin_invoice_exclusions_insert" on public.fin_invoice_exclusions
  for insert to authenticated with check (user_can('finanzas.facturacion.manage'));
create policy "fin_invoice_exclusions_delete" on public.fin_invoice_exclusions
  for delete to authenticated using (user_can('finanzas.facturacion.manage'));

alter publication supabase_realtime add table public.fin_invoice_exclusions;
