### 2.4quater Chequeo (sub-módulo de Tareas)

**Ruta:** `/tareas/chequeo` — sub-link de Gestión de Tareas en el Sidebar, debajo de Tareas Fijas.

#### Archivos
- `src/pages/ChequeoPage.jsx` · `src/components/chequeo/ChequeoGrid.jsx`
- `src/components/chequeo/ChequeoSummary.jsx` — fila de KPIs, reutiliza `src/components/tareas/KpiCard.jsx`
- `chequeoApi.js` — datos: `loadChecks(companyId, year, month)`, `upsertCheck`
- `src/utils/fixedTasks.js` → `buildChequeoWeeks`
- `src/utils/chequeo.js` — lógica pura: `currentFixedWeekN`, `mostRecentCheck`, `recentCheckStatus`, `daysSince`, `formatCheckDate`, `contentTypeApplies`, `WEEKLY_EXEMPT_NETWORKS`, `MONTHLY_TARGET_PER_NETWORK`, `computePlataformasProductividad`, `computeChequeoSummary`, `periodEndDate`, `checkReferenceDate`, `effectiveLineId`, `clientsForLine`

#### Grilla
- Filas `cuenta/red social × tipo de contenido`, periodizada por **mes + semana lun-dom**. Cada semana pertenece al mes que tiene más días de ella (4 o más de 7, o sea el mes de su jueves): `buildChequeoWeeks` (`fixedTasks.js`), siempre esa regla, también hacia atrás. Ej.: 28 sep–4 oct es S1 de octubre; oct 2026 tiene 5 semanas y sep 2026, 4. Tareas Fijas (§2.4bis) usa la misma regla solo desde nov 2026. Selector de mes + chips `S1…Sn`.
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
- Gotcha: el semáforo se mide contra el domingo de la semana; si las semanas se construyen con otra regla que la de las CMs (miércoles en vez de mayoría) todo sale una semana tarde → naranja/rojo. Chequeo y su fila de Productividad usan siempre `buildChequeoWeeks`.

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

