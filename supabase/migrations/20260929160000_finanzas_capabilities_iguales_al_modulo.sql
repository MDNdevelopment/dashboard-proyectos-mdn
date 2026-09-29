-- Finanzas: quien entra al módulo entra a TODO el módulo.
--
-- Las capabilities de Finanzas habían quedado con reglas distintas entre sí. La
-- del módulo (`finanzas`) y la mayoría de las tabs aceptaban "nivel >= 4 O
-- departamento Administración", pero `finanzas.divisas`, `finanzas.movimientos`
-- y `finanzas.partidas.manage` se quedaron solo con el nivel:
--
--   - `finanzas.divisas` viene de renombrar `finanzas.cajabs` (migración
--     `20260929130000`), y a esa nadie le añadió la excepción de departamento
--     cuando se la añadieron a las demás desde Empresa → Accesos.
--   - `finanzas.movimientos` se sembró nueva en esa misma migración con el
--     default de nivel 4.
--
-- Efecto real: el equipo de Administración (Andrea, nivel 3; Alexandra, nivel 1)
-- veía Finanzas y todas sus pestañas MENOS Divisas y Movimientos, sin ninguna
-- razón de negocio — solo por el orden en que se fueron creando los permisos.
--
-- Se iguala cada `finanzas.*` a las reglas de `finanzas`: el acceso se decide una
-- sola vez, al entrar al módulo. Es una migración de datos de una sola pasada, no
-- una regla permanente: a partir de aquí las reglas se siguen ajustando a mano
-- desde Empresa → Accesos, y quien agregue una capability nueva del módulo debe
-- sembrarla con las mismas reglas que `finanzas` en vez del default de nivel 4.
update public.module_permissions hija
   set rules = madre.rules
  from public.module_permissions madre
 where madre.company_id = hija.company_id
   and madre.module_key = 'finanzas'
   and hija.module_key like 'finanzas.%'
   and hija.rules is distinct from madre.rules;
