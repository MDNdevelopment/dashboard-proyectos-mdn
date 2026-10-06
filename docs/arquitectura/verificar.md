# Dudas abiertas de la documentación

Contradicciones o huecos que aparecieron al condensar el antiguo `ARQUITECTURA.md` (1,1 MB) en
documentos por módulo (octubre 2026). Cada punto hay que confirmarlo contra el código o la base y,
una vez resuelto, corregir el doc del módulo y borrar el punto de esta lista.

## Permisos

- `audiovisual.pautas.gestion`: la regla en producción quedó como un solo grupo AND que nadie
  puede cumplir. Hay que corregirla en la base.
- RLS de `av_pauta_piezas`: confirmar si incluye `audiovisual.pautas.gestion` y
  `audiovisual.piezas`. Si no los incluye, la UI muestra controles que la base rechaza.
- Defaults de capabilities: el seed `20260706000002` figura como "nunca aplicado en producción".
  Faltan los defaults documentados de `empresa.empleados.manage` y `empresa.empleados.sensible`.
- Finanzas: se documentaban "9 capabilities", pero hay 11. La lista vieja traía `.cajabs` en lugar
  de `finanzas.divisas` y no incluía `finanzas.movimientos`.
- Sueldos y finanzas de una línea: conviven tres criterios distintos
  (`empresa.empleados.sensible`, admin/`access_level ≥ 3` e `isFinancePrivileged` con nivel 4).
  Hay que unificarlos.
- Pestaña Empleados en Empresa: no está claro si es solo para admin o también para nivel 2.

## Datos

- `fin_distributions.partida`: el CHECK documentado es `gastos|socios|ganancia`, pero
  `fin_fx_sync()` inserta `'cambio'`.
- Columnas que se usan pero no están en el catálogo:
  - `metric_clients.pending_line_id`, `line_change_at` y `pending_task_assignee`.
  - `metric_line_members.is_lead` y `metric_lines.lead_user_id`. Además, no está claro cuál de las
    dos es la fuente de verdad de "jefa de línea".
  - `paid_campaigns.results_pending` y `metric_lines.is_management`: falta tipo y significado.
  - `fin_invoices.ret_*`: faltan los nombres concretos.
- No está documentada la forma de `tasks.checklist` ni la de `cnp_requests.pieces`.
- `leads` se carga en el dataset de MAPPI sin filtrar por `company_id`.
- `users` no está en `supabase_realtime`.

## Comportamiento

- Pautas: `piezas_totales` es manual sin desglose por formato y derivado con desglose. Confirmar.
- Pautas: falta documentar el reparto de grabación (`GrabacionSection`, `grabacionPorFormato`,
  `grabacionBalance`, `syncRecursoIds`).
- Analítica por recurso: `aggregateByResource` todavía se menciona, pero
  `aggregateResourcePerformance` lo reemplaza.
- Card "CNP asignados" del Home: el enlace aparece en dos versiones,
  `/cnp?view=base&assignee=<id>` y `/cnp?view=base&team=__mine__&assignee=<id>`.
- Métricas: `feedback` figura como eliminado, pero sigue en el merge de auto-persistencia y en
  "Mover de línea".
- `assignableUsers`: aparece con 3 y con 4 argumentos. Confirmar si `currentUserId` es opcional.
