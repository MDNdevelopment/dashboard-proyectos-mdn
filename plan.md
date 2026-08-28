# Auditoría de permisos y RLS — plan de corrección

## Contexto

Antes de abrir la herramienta a toda la empresa (47 usuarios: 37 de nivel 1, 5 de nivel 2,
6 de nivel 3, 4 de nivel 4; 5 con `admin=true`) se auditó qué puede ver y hacer cada nivel.

Se revisaron las tres capas: rutas del router, `can()` con las reglas reales de
`module_permissions` en producción (no los seeds del repo, que ya divergen), y las
políticas RLS reales de Postgres.

**Conclusión:** la capa de UI está razonablemente bien; la capa de base de datos NO.
Hay agujeros que permiten a cualquier empleado —y en algunos casos a cualquier persona en
internet con la clave anon que va en el bundle JS— leer sueldos, cambiarse el nivel de
acceso o borrar tablas enteras. **No se debe lanzar sin corregir el Bloque 1.**

---

## Parte A — Matriz de acceso real por nivel (según UI)

Modelo: dos ejes independientes — `access_level` (1–4) y `admin` (bool, bypass total) —
más capabilities configurables en Empresa → Permisos. Regla clave del evaluador
(`src/lib/permissions.js:65-82`): una capability sin fila en `module_permissions`
está ABIERTA a todo autenticado.

### Módulos (entrada al menú)

| Módulo                            | N1  | N2  | N3  | N4  | Regla real en prod                                                  |
| --------------------------------- | --- | --- | --- | --- | ------------------------------------------------------------------- |
| Inicio                            | ✔   | ✔   | ✔   | ✔   | sin guard                                                           |
| Soporte Técnico (Tickets)         | ✔   | ✔   | ✔   | ✔   | sin fila = abierto                                                  |
| Tareas (+ Fijas, Pautas, Chequeo) | ✔   | ✔   | ✔   | ✔   | sin fila = abierto                                                  |
| CNP                               | ✔   | ✔   | ✔   | ✔   | sin fila = abierto                                                  |
| Campañas (Ads)                    | ✔   | ✔   | ✔   | ✔   | `{all: []}` = abierto                                               |
| Reuniones                         | ✔   | ✔   | ✔   | ✔   | sin fila = abierto                                                  |
| Empresa                           | ✔   | ✔   | ✔   | ✔   | sin fila = abierto                                                  |
| Proyectos                         | ✔*  | ✔*  | ✔   | ✔   | regla configurada: min_level 3 — pero la ruta no tiene guard ni RLS |
| Reportes                          | ✘   | ✘   | ✔   | ✔   | min_level 3, con deny a Katherine Mora y Juan Lauretta              |
| Leads                             | —   | —   | ✔   | ✔   | min_level 3                                                         |
| Evaluaciones                      | ✘   | ✘   | ✘   | ✘   | solo Juan Lauretta (+ admins por bypass)                            |

\* `/proyectos` entra igual para todos en `RequireModule` (`src/main.jsx:264`) y el ítem del
Sidebar (`src/components/Sidebar.jsx:537`) no valida el permiso. La escritura tampoco está
bloqueada.

### Pestañas de Empresa

| Pestaña                | N1  | N2  | N3  | N4  |
| ---------------------- | --- | --- | --- | --- |
| General                | ✔   | ✔   | ✔   | ✔   |
| Clientes (ver)         | ✔   | ✔   | ✔   | ✔   |
| Líneas (ver)           | ✔   | ✔   | ✔   | ✔   |
| Departamentos          | ✘   | ✔   | ✔   | ✔   |
| Empleados (directorio) | ✘   | ✔   | ✔   | ✔   |
| Preguntas              | ✘   | ✘*  | ✘   | ✔   |
| Permisos               | ✘   | ✘   | ✘   | ✔   |

\* Excepto Sofía Lauretta (permisos granulares de RRHH).

### Acciones de escritura

