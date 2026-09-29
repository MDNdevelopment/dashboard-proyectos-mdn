-- Finanzas: la tab "Caja Bs" pasa a llamarse "Divisas" (su uso real es comprar y
-- vender divisas, no consultar el libro de bolívares), y se agrega la tab nueva
-- "Movimientos" — el diario consolidado del mes, SOLO LECTURA.
--
-- La capability de una tab se deriva de su key en FinanzasPage.jsx
-- (`tabCapability(key) => finanzas.${key}`), así que renombrar la key renombra el
-- permiso: finanzas.cajabs → finanzas.divisas.
--
-- IMPORTANTE (mismo criterio que las 3 migraciones previas de Finanzas): una
-- capability SIN fila en module_permissions queda ABIERTA a todos. Por eso esta
-- migración es parte de la feature, no un paso posterior:
--   - finanzas.cajabs se RENOMBRA (no se borra y se recrea): así conserva las reglas
--     que alguien haya ajustado a mano en Empresa → Accesos, en vez de volver al
--     default. Borrar la vieja sin crear la nueva dejaría la tab abierta a todos.
--   - finanzas.movimientos se siembra con min_level 4, igual que la de Divisas:
--     expone el detalle completo de cobros y pagos de la agencia.
--
-- No se crea ninguna capability de escritura: Movimientos no escribe nada (borrar y
-- editar se sigue haciendo en Facturación, Distribución y Divisas).

-- ── 1. Renombrar finanzas.cajabs → finanzas.divisas ───────────────────────────────
-- Si por algún camino ya existiera la fila nueva, se respeta la existente y solo se
-- descarta la vieja (el update fallaría por la PK (company_id, module_key)).
delete from public.module_permissions old
 where old.module_key = 'finanzas.cajabs'
   and exists (
     select 1 from public.module_permissions nuevo
      where nuevo.company_id = old.company_id
        and nuevo.module_key = 'finanzas.divisas'
   );

update public.module_permissions
   set module_key = 'finanzas.divisas'
 where module_key = 'finanzas.cajabs';

-- ── 2. Sembrar finanzas.movimientos (ver-tab, nivel 4+) ───────────────────────────
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
    values (cid, 'finanzas.movimientos', v_rule)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
