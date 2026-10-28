# Evaluaciones

Evaluación de desempeño con dos fuentes: un score **automático** 0–100 por empleado y
mes, calculado solo a partir de datos que ya existen en el sistema (tareas, CNP, tareas
fijas por clave, pautas y piezas audiovisuales, campañas, tickets IT); y, desde la
extensión "evaluación del jefe", una evaluación **subjetiva** mensual de 1–4 criterios
por cargo (definidos en Empresa → Perfiles de Desempeño), que un jefe (nivel 3+ o admin)
puntúa 1–10 una vez al mes. Ninguna de las dos reemplaza a la otra: la ficha de un
empleado muestra ambas, más una **nota general /10** que las combina (el score automático 0–100 se muestra dividido entre 10; los snapshots siguen guardando 0–100) (70% automático +
30% jefe cuando hay ambas) vía `resolveEmployeeNota` (`src/utils/employeeCombinedScore.js`)
— única fuente de verdad de esa nota, la usan por igual la tabla de `DesempenoView`, el
modal de detalle (`ScoreBreakdownCard`) y `MiDesempenoView`, para que nunca diverjan de
escala entre sí. La **tabla** de `DesempenoView` ordena por defecto por esa nota
combinada /10 (columna "Nota", reordenable por cualquier columna); el **ranking oficial**
que expone `useEmployeeScores` (`result.ranking`, `enRanking`) sigue siendo solo por el
score automático 0–100 — la nota del jefe es informativa y no siempre está puesta para
todos en un mes dado, así que no debe decidir un ranking oficial. El flujo manual original (preguntas respondidas por un manager,
`evaluation_sessions`) se retiró en la fase F6; el historial manual se conserva de solo
lectura y es un esquema distinto al de la evaluación del jefe actual.

|---|---|
|---|---|
| **Propósito** | Score automático de desempeño por empleado/mes (indicadores simples ponderados por perfil de cargo) + evaluación subjetiva mensual del jefe (criterios por cargo) + nota general combinada. Vista propia (Mi Desempeño), vista de equipo + ranking + evaluación del jefe (Evaluar, nivel 2+), Rendimientos (el historial legacy de solo lectura), análisis IA opcional sobre el score. |
| **Archivos principales** | `src/pages/EvaluacionesPage.jsx` · `src/components/evaluaciones/{DesempenoView,MiDesempenoView,EmployeeScoreModal,ScoreBreakdownCard,IndicatorRow,ManagerRatingCard,ManagerRatingModal,HistorialLegacyView,EmployeeProfileView,AiEvaluation}.jsx` · `src/components/empresa/{ScoreProfilesPanel,CriteriaByPositionPanel}.jsx` · `src/utils/{employeeScore,employeeScoreProfiles,employeeAvailability,employeeScoreNarrative,employeeScoreSnapshot,managerRating,employeeCombinedScore}.js` · `src/hooks/{useEmployeeScores,useManagerRatings}.js` · `netlify/functions/employee-scores-snapshot.js` (su `loadCompanyInputs` pagina con `selectAllPages`: `publication_checks` y `fixed_task_marks` superan las 1000 filas) |
| **Tablas** | `employee_score_profiles` (pesos por cargo/departamento/nivel) · `employee_score_snapshots` (score automático congelado por mes, `unique(user_id, year, month)`) · `evaluation_criteria` (criterios subjetivos por cargo, hasta 4) · `manager_ratings` (evaluación del jefe por empleado/mes, escala 1–10 — `promedio numeric(4,2)` con CHECK 1–10 —, `unique(user_id, year, month)`, `items` congela ícono/nombre del criterio al momento de evaluar) · legacy solo lectura: `evaluation_sessions/responses/comments`, `questions/question_positions/question_tags` |
| **RPC** | `employee_score_inputs(p_year, p_month)` — datos crudos del mes, ya acotados por RLS a lo que el caller puede ver |
| **IA** | Netlify fn `netlify/functions/evaluation-analysis.js` → Gemini (bajo demanda, desde `AiEvaluation.jsx`); recibe el score/breakdown/narrativa del empleado, no respuestas manuales |
| **Rutas** | `/evaluaciones` (Evaluar) · `/evaluaciones/mi-desempeno` (Mi Desempeño) · `/evaluaciones/rendimientos` (Rendimientos: el historial legacy) · `/evaluaciones/empleado/:id` — redirects: `/evaluaciones/historial` → `/evaluaciones/rendimientos`, `/evaluaciones/resumen`, `/evaluaciones/perfil-v2`, `/evaluaciones/desempeno` → `/evaluaciones`; `/evaluaciones/perfil` → `/evaluaciones/mi-desempeno` |
| **Permisos** | Las claves de capability no cambian con las etiquetas del sidebar: `evaluaciones.desempeno` = Evaluar, `evaluaciones.historial` = Rendimientos. Cada quien ve su propio score/evaluación. `evaluaciones.ver_todo`: ver el desempeño de todos + ranking (nivel 4/admin por defecto). Nivel 2–3 ve su línea vía RLS (`metric_line_members`). `evaluaciones.recalcular`: recongelar un mes cerrado. `evaluaciones.perfiles.manage`: editar pesos por cargo y criterios de la evaluación del jefe. `evaluaciones.evaluar` (nivel 3+ o admin): evaluar mensualmente a un empleado — RLS prohíbe autoevaluación y exige la misma visibilidad que `evaluaciones.ver_todo`/línea. |
| **Cruce con otros módulos** | Deriva el score de `tasks`, `cnp_requests`, `fixed_task_marks`, `av_pautas`, `av_pauta_piezas`, `meetings`, `campaigns`/`paid_campaigns`, `publication_checks`, `support_tickets` y `vacations` — no captura nada manualmente. `MiDesempenoView` ya no conserva el panel operativo (tareas/proyectos, portado de Mi Perfil v2) que traía heredado — se retiró para dejar la vista enfocada solo en el score; ese detalle ya vive en Tareas y en las fichas de Reportes. |

