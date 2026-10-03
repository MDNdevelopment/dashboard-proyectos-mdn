### 2.4quater Chequeo (sub-módulo de Tareas)

**Ruta:** `/tareas/chequeo` — sub-link de Gestión de Tareas en el Sidebar, debajo de Tareas Fijas.

#### Archivos
- `src/pages/ChequeoPage.jsx` · `src/components/chequeo/ChequeoGrid.jsx`
- `src/components/chequeo/ChequeoSummary.jsx` — fila de KPIs, reutiliza `src/components/tareas/KpiCard.jsx`
- `chequeoApi.js` — datos: `loadChecks(companyId, year, month)`, `upsertCheck`
- `src/utils/chequeo.js` — lógica pura: `currentFixedWeekN`, `mostRecentCheck`, `recentCheckStatus`, `daysSince`, `formatCheckDate`, `contentTypeApplies`, `WEEKLY_EXEMPT_NETWORKS`, `MONTHLY_TARGET_PER_NETWORK`, `computePlataformasProductividad`, `computeChequeoSummary`, `periodEndDate`, `checkReferenceDate`, `effectiveLineId`, `clientsForLine`

#### Grilla
- Filas `cuenta/red social × tipo de contenido`, periodizada por **mes + semana fija** (igual que Tareas Fijas §2.4bis, ancladas al miércoles, `buildFixedWeeks`). Selector de mes + chips `S1…Sn`.
- El chip es solo la casilla donde se registra; la **fecha es libre** (`<input type="date">` sin `min`/`max`, puede ser de otra semana/mes): registro histórico fiel. Cualquier semana (incluido histórico) es editable sin confirmación. Guardado instantáneo.
- Cada marca: fila de encabezado a ancho completo (fondo más oscuro) con logo (`metric_clients.logo_url`, o inicial). Cada red: ícono real (`NetworkIcon`, §5) y nombre enlazado a `social_links[].link`.
- Redes de cada fila derivadas de `metric_clients.social_links` (no se recapturan en Chequeo).
- **Solo Instagram** tiene Reels y Highlights; en las demás redes esas columnas son celda estática "no aplica" (`contentTypeApplies`).
- **Mailchimp** (en "Publicaciones"): exige fecha + comentario juntos (`MailchimpEditor`, formulario propio).
- **Mailchimp y YouTube** (horizontal) ∈ `WEEKLY_EXEMPT_NETWORKS`: cadencia mensual; semana cerrada sin registro → gris/"pendiente", nunca rojo. YouTube Shorts NO es exenta.

#### Semáforo (`recentCheckStatus`, igual en vista semanal y "más reciente")
- Días desde la fecha registrada hasta la **fecha de referencia** del período: verde 0-6, naranja 7-12, rojo 13+, gris sin registro. No mide "cumplimiento de la semana".
- Referencia (`checkReferenceDate` + `periodEndDate`): "hoy" si el período (semana activa, o mes en vista reciente) sigue en curso; si ya pasó, **congelada en la fecha de cierre** del período.
- `ChequeoGrid`/`ChequeoPage` la calculan una vez por render y la pasan explícita a `recentCheckStatus`/`computeChequeoSummary` (no usar su default `new Date()`).
- Gotcha: con el default `new Date()` todo lo marcado a tiempo terminaba en rojo al pasar el tiempo.

#### Vista "Ver fecha más reciente"
- Botón junto al selector de semana → `ChequeoGrid` con `viewMode='recent'`: solo lectura; cada celda muestra la fecha más reciente de cualquier semana del mes (`mostRecentCheck`, ignora `period_week`). Mismo semáforo. Chips `S1…Sn` ocultos.

