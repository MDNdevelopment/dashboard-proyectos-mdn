-- ─────────────────────────────────────────────────────────────────────────────
-- Seed de capacidades — defaults iniciales
--
-- Reproduce el comportamiento pedido:
--   Nivel 1 → solo ve Inicio de Empresa
--   Nivel 2 → ve Inicio, Clientes y Líneas; modifica Clientes; NO modifica Líneas
--   Nivel 4 → ve y modifica todo (igual que admin)
--
-- También establece defaults para Tareas, Evaluaciones y Ads que reflejan
-- los accesos hardcodeados anteriores.
--
-- ON CONFLICT DO NOTHING: no pisa configuraciones que el admin ya haya guardado.
-- ─────────────────────────────────────────────────────────────────────────────

-- Usar company_id de cada empresa existente
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    -- ── EMPRESA ────────────────────────────────────────────────────────────

    -- empresa.general → abierto (no insertar; sin reglas = abierto por default)

    -- empresa.clientes → nivel 2+
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.clientes',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- empresa.lineas → nivel 2+
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.lineas',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- empresa.departamentos → nivel 4 (reemplaza adminOnly; admin siempre bypassa)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.departamentos',
       '{"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- empresa.empleados → nivel 4
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.empleados',
       '{"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- empresa.preguntas → nivel 4
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.preguntas',
       '{"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- empresa.permisos → nivel 4
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.permisos',
       '{"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- empresa.clientes.manage → nivel 2+ (pueden modificar clientes)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.clientes.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- empresa.lineas.manage → nivel 4 (caso central del usuario)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'empresa.lineas.manage',
       '{"rules":[{"all":[{"type":"min_level","value":4,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- ── TAREAS ─────────────────────────────────────────────────────────────

    -- tareas.panorama / team / standup → nivel 2+ (igual que antes: 'privileged')
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'tareas.panorama',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'tareas.team',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'tareas.standup',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- tareas.base y tareas.kanban → sin reglas = abierto (no insertar)

    -- tareas.manage → nivel 2+ (crear/editar/eliminar tareas)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'tareas.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- ── EVALUACIONES ───────────────────────────────────────────────────────

    -- evaluaciones.empleados / resumen → nivel 2+ (igual que 'canEval' anterior)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'evaluaciones.empleados',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'evaluaciones.resumen',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- evaluaciones.perfil y perfil-v2 → sin reglas = abierto (todos ven su perfil)

    -- evaluaciones.manage → nivel 2+ (guardar evaluaciones)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'evaluaciones.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- ── ADS ────────────────────────────────────────────────────────────────

    -- ads.manage → nivel 3+ (igual que 'canManage' anterior en AdsPage)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'ads.manage',
       '{"rules":[{"all":[{"type":"min_level","value":3,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- ── REPORTES ───────────────────────────────────────────────────────────

    -- reportes.manage → nivel 3+ (mismo umbral que ver reportes)
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'reportes.manage',
       '{"rules":[{"all":[{"type":"min_level","value":3,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    -- proyectos.manage / tickets.manage → sin reglas = abierto (todos pueden crear)

  end loop;
end;
$$;