**Indicadores** (`INDICATORS` en `employeeScore.js`; los perfiles asignan el peso, 0 = no aplica al cargo):

| key | Qué mide | Fuente |
|---|---|---|
| `tareas` | tareas cuyo `due_date` cae en el mes, cerradas en o antes de esa fecha (min. 2). Una tarea larga se evalúa solo en el mes en que vence; una abierta que aún no vence queda fuera | `tasks` |
| `cnp` | igual, sobre solicitudes CNP (min. 1) | `cnp_requests` |
| `grilla`, `calendario`, `metricas`, `artes` | semanas/cuentas cumplidas / meta (min. 2), de `byTaskKey` de `aggregateEmployeeFixedTasksByRole` | `fixed_task_marks` |
| `plataformas` | cobertura del Chequeo: `realizado / meta` con `computePlataformasProductividad` sobre las cuentas con `social_manager_id = user` (meta 4 registros/mes por casilla cuenta × red × tipo, 1 en YouTube/Mailchimp; respeta el opt-out `fixed_tasks.plataformas`). Aplica desde 2026-09 | `publication_checks`, `metric_clients` |
| `pautas` | pautas `realizada` / (realizadas + `programada` ya vencidas) donde es recurso (`recurso_ids`); declinadas y solicitadas no cuentan | `av_pautas` |
| `piezas_grabadas`, `fotos`, `videos` | grabadas vs editadas de la persona (todos los formatos / F / V+R): lo que grabó (`grabacion_por_formato`) y la proporción editada de ese formato (`piezas_por_formato.editadas / salieron`, tope 1). Una pauta sin reparto o sin `salieron` se omite | `av_pautas` |
| `edicion_cnp` | piezas de CNP con `is_audiovisual` asignados al empleado en el mes: entregadas / solicitadas | `cnp_requests` |
| `edicion` | ediciones solicitadas vs editadas de quien edita (sin importar el cargo): piezas `listo` / asignadas como `editor_user_id` **más** las piezas de CNP audiovisual asignadas, en un solo cociente; sin puntualidad | `av_pauta_piezas`, `cnp_requests` |
| `campanas`, `tickets` | sin cambios (tickets solo IT) | `campaigns`/`paid_campaigns`, `support_tickets` |