| Acción                                                                                                                        | Quién                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Crear/editar tareas (`tareas.manage`)                                                                                         | todos (sin fila)                                                  |
| Crear/editar campañas/presupuestos (`ads.manage`)                                                                             | nivel 1 [verificar: ver Bloque 2 — debería ser min_level 3]       |
| Editar pautas audiovisuales (`audiovisual.manage`)                                                                            | todos (`rules: []`)                                               |
| Coordinar pautas [verificar: fragmento original incompleto, mencionaba "todas" y un apellido cortado, posiblemente "Andrade"] | —                                                                 |
| Chequeo: marcar y ver todo                                                                                                    | position 7 + Juan Lauretta                                        |
| Tareas fijas, CNP, Reuniones, Evaluaciones (manage)                                                                           | [verificar: quién exactamente — fragmento cortado en el original] |
| Clientes / Líneas (manage)                                                                                                    | nivel ≥ 3 (+ Sofía en líneas)                                     |
| Proyectos (manage)                                                                                                            | nivel ≥ 3                                                         |
| Reportes: editar                                                                                                              | nivel ≥ 3 (deny: Katherine, Juan)                                 |
| Reportes: cerrar (`reportes.close`)                                                                                           | nivel ≥ 4 — no configurable desde la UI                           |
| Empleados: crear/editar, vacaciones, ver sueldo, calendario global                                                            | nivel ≥ 4 + Sofía Lauretta                                        |
| Aprobar impresión CNP                                                                                                         | Stephanie Portillo                                                |
| Cambiar nivel/admin de usuario                                                                                                | [verificar: quién — fragmento cortado en el original]             |
| Datos financieros (mensualidades, sueldos, reportes)                                                                          | `isFinancePrivileged`                                             |
| Chat IA                                                                                                                       | solo `admin=true`                                                 |
| Análisis IA del CEO                                                                                                           | allowlist de 3 `user_ids` (`...lysisAccess.js:7-11`)              |
| Tickets: tomar/cerrar todos                                                                                                   | position == 0 (Ovidio Pirela)                                     |

---

## Parte B — Hallazgos y plan de corrección

### Bloque 1 — BLOQUEANTES del lanzamiento (RLS)

Todas verificadas contra `pg_policies` del proyecto `faaqjemovtyulorpdgrd`.

**Estado (2026-08-28): 1.1 a 1.10 corregidos y aplicados a producción**, salvo 1.6 (rotación de
la contraseña de `mcp_readonly`, a cargo del usuario). Migraciones aplicadas:
`20260828160000_fix_users_rls_privilege_escalation.sql`,
`20260828160100_fix_positions_questions_rls.sql`, `20260828160200_fix_evaluations_rls.sql`,
`20260828160300_fix_metric_line_members_rls.sql`, `20260828160400_fix_metric_reports_insert_bug.sql`,
`20260828160500_fix_task_comments_rls.sql`, `20260828160600_fix_projects_lines_clients_write_rls.sql`.
Código: `netlify/functions/update-employee.js` (nuevo, 1.10), `netlify/functions/evaluation-analysis.js`
(autorización agregada, 1.9), `src/pages/EvaluacionesPage.jsx` (guard de `/evaluaciones/empleado/:id`,
1.9). Ver `ARQUITECTURA.md` → Modelo de permisos para el detalle de cada policy. Tests nuevos:
`netlify/functions/_lib/update-employee.test.js`, `netlify/functions/_lib/evaluation-analysis.test.js`;
`src/test/EmployeeModal.test.jsx` actualizado al nuevo flujo. Correcciones sobre el texto
reconstruido del plan original (ver hallazgos abajo, cada uno anota qué cambió vs. lo escrito
inicialmente tras verificar contra la base real).

**1.1 `users` está completamente abierta.**
Policies actuales: `SELECT using(true)` · `UPDATE using(true)` · `INSERT check(true)` ·
`DELETE using(true)` para el rol `public` (incluye `anon`). [verificar: detalle exacto de la
policy de UPDATE, fragmento cortado en el original]