#### KPIs (`ChequeoSummary`)
- `computeChequeoSummary` calcula el objeto completo, pero solo se renderizan `totalCuentas`, `actualizadas`, `porVencer`: **Cuentas** (en alcance), **Actualizadas** (todas sus casillas aplicables con fecha en el período), **Por vencer** (algún naranja, ningún rojo).
- Sigue la vista activa: `weekN` en modo semana, mes completo en "más reciente".
- Parciales / Sin registrar / En alerta no van como cards; se ven en la barra "Estado de cuentas" bajo las tarjetas.
- Vista "Todas" (`groupByLine=true`): encabezado por línea con nombre y mini-resumen antes de sus cuentas.

#### Líneas e "Independientes"
- El selector incluye la línea general `Independientes` (`metric_lines.is_general=true`, §2.4/§2.5): agrupa cuentas movidas a ella + las de `line_id=null` (`effectiveLineId`/`clientsForLine`). Visible para **cualquier** usuario del módulo; las demás líneas siguen scoped por `visibleLinesForUser`.
- Al guardar un chequeo de cuenta sin línea se persiste `publication_checks.line_id` = id de la línea general (nunca `null`), para no chocar con RLS.

#### Tabla `publication_checks`
- `id, company_id, client_id→metric_clients CASCADE, line_id→metric_lines (snapshot), network, content_type 'publicaciones'/'reels'/'highlights', last_published_at date, comment text, period_year int, period_month int (1-12), period_week int (1-5), updated_by, updated_at` (`comment` solo Mailchimp).
- UNIQUE `(client_id, network, content_type, period_year, period_month, period_week)`: una fila por celda × semana, sobrescrita al re-registrar (patrón `fixed_task_marks`).
- Índice `publication_checks_company_line_period_idx (company_id, line_id, period_year, period_month)`. Realtime habilitado.
- `public.fixed_week_of(date)`: solo usada en el backfill de la migración (replica `buildFixedWeeks`).
- `publication_check_events` ya no existe (dropeada). No reintroducir.

#### Permisos
- Capabilities (módulo `tareas`): `tareas.chequeo` (ver; sin reglas = abierto), `chequeo.manage` (registrar fechas; seed nivel 2+), `chequeo.ver_todo` (ver **y editar** todas las líneas sin ser nivel 4/admin; sin seed; se otorga en Empresa → Accesos con `{"type":"user","ids":[...]}` o `{"type":"position","ids":[...]}`, patrón de `audiovisual.ver_todo`).
- "Acceso completo" = `chequeo.ver_todo` + `chequeo.manage` a la misma persona.
- RLS `publication_checks`: SELECT abierto a autenticados. Escritura: `user_can('chequeo.manage')` **y** (`task_user_view_all()` o `user_can('chequeo.ver_todo')` o `task_user_in_line()` o `task_is_general_line()` — llamado como `task_is_general_line(line_id::text)`, mismo helper que Tareas).
- A diferencia de Tareas, escribir en "Independientes" solo exige `chequeo.manage` (no ser miembro sin línea).
- UI: `visibleLinesForUser(lines, userProfile, { extraViewAll: can('chequeo.ver_todo') })` en `ChequeoPage.jsx` — nivel 4/admin o `chequeo.ver_todo` ven todas las líneas + "Todas"; el resto solo la suya; "Independientes" se agrega aparte para todos.
- Gotcha: el bypass `chequeo.ver_todo` debe estar también en RLS; sin él la UI mostraba todas las líneas pero la BD rechazaba escribir fuera de la propia.

#### Conexión → Productividad / Reportes
- Fila «Actualización de Plataformas» de `report.productividad.tareas`: `OperacionesView.jsx` la deriva de `publication_checks` del mes (`loadChecks` + `computePlataformasProductividad`). Corte: `CHEQUEO_PRODUCTIVIDAD_START = {year:2026, month:9}` en `constants.js` (§2.4bis).
- Meta = celdas aplicables (`contentTypeApplies`) × `MONTHLY_TARGET_PER_NETWORK` (4 fijo, aunque el mes tenga 5 semanas); redes exentas × 1.
- Real = nº de semanas distintas con fecha por celda, topado en la meta (exentas: 1 si hubo al menos una).