Los indicadores anteriores (`entregas`, `puntualidad`, `arrastre`, `tareas_fijas`, `piezas_av`, `reuniones`, `chequeo`) siguen en el catálogo con peso 0: los snapshots viejos los usan y se pueden reactivar desde Perfiles de Desempeño. `arrastre` solo cuenta como arrastrada la tarea abierta de un mes anterior cuyo `due_date` ya llegó.

**Perfiles** (pesos en `employee_score_profiles`, match por cargo > departamento > default; la edición pesa más en todo cargo que edita): Social Media Manager grilla, calendario, métricas, plataformas, tareas y cnp a partes iguales (16,67% c/u) · Diseñador cnp 40/artes 40/tareas 20 · Creador Cont. Audiov. pautas 30/piezas_grabadas 30/edicion_cnp 30/tareas 10 · Fotógrafo pautas 20/fotos 40/videos 40 · Editor de video edicion 70/tareas 30 · Coord. de Audiovisual edicion 60/tareas 40 · Community Manager todo 0 (solo evaluación del jefe) · IT tickets 60/tareas 40 · Marketing/Ads campañas 60/tareas 40 · Dirección/Admin y Back-office tareas 100 · Default y departamentos Redes/Diseño/Audiovisual tareas 70/cnp 30. Un indicador con peso pero sin datos cede su peso a los demás. Sin datos suficientes: peso aplicable < 50, menos de 2 unidades o ningún indicador aplicable.

`buildScoreNarrative` (`src/utils/employeeScoreNarrative.js`) nunca cita el indicador `reuniones`
como fortaleza, punto a mejorar ni tendencia (mismo criterio aplicado al análisis IA en
`evaluation-analysis.js`): `meetings.status` lo marca quien convoca la reunión, no refleja
asistencia de la persona evaluada. Sigue sumando al score y visible con su % en el desglose.

**Nota general combinada** (`src/utils/employeeCombinedScore.js#combineScores`): se calcula
al leer, no se persiste — `employee_score_snapshots` es inmutable y se congela el día 5, pero
el jefe puede evaluar después o corregir su evaluación; combinar en lectura evita reabrir
snapshots ya comunicados. Reglas: score automático + jefe → 70/30; solo uno de los dos → ese
valor tal cual (sobre 10, `autoSobre10 = score / 10`); ninguno → sin datos. La evaluación del jefe puntúa cada criterio de 1 a 10 (`ManagerRatingModal`); `notaColor` usa los mismos umbrales que `ScoreDial` sobre `nota * 10`. La narrativa y el análisis IA hablan del puntaje en /10. Un cargo sin score automático (p. ej. Community
Manager, Editor de Video) usa **solo** la evaluación del jefe — es la única fuente posible para
esos cargos, y por eso `DesempenoView` los incluye en la lista aunque no tengan score.

Cada fila del desglose muestra el porcentaje, la frase de cifras (`formatIndicatorDetail` en `src/utils/employeeScoreDetail.js`, armada con `breakdown[].detalle`, también en meses cerrados) y su peso en el total; si el indicador no aplicó, `explainNoData` da el motivo leyendo los mínimos de `MIN_UNITS` (`employeeScore.js`). El botón "i" (`InfoTip`) muestra `INDICATOR_DESCRIPTIONS` (`employeeScoreProfiles.js`). Un indicador nuevo necesita su entrada en esos mapas y en `DETAIL_FORMATTERS` de la narrativa.

El desglose automático (`ScoreBreakdownCard`) solo lista los indicadores con `pesoBase > 0` en
el perfil resuelto del empleado — un indicador que no aplica a tu cargo (peso 0) ya no se
muestra atenuado con "No aplica a tu cargo", directamente se omite. Los que sí aplican pero
no tuvieron datos ese mes siguen visibles como "Sin datos suficientes este mes".

**Perfil "Operativo / Back-office"** (`20260918000003_seed_backoffice_score_profile.sql`): match por `position_ids` para Sub-Director, Coord. Tecnología y Coord. de Desarrollo Laboral. El matcheo de perfiles es por `users.department_id`, no por `positions.department_id` (puede ser `null` aunque el cargo tenga departamento). Solo tareas.