Consecuencias:

- Cualquier empleado de nivel 1 lee `monthly_salary` de toda la plantilla con una llamada
  a la API. El ocultamiento por `empresa.empleados.sensible` es solo visual.
- Cualquier empleado puede hacer un UPDATE y ponerse `access_level=4` o `admin=true`. Esto
  además convierte el toggle del Sidebar (`src/components/Sidebar.jsx:205-217`) en una
  escalada real, no inocua.
- Cualquiera con la clave anon (pública, va en el bundle) puede leer/escribir la tabla `users`
  sin siquiera iniciar sesión.

Corrección: nueva migración que reemplace las 4 policies — SELECT para `authenticated`
(moviendo `monthly_salary` a una tabla `users_private` como ya existe, o creándola);
UPDATE limitado a `auth.uid() = user_id` sin poder tocar `access_level`/`admin`/`deleted_at`,
más una rama para `is_company_admin()` que sí pueda tocar esos campos; INSERT/DELETE solo
admin, nunca `public`. Y quitar el "god mode" del Sidebar.

**1.2 `positions` y `questions`** [verificar: nombre exacto de tablas, fragmento cortado]
tienen policies abiertas al rol `public` (`UPDATE`/`DELETE using(true)`) — editables desde
internet sin login. Misma migración que 1.1.

**1.3 Evaluaciones de desempeño sin protección.**
`evaluation_sessions`, `evaluation_responses` [verificar: puede haber más tablas, fragmento
cortado] tienen `SELECT using(true)` e `INSERT`/`DELETE using(true)`. El módulo está oculto en
la UI para todos menos Juan Lauretta, pero cualquiera con acceso a la API lee y borra las
evaluaciones de cualquier compañero. Corrección: RLS limitado a evaluado + evaluador +
min_level 4/admin.

**1.4 `metric_line_members` es escribible por cualquiera** (`for all using(true)`,
`supabase/migrations/20260710000000_line_members_relation.sql`). Es la llave de
`task_user_in_line()`, que gobierna el RLS de tareas, tareas fijas, chequeo, CNP, pautas y
reportes. Un nivel 3 se auto-inserta en la línea que quiera y lee sus finanzas.
Corrección: escritura solo con `empresa.lineas.manage`.

**1.5 Bug de RLS en `metric_reports` INSERT** — mismo archivo, ~línea 87: la condición
compara `mlm.line_id = mlm.line_id` (se compara la columna consigo misma) en vez de
`mlm.line_id = metric_reports.line_id`, así que siempre es `true`. Cualquiera puede insertar
reportes de una línea ajena —con datos de nómina—. Corrección: comparar contra
`metric_reports.line_id`.

**1.6 Rol `mcp_readonly` con `BYPASSRLS` y contraseña placeholder commiteada**
(`20260813000000` + [verificar: segunda migración relacionada, fragmento cortado],
contraseña literal `'CHANGE_ME_ROTATE_BEFORE_USE'`). Si no se rotó, ese login evade todo el
RLS. Verificar y rotar hoy.

**1.7 `task_comments` totalmente abierta** (`20260706000003`): `SELECT`/`INSERT`/`DELETE
using(true)`. Filtra el contenido de tareas que el RLS de `tasks` sí oculta, y cualquiera
puede borrar comentarios ajenos. Corrección: alinear el SELECT con el de `tasks` y limitar
el DELETE al autor.

**1.8 Migraciones de capabilities nunca aplicadas** (deriva repo ↔ producción).
`20260706000000_user_can_evaluator`, `20260706000001_rls_capabilities`,
`20260706000002_seed_capabilities` [verificar: nombre exacto] y
`20260707000000_user_can_negation` no aparecen en `supabase_migrations` de producción — siguen
activas las policies antiguas: `projects`, `metric_lines` y `metric_clients` tienen
`INSERT`/`UPDATE`/`DELETE using(true)`. Es decir, cualquier empleado de nivel 1 puede borrar
proyectos, líneas y clientes. `ARQUITECTURA.md:99-104` afirma lo contrario. Corrección:
re-aplicar esas migraciones (o reescribirlas en una nueva) y añadir un chequeo de deriva al
checklist de release.