#### Chequeo de temporada (`/tareas/chequeo/temporada`)
- Botón «Chequeo de temporada →» en `ChequeoPage`. Página propia `src/pages/ChequeoTemporadaPage.jsx` (no es un `viewMode` de Chequeo: mes y semanas no aplican); breadcrumb vuelve a Chequeo y el Sidebar resalta Chequeo (`isChequeoRoute` usa `startsWith`).
- Archivos: `src/components/chequeo/temporada/{TemporadaGrid,TemporadaCell}.jsx`, `src/components/chequeo/temporadaApi.js` (`loadCampaigns`, `loadPieces`, `upsertCell`), `src/utils/temporada.js` (lógica pura: formatos, estados, KPIs, filtros).
- Tablas `seasonal_campaigns` / `seasonal_pieces` (ver `datos.md`). Fila por cliente. Cada fecha de publicación tiene un header con la fecha y debajo tres subcolumnas: FORMATO, DISEÑO y AUDIOVISUAL (header de dos filas, `colSpan=3`); cada tarjeta es una sola columna de estado (`rowSpan=2`). Cada campo es un `StatusPill` editable (`TemporadaCell.jsx`) y se guarda solo, una fila por cliente × slot.
- Personal (Jefe y SM, las dos casillas con nombre de la hoja): cada una es un selector compacto (`PersonPicker.jsx`): la casilla muestra solo foto + nombre de pila y el menú (portal, con buscador y «Ninguno») el nombre completo. Arranca con lo de MAPPI (jefe = `metric_line_members.is_lead` / `line.lead_user_id`; SM = `metric_clients.social_manager_id`) y se puede cambiar solo para la temporada (`seasonal_assignments`, no toca línea ni cliente). Solo se ofrecen las personas de los desplegables JEFE y SM de la hoja (`SHEET_ASSIGNEES`, emparejadas por nombre de pila; `allowedAssignees`), más la ya asignada. «Ninguno» = sin asignar a propósito. Una casilla cambiada a mano se resalta y muestra un ↺ que borra la asignación y vuelve a la persona de MAPPI. «Independientes» no tiene jefe de MAPPI, arranca vacío. Sin `chequeo.manage` es solo lectura. UI en `PersonSelect.jsx`.
- Diseño de la grilla (`TemporadaGrid.jsx`): las columnas Cliente y personal son angostas (`CLIENT_COL`/`PERSON_COL`) y la de Cliente queda fija al hacer scroll horizontal, para que quepan las fechas. Las columnas se separan solo con líneas verticales (`VLINE`, sin líneas horizontales); la fija usa sombra interior (`STICKY_LINE`) porque con bordes colapsados su borde no se movería con ella. La fila se sombrea al pasar el cursor (`group` + `hover:bg-[#faf9f5]`) y la celda fija, que tiene fondo propio, sigue ese hover con `group-hover`. Los grupos de columnas (cada fecha o tarjeta) se intercalan con un fondo amarillo suave (`groupHead`/`groupBody`, empezando por el primero); sus celdas llevan fondo propio y también siguen el hover de la fila.
- Formatos y estados idénticos a la hoja «Seguimiento - Navidad» (`utils/temporada.js`): FORMATO = `Diseño` / `Audiovisual - Foto` / `Audiovisual - Reel`. Las dos columnas de estado empiezan por N/A y tienen listas distintas. DISEÑO y las tarjetas: Pendiente por redes, Enviado a diseño, En modificación, Enviado al cliente, Aprobado (verde, letras blancas), Pendiente cliente (rojo clarito, letras rojas). AUDIOVISUAL: Pendiente por grabar, Agendado, En edición, Enviado al cliente, Aprobado, Pendiente cliente, En diseño. «N/A» es un valor guardado (`na`) y no cuenta como pieza; una columna sin tocar es null y se muestra «Sin estado» (no se elige del menú). Para los KPIs cada columna de estado con valor (que no sea N/A) es una pieza; terminada = Aprobado.
- Accesos gestionables desde Empresa → Accesos: `tareas.chequeo.temporada` (ver: botón en Chequeo, ruta con `RequireModule` anidado y SELECT de `seasonal_*`) y `chequeo.temporada.manage` (editar piezas y personal; `canManage` de la página y policies de escritura de `seasonal_pieces`/`seasonal_assignments`, con el alcance por línea de Chequeo). El alcance de líneas sigue usando `chequeo.ver_todo`. «+ Agregar cliente» sigue siendo `empresa.clientes.manage`. Realtime sobre `seasonal_pieces` y `seasonal_assignments`.
- Filtros (`FilterBar`): temporada (si hay más de una), estado y «solo pendientes» (cuentas con alguna pieza que no esté en «Aprobado»; N/A no cuenta).
- Botón «← Volver al chequeo» (arriba a la derecha, siempre visible) que regresa a `/tareas/chequeo`; el breadcrumb «Chequeo» también enlaza ahí.
- Botón «+ Agregar cliente» (`AddClientModal.jsx`): visible solo con `empresa.clientes.manage` (la RLS de `metric_clients` lo exige). Pide nombre, línea y SM opcional (de las personas del desplegable de la hoja) y crea un **cliente real de MAPPI** con `createClient`; el resto de sus datos se completa en Empresa → Clientes. Rechaza nombres que ya existen (sin importar mayúsculas ni espacios). El cliente aparece de inmediato en la grilla, sin piezas.

#### Conexión → Productividad / Reportes
- Fila «Actualización de Plataformas» de `report.productividad.tareas`: `OperacionesView.jsx` la deriva de `publication_checks` del mes (`loadChecks` + `computePlataformasProductividad`). Corte: `CHEQUEO_PRODUCTIVIDAD_START = {year:2026, month:9}` en `constants.js` (§2.4bis).
- Meta = celdas aplicables (`contentTypeApplies`) × `MONTHLY_TARGET_PER_NETWORK` (4 fijo, aunque el mes tenga 5 semanas); redes exentas × 1.
- Real = nº de semanas distintas con fecha por celda, topado en la meta (exentas: 1 si hubo al menos una).
