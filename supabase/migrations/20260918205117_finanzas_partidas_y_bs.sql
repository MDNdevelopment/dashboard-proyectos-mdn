-- Fase 1 del plan "Cargar el cierre real de Agosto 2026 al módulo Finanzas":
-- 1) % de reparto por mes (antes hardcodeado 66/20/14 en constants.js, el negocio usa 72/18/10)
-- 2) respaldo de monto en Bs + tasa en los cobros (antes solo se guardaba el equivalente en USD)
--
-- Los meses ya existentes quedan con 72/18/10 por el `default` (no había meses cerrados reales
-- aún). Un mes cerrado queda auditable contra su propio % — no se recalcula si mañana cambia
-- la política de reparto (mismo criterio con que se justificó la constante original).

alter table public.fin_months
  add column pct_gastos   numeric(5,4) not null default 0.72,
  add column pct_socios   numeric(5,4) not null default 0.18,
  add column pct_ganancia numeric(5,4) not null default 0.10;

-- `amount` (USD) sigue siendo el monto de cálculo de toda la aritmética existente;
-- amount_bs/rate son solo el respaldo del movimiento bancario real en bolívares.
alter table public.fin_payments
  add column amount_bs numeric(14,2) check (amount_bs > 0),
  add column rate      numeric(12,4) check (rate > 0);

-- Nueva capability de escritura para editar el reparto del mes, además de
-- finanzas.cerrar_mes (que ya podía actualizar fin_months).
create policy "fin_months_update_pcts" on public.fin_months
  for update to authenticated
  using (user_can('finanzas.cerrar_mes') or user_can('finanzas.partidas.manage'))
  with check (user_can('finanzas.cerrar_mes') or user_can('finanzas.partidas.manage'));

drop policy "fin_months_update" on public.fin_months;

-- IMPORTANTE: el seed va en esta misma migración porque una capability sin fila en
-- module_permissions queda ABIERTA a todos (mismo criterio que 20260914202422).
do $$
declare
  cid text;
  v_rule jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 4, 'ids', '[]'::jsonb)
      ))
    )
  );
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules)
    values (cid, 'finanzas.partidas.manage', v_rule)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