**1.9 Perfil de evaluación sin permiso.**
`src/pages/EvaluacionesPage.jsx:45` excluye `/evaluaciones/empleado/:id` del guard de
pestañas, y `EmployeeProfileView.jsx:29-53` no valida nada. Sumado a 1.3, cualquiera con
acceso al módulo abre el historial completo de otro. Además,
`netlify/functions/evaluaciones-*` [verificar: nombre exacto de la function, fragmento
cortado] solo exige `requireUser` (solo JWT) y solo comprueba que el empleado exista — no que
quien pide el análisis IA de desempeño tenga permiso sobre ese empleado. Corrección: exigir
`evaluaciones.empleados` en ambos sitios.

**1.10 La edición de empleados no pasa por el backend.**
Crear y archivar empleados sí pasan por una Netlify function con `requireCapability` y clamp
anti-escalada (`netlify/functions/...:15,55-59` [verificar: nombre exacto de la function]),
pero **editar** hace `supabase.from('users').update({..., access_level, monthly_salary})`
directo desde el navegador (`src/components/...jsx:88-105` [verificar: nombre exacto del
componente]). Con el RLS abierto de 1.1 eso es la vía de escalada. Corrección: mover a una
Netlify function con `requireCapability` y el mismo clamp anti-escalada.

### Bloque 2 — Permisos mal configurados — **CERRADO (2026-08-28)**

Decisiones tomadas con el usuario y aplicadas:

