# Evaluaciones

Evaluación de desempeño con dos fuentes: un score **automático** 0–100 por empleado y
mes, calculado solo a partir de datos que ya existen en el sistema (tareas, CNP, tareas
fijas, piezas audiovisuales, reuniones, campañas, chequeo, tickets IT); y, desde la
extensión "evaluación del jefe", una evaluación **subjetiva** mensual de 1–4 criterios
por cargo (definidos en Empresa → Perfiles de Desempeño), que un jefe (nivel 3+ o admin)
puntúa 1–5 una vez al mes. Ninguna de las dos reemplaza a la otra: la ficha de un
empleado muestra ambas, más una **nota general /5** que las combina (70% automático +
30% jefe cuando hay ambas) vía `resolveEmployeeNota` (`src/utils/employeeCombinedScore.js`)
— única fuente de verdad de esa nota, la usan por igual la tabla de `DesempenoView`, el
modal de detalle (`ScoreBreakdownCard`) y `MiDesempenoView`, para que nunca diverjan de
escala entre sí. La **tabla** de `DesempenoView` ordena por defecto por esa nota
combinada /5 (columna "Nota", reordenable por cualquier columna); el **ranking oficial**
que expone `useEmployeeScores` (`result.ranking`, `enRanking`) sigue siendo solo por el
score automático 0–100 — la nota del jefe es informativa y no siempre está puesta para
todos en un mes dado, así que no debe decidir un ranking oficial. El flujo manual original (preguntas 1–5 respondidas por un manager,
`evaluation_sessions`) se retiró en la fase F6; el historial manual se conserva de solo
lectura y es un esquema distinto al de la evaluación del jefe actual.

|---|---|
|---|---|
| **Propósito** | Score automático de desempeño por empleado/mes (9 indicadores ponderados por perfil de cargo) + evaluación subjetiva mensual del jefe (criterios por cargo) + nota general combinada. Vista propia (Mi Desempeño), vista de equipo + ranking (Desempeño, nivel 2+), historial legacy de solo lectura, análisis IA opcional sobre el score. |
| **Archivos principales** | `src/pages/EvaluacionesPage.jsx` · `src/components/evaluaciones/{DesempenoView,MiDesempenoView,EmployeeScoreModal,ScoreBreakdownCard,IndicatorRow,ManagerRatingCard,ManagerRatingModal,HistorialLegacyView,EmployeeProfileView,AiEvaluation}.jsx` · `src/components/empresa/{ScoreProfilesPanel,CriteriaByPositionPanel}.jsx` · `src/utils/{employeeScore,employeeScoreProfiles,employeeAvailability,employeeScoreNarrative,employeeScoreSnapshot,managerRating,employeeCombinedScore}.js` · `src/hooks/{useEmployeeScores,useManagerRatings}.js` · `netlify/functions/employee-scores-snapshot.js` |
| **Tablas** | `employee_score_profiles` (pesos por cargo/departamento/nivel) · `employee_score_snapshots` (score automático congelado por mes, `unique(user_id, year, month)`) · `evaluation_criteria` (criterios subjetivos por cargo, hasta 4) · `manager_ratings` (evaluación del jefe por empleado/mes, `unique(user_id, year, month)`, `items` congela ícono/nombre del criterio al momento de evaluar) · legacy solo lectura: `evaluation_sessions/responses/comments`, `questions/question_positions/question_tags` |
| **RPC** | `employee_score_inputs(p_year, p_month)` — datos crudos del mes, ya acotados por RLS a lo que el caller puede ver |
| **IA** | Netlify fn `netlify/functions/evaluation-analysis.js` → Gemini (bajo demanda, desde `AiEvaluation.jsx`); recibe el score/breakdown/narrativa del empleado, no respuestas manuales |
| **Rutas** | `/evaluaciones` (Desempeño) · `/evaluaciones/mi-desempeno` · `/evaluaciones/historial` (legacy) · `/evaluaciones/empleado/:id` — redirects: `/evaluaciones/resumen`, `/evaluaciones/perfil-v2`, `/evaluaciones/desempeno` → `/evaluaciones`; `/evaluaciones/perfil` → `/evaluaciones/mi-desempeno` |
| **Permisos** | Cada quien ve su propio score/evaluación. `evaluaciones.ver_todo`: ver el desempeño de todos + ranking (nivel 4/admin por defecto). Nivel 2–3 ve su línea vía RLS (`metric_line_members`). `evaluaciones.recalcular`: recongelar un mes cerrado. `evaluaciones.perfiles.manage`: editar pesos por cargo y criterios de la evaluación del jefe. `evaluaciones.evaluar` (nivel 3+ o admin): evaluar mensualmente a un empleado — RLS prohíbe autoevaluación y exige la misma visibilidad que `evaluaciones.ver_todo`/línea. |
| **Cruce con otros módulos** | Deriva el score de `tasks`, `cnp_requests`, `fixed_task_marks`, `av_pauta_piezas`, `meetings`, `campaigns`/`paid_campaigns`, `publication_checks`, `support_tickets` y `vacations` — no captura nada manualmente. `MiDesempenoView` ya no conserva el panel operativo (tareas/proyectos, portado de Mi Perfil v2) que traía heredado — se retiró para dejar la vista enfocada solo en el score; ese detalle ya vive en Tareas y en las fichas de Reportes. |

`buildScoreNarrative` (`src/utils/employeeScoreNarrative.js`) nunca cita el indicador `reuniones`
como fortaleza, punto a mejorar ni tendencia (mismo criterio aplicado al análisis IA en
`evaluation-analysis.js`): `meetings.status` lo marca quien convoca la reunión, no refleja
asistencia de la persona evaluada. Sigue sumando al score y visible con su % en el desglose.

**Nota general combinada** (`src/utils/employeeCombinedScore.js#combineScores`): se calcula
al leer, no se persiste — `employee_score_snapshots` es inmutable y se congela el día 5, pero
el jefe puede evaluar después o corregir su evaluación; combinar en lectura evita reabrir
snapshots ya comunicados. Reglas: score automático + jefe → 70/30; solo uno de los dos → ese
valor tal cual (sobre 5); ninguno → sin datos. Un cargo sin score automático (p. ej. Community
Manager, Editor de Video) usa **solo** la evaluación del jefe — es la única fuente posible para
esos cargos, y por eso `DesempenoView` los incluye en la lista aunque no tengan score.

El desglose automático (`ScoreBreakdownCard`) solo lista los indicadores con `pesoBase > 0` en
el perfil resuelto del empleado — un indicador que no aplica a tu cargo (peso 0) ya no se
muestra atenuado con "No aplica a tu cargo", directamente se omite. Los que sí aplican pero
no tuvieron datos ese mes siguen visibles como "Sin datos suficientes este mes".

**Perfil "Operativo / Back-office"** (`20260918000003_seed_backoffice_score_profile.sql`):
match por `position_ids` para Sub-Director, Coord. Tecnología y Coord. de Desarrollo Laboral
— los únicos cargos que caían en el perfil `Default` (que reparte peso en piezas
audiovisuales/campañas/chequeo/tareas fijas, indicadores que no les aplican) por no matchear
ningún perfil por departamento. Caso detectado con Coord. Tecnología: `users.department_id`
puede ser `null` aunque el cargo pertenezca a un departamento (dato incompleto de la persona,
no del cargo) — el matcheo de perfiles es por `users.department_id`, no por
`positions.department_id`. Pesos: `entregas 60, puntualidad 25, arrastre 15`, resto 0 (solo
tareas, sin producción de contenido).