| Qué                                                                                            | Estado antes                                                                 | Resuelto como                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ads.manage`                                                                                   | min_level 1 → cualquiera crea campaña                                        | Corregido a min_level 3 directo en `module_permissions` (prod).                                                                                                                                                                                                                                                                                                                                         |
| `audiovisual.manage`                                                                           | `rules: []` → abierto a todos                                                | Se deja abierto a propósito (cualquiera puede solicitar una pauta). Agendar/aprobar/marcar realizada ya estaba correctamente acotado a Lizdania Andrade + admins vía `audiovisual.coordina` — sin cambios, verificado contra código y BD.                                                                                                                                                               |
| `tareas.manage`                                                                                | sin fila → abierto implícito                                                 | Se agregó fila explícita `rules: [{all: []}]` en las 47 empresas — mismo comportamiento, ya documentado, ya no depende de "sin fila = abierto".                                                                                                                                                                                                                                                         |
| `vacations` SELECT                                                                             | `using(true)` → visible para todos                                           | Restringido a `empresa.vacaciones.manage` (RRHH/nivel 4/admin) vía migración `20260828170000_restrict_vacations_select.sql`. UI ajustada en `EmployeesView.jsx`/`TeamStatusCards.jsx`: la tarjeta "De vacaciones ahora", el botón "Vacaciones" por empleado, el panel "Vacaciones del año" y las pills de vacaciones del calendario de equipo ahora solo se muestran/consultan si `canManageVacations`. |
| `paid_campaigns`, `meetings` SELECT                                                            | abiertos a todo autenticado                                                  | Confirmado intencional por el usuario — sin datos de nómina en estas tablas, mismo patrón que `projects`. Sin cambios.                                                                                                                                                                                                                                                                                  |
| `EmployeesView.jsx`                                                                            | `select('*')` sobre `users`: el sueldo viaja al navegador aunque no se pinte | Reescrito a columnas explícitas; `monthly_salary` solo se pide cuando `canSeeLevels` (nivel ≥3/admin/`empresa.empleados.sensible`). Tests pasando (`EmpresaEmployees.test.jsx`, `EmployeeModal.test.jsx`).                                                                                                                                                                                              |
| `evaluaciones.perfil-v2` (la fila real; `evaluaciones.permisos` no existe) y `tareas.panorama` | deny a los 9 departamentos = cerrado a todos menos admin                     | Confirmado por el usuario que se deja así a propósito — no es un bug a corregir.                                                                                                                                                                                                                                                                                                                        |

`ads.manage`/`tareas.manage`: cambio de datos en `module_permissions` (prod), sin migración
(config runtime, no schema). `vacations`: migración SQL aplicada (`mcp__supabase__apply_migration`)
más cambios de código. `npm test` completo: 2382 tests, todos pasando. `ARQUITECTURA.md` y
`src/data/changelog.js` actualizados en el mismo commit.

### Bloque 3 — Inconsistencias (no bloqueantes, pero importantes)

**Estado (2026-08-28): verificado contra código real, plan de corrección listo, implementación
pendiente.** Cada punto abajo ya tiene la ubicación exacta confirmada (los `[verificar]` del
texto original quedaron resueltos) y el fix concreto a aplicar.

1. **`src/components/RequireModule.jsx` es fail-open, `Sidebar.jsx` es fail-closed.**
   `RequireModule.jsx:15`: `const { loading, can = () => true } = useAuth()` — solo espera
   `loading`, no `permissionsLoaded`, y su default (`() => true`) abre todo si `useAuth()`
   devolviera un objeto sin `can`. `Sidebar.jsx:188-192` ya hace lo correcto:
   `can = () => false` como default, más `canR = permissionsLoaded ? can : () => false`.
   **Fix:** replicar en `RequireModule` el mismo patrón — default `() => false`, bloquear
   (spinner) mientras `loading || !permissionsLoaded`.
2. **Causa raíz de (1):** `AuthContext.jsx` — `setUserProfile(data)` (línea 68) dispara render
   antes de que resuelva `await fetchModulePermissions(...)` (línea 69); y en el flujo de
   `onAuthStateChange` (línea 129) `fetchUserProfile` se llama sin `await` y sin tocar `loading`
   (que solo se maneja en el mount inicial, líneas 94-116). Resultado: en cada login hay una
   ventana con `loading=false`, `permissionsLoaded=false`, `modulePermissions={}`, y
   `canAccessModule` trata "sin reglas" como acceso libre (`src/lib/permissions.js:65-82`).
   Se resuelve con el mismo fix del punto 1 (no requiere tocar `AuthContext`).
3. **`/proyectos` sin guard.** `src/main.jsx:264`: `<Route path="/proyectos" element={<App />} />`
   sin `RequireModule`, a diferencia de `/reportes` y `/leads` que sí lo tienen. `Sidebar.jsx:537-550`
   renderiza el ítem "Proyectos" sin envolver en `{canR('proyectos') && (...)}` (a diferencia de
   Leads en la línea 521 y Reuniones en la 504). **Fix:** agregar `RequireModule
moduleKey="proyectos"` en main.jsx y `canR('proyectos') &&` en Sidebar.
4. **`Sidebar.jsx:246` usa `admin` en vez de `can('evaluaciones.empleados')`.**
   `const canEval = userProfile?.access_level >= 2 || userProfile?.admin === true` — hardcodeado,
   no lee `module_permissions`, diverge de lo que se configure en Empresa → Permisos. La
   capability `evaluaciones.empleados` ya existe (viene del tab `empleados` del módulo
   `evaluaciones` en `src/config/modules.js:115-125`) y ya se usa igual en
   `EvaluacionesPage.jsx:59`. **Corrección al texto original:** la "línea 61" mencionada no
   corresponde a nada real (es un ícono SVG, `BELL_ICON`); la única ocurrencia real es la 246.
   **Fix:** reemplazar `canEval` por `canR('evaluaciones.empleados')`.
5. **`reportes.close` no está declarado en `src/config/modules.js`.** Se usa en
   `src/components/metricas/LineView.jsx:36` (`can('reportes.close')`) y tiene fila sembrada en
   BD (`supabase/migrations/20260715185717_seed_reportes_close.sql`, min_level 4), pero
   `capabilitiesForModule()` (modules.js:156-172) no la ve porque no está en `manageActions` del
   módulo `reportes` (línea 133) → nunca aparece en Empresa → Permisos para configurarla.
   **Fix:** agregar `{ key: 'reportes.close', label: 'Cerrar permanentemente un reporte mensual' }`
   a ese `manageActions`.
6. **`ARQUITECTURA.md` desactualizado en dos puntos** (no en las líneas 61/101 originales,
   confirmado por lectura directa):
   - línea ~90: dice `empresa.departamentos`, `empresa.empleados` → `admin=true`; en prod son
     `min_level` por nivel (2/2/4/4 según el nivel de cada capability), no `admin=true` puro.
   - línea ~164: describe `isFinancePrivileged(userProfile)` con 1 argumento y nivel 4; el código
     real (`src/lib/permissions.js:61-63`) toma `(userProfile, hasCapability = false)` y usa
     `access_level >= 3`.
     **Fix:** corregir ambas líneas para que coincidan con el código/BD real.
7. **`publication_check_*` vs `chequeo.ver_todo` — verificado, NO es un bug.** Búsqueda completa
   en `src/` y `supabase/migrations/`: `chequeo.ver_todo` se usa consistentemente en todos los
   lugares (`modules.js:68`, `ChequeoPage.jsx:26,64`, RLS `user_can('chequeo.ver_todo')` en
   `20260904000000_chequeo_ver_todo_rls.sql`). Lo único llamado `publication_check_events` es una
   tabla **retirada** (dropeada en `20260831000000_publication_checks_weekly_periods.sql:76-79`,
   reemplazada por `publication_checks`), mencionada solo en comentarios que documentan el
   retiro. No hay ninguna capability con nombre `publication_check_*` distinta de
   `chequeo.ver_todo`. Se cierra este punto sin cambios de código.
8. **`is_company_admin()` sin `set search_path`.** Definida en
   `supabase/migrations/20260705000000_create_module_permissions.sql:16-26`, `security definer`
   `stable` pero sin `set search_path`, con riesgo de search-path hijacking. `mp_set_updated_at()`
   en el mismo archivo (líneas 56-62) no es `security definer`, así que no corre el mismo riesgo.
   **Fix:** nueva migración que reemplace `is_company_admin()` agregando
   `set search_path = public`.

**Pendiente de implementar** (retomar aquí): puntos 1-5 y 6 son cambios de código/doc directos;
punto 8 requiere una migración SQL nueva (confirmar con el usuario antes de aplicarla, por ser
`CREATE OR REPLACE FUNCTION` sobre una función usada en políticas RLS activas). Cada fix suma su
ítem a `src/data/changelog.js` (`CHANGELOG[0]`) y no hace falta actualizar más `ARQUITECTURA.md`
salvo el propio punto 6.

### Verificación

Por cada corrección, contra el proyecto Supabase con un JWT de un usuario de nivel 1 real
(`set local request.jwt.claims = ...`) comprobar que:

1. `select monthly_salary from users` no devuelve filas ajenas.
2. `update users set admin = true where user_id = auth.uid()` falla.
3. `delete from users where ...` [verificar: condición exacta, fragmento cortado] falla.
4. `select * from evaluation_responses` solo devuelve las propias.
5. `insert into metric_line_members` en una línea ajena falla.
6. `insert into metric_reports` con `line_id` de otra línea falla.

Luego `npm test` (suite completa, una sola vez) y una pasada manual con una cuenta de
nivel 1, una de nivel 2 y una de nivel 4 recorriendo el menú.

---

Cada fix añade su ítem a `src/data/changelog.js` (`CHANGELOG[0]`, en desarrollo) y actualiza
las secciones de permisos de `ARQUITECTURA.md`.
