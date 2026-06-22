# Migración MDN Evaluación → Dashboard

Puerto del sistema de evaluación de personal (`mdnevaluacion`) al dashboard principal.
La base de datos es **compartida** — las tablas ya existen; solo se migra el frontend.

## Estado por fase

| Fase | Nombre                               | Estado     |
| ---- | ------------------------------------ | ---------- |
| 0    | Foundations (deps, env, log)         | ✅ done    |
| 1    | Nav + routing scaffold               | ✅ done    |
| 2    | Empresa: Departamentos & Cargos      | ✅ done    |
| 3    | Empresa: Empleados + Vacaciones      | ✅ done    |
| 4    | Empresa: Crear empleado (Netlify fn) | ✅ done    |
| 5    | Empresa: Preguntas                   | ✅ done    |
| 6    | Evaluaciones: flujo principal        | ✅ done    |
| 7    | Avatares (Cloudinary)                | ✅ done    |
| 8    | IA (Gemini)                          | ✅ done    |

---

## Fase 0 — Foundations ✅

**Estado:** done  
**Fecha:** 2026-06-22

### Acciones del usuario (pendientes)

- [x] Pushear/taggear `mdnevaluacion` en GitHub como snapshot de portafolio:
  ```bash
  cd /Users/macbook/Documents/Programacion/MDN/mdnevaluacion
  git tag portfolio-snapshot && git push && git push --tags
  ```
- [ ] **Fase 7 — Cloudinary unsigned preset** (requerido para verificación manual):
  1. En cloudinary.com (cuenta `mdnclientes`) → Settings → Upload → Upload Presets → Add →
     **Signing mode: Unsigned**. Copiar el nombre del preset.
  2. Agregar en `.env.local`:
     ```
     VITE_CLOUDINARY_CLOUD_NAME=mdnclientes
     VITE_CLOUDINARY_UPLOAD_PRESET=<nombre_del_preset_unsigned>
     ```
  3. Agregar las mismas variables en Netlify → Site settings → Env vars.
  > ⚠️ Las vars del proyecto original (`VITE_CLOUDINARY_URL`, `VITE_CLOUDINARY_API_KEY`) contienen
  > el API secret y **no deben usarse** — se filtrarían al bundle del cliente.
- [ ] **Fase 8** — cuando llegue: `GEMINI_API_KEY=<clave>` (solo servidor, sin prefijo `VITE_`)

### Dependencias instaladas

- `date-fns` — formateo de fechas en vistas de evaluación
- `@google/genai` — cliente Gemini para Phase 8 (proxied vía Netlify fn)
- `recharts` — ya estaba instalada (`^3.8.1`)

### Variables de entorno locales a agregar en `.env.local` (cuando lleguen las fases)

```
# Phase 7 — Cloudinary avatars
VITE_CLOUDINARY_CLOUD_NAME=mdnclientes
VITE_CLOUDINARY_UPLOAD_PRESET=<preset_sin_firma>

# Phase 8 — Gemini (server-only, never VITE_ prefix)
GEMINI_API_KEY=<clave_gemini>
```

### Archivos creados/modificados

- `docs/MIGRATION_EVALUACION.md` — este archivo
- `package.json` — `date-fns`, `@google/genai` agregados

### Tests

- Existentes: sin cambios, todos verdes (verificar con `npm test` antes de Phase 1).

---

## Fase 1 — Nav + routing scaffold ✅

**Estado:** done  
**Fecha:** 2026-06-22

### Archivos creados/modificados

- `src/main.jsx` — rutas `/empresa`, `/empresa/departamentos`, `/empresa/empleados`,
  `/empresa/preguntas`, `/evaluaciones`, `/evaluaciones/resumen`, `/evaluaciones/empleado/:id`
- `src/pages/EmpresaPage.jsx` — placeholder (header + "próximamente")
- `src/pages/EvaluacionesPage.jsx` — placeholder (header + "próximamente")
- `src/components/Sidebar.jsx`:
  - Íconos `COMPANY_ICON`, `EVAL_ICON` agregados
  - Sección "Empresa" — visible a todos; sub-links Departamentos/Empleados/Preguntas solo para `admin === true`
  - Sección "Evaluaciones" — visible para `access_level >= 2 || admin`
  - Fix previo: `ticketsOpen` ahora inicializa como `true` para IT admins (fix de 3 tests pre-existentes fallidos)
- `src/test/Sidebar.test.jsx` — 5 tests nuevos para Empresa y Evaluaciones

### Tests

- 234 passed, 0 failed (`npm test`)
- Fix de pre-existing failures: `ticketsOpen` ahora `useState(isTicketsRoute || isITAdmin)` para que el link de Notificaciones sea visible a IT admins sin importar la ruta activa

### Verificación manual

Iniciar `npm run dev` y confirmar que ambas secciones aparecen en la barra lateral y los links navegan a los placeholders.

---

## Fase 2 — Empresa: Departamentos & Cargos

**Estado:** ✅ done  
**Fecha:** 2026-06-22

### Contexto
`EmpresaPage.jsx` actualmente muestra un placeholder. En esta fase se convierte en el hub de
la sección Empresa con un tab switcher. El primer tab funcional es Departamentos (con los
cargos/posiciones anidados dentro de cada departamento).

Las tablas ya existen en el DB compartido:
- `departments`: `department_id` (PK), `department_name`, `company_id`, `dashboard_visible` (boolean)
- `positions`: `position_id` (PK), `position_name`, `department_id` (FK), `company_id`

### Patrón a seguir
Copiar el patrón de `TareasPage.jsx`: `useAuth()` → `company_id`, `Promise.all` fetch,
realtime channel, `main-bg` wrapper, tab switcher con array `TABS = [{key, label}]`.

### Archivos a crear
- `src/pages/EmpresaPage.jsx` — reescribir como hub con tabs:
  - Tab "general" → visible a todos (placeholder futuro de onboarding/downloads)
  - Tabs "departamentos", "empleados", "preguntas" → solo si `userProfile.admin === true`
  - Usar `useLocation()` para inicializar el tab activo según la sub-ruta
    (`/empresa/departamentos` → tab "departamentos", etc.)
- `src/components/empresa/DepartmentsView.jsx` — lista de departamentos con:
  - CRUD completo: crear, editar nombre, toggle `dashboard_visible`, eliminar (3× confirm per CLAUDE.md)
  - Para cada departamento, lista de cargos colapsable con CRUD de positions
  - Modal/dialog inline (no ruta separada): `null` = cerrado, `undefined` = crear, objeto = editar
- `src/components/empresa/constants.js` — labels compartidos si se necesitan

### Queries Supabase
```js
// Departamentos de la empresa
supabase.from('departments').select('*').eq('company_id', companyId).order('department_name')
// Cargos de la empresa (todos, para agrupar por dept)
supabase.from('positions').select('*').eq('company_id', companyId).order('position_name')
// Insert dept
supabase.from('departments').insert({ department_name, company_id: companyId, dashboard_visible: false })
// Insert position
supabase.from('positions').insert({ position_name, department_id, company_id: companyId })
```

### Tests a crear
`src/test/EmpresaDepartments.test.jsx` — mockear `../supabase` + `../context/AuthContext`,
wrapper `<MemoryRouter initialEntries={['/empresa/departamentos']}>`.
Verificar: lista de depts renderiza, form de creación se muestra, no-admin no ve tabs de gestión.

### Archivos creados/modificados

- `src/pages/EmpresaPage.jsx` — reescrito como hub con tabs sincronizados a la URL;
  tab Departamentos renderiza `<DepartmentsView>`, los demás muestran placeholder.
- `src/components/empresa/DepartmentsView.jsx` — vista completa de departamentos con:
  cargos (positions) anidados y colapsables; CRUD inline; realtime channel.
- `src/components/empresa/DepartmentModal.jsx` — modal crear/editar departamento
  (convención `null=crear, objeto=editar`; toggle `dashboard_visible`).
- `src/components/common/ConfirmDeleteDialog.jsx` — diálogo reutilizable "escribe el nombre para
  confirmar"; borrado de dept bloqueado si tiene cargos.
- `src/test/EmpresaDepartments.test.jsx` — 10 tests nuevos (EmpresaPage + ConfirmDeleteDialog).

### Tests

- 244 passed, 0 failed (`npm test`).

### Verificación manual
CRUD contra el DB real. Los departments deben aparecer luego en los pickers de Fase 3 y 6.

---

## Fase 3 — Empresa: Empleados + Vacaciones

**Estado:** ✅ done  
**Fecha:** 2026-06-22

### Contexto
Tab "empleados" dentro de `EmpresaPage.jsx`. Lista todos los `users` de la empresa y permite
editarlos (pero NO crearlos — eso es Fase 4). También gestiona las vacaciones de cada empleado.

Las tablas ya existen:
- `users`: `user_id` (PK, text/uuid), `first_name`, `last_name`, `email`, `department_id`,
  `position_id`, `company_id`, `access_level` (int), `admin` (bool), `avatar_url`,
  `phone_number`, `birth_date`, `hire_date`
- `vacations`: `id` (PK), `user_id` (FK → users.user_id), `start_date`, `end_date`, `status`
  (string: `'pending'`, `'approved'`, `'rejected'`, `'completed'` — traducir al español en UI)

### Archivos a crear/modificar
- `src/components/empresa/EmployeesView.jsx`:
  - Fetch: `supabase.from('users').select('*, department:departments(department_name), position:positions(position_name)').eq('company_id', companyId).order('first_name')`
  - Búsqueda local por nombre/email
  - Card o fila por empleado con avatar (si `avatar_url`) o iniciales en amarillo `#FFB800`
  - Botón "Editar" → modal de edición (campos: first_name, last_name, phone_number, birth_date,
    hire_date, department_id, position_id, access_level, admin)
  - Botón "Vacaciones" → `VacationsDialog`
  - Botón "Eliminar" → 3× confirm (CLAUDE.md: destructivo)
- `src/components/empresa/VacationsDialog.jsx`:
  - Lista vacaciones del empleado
  - Crear nueva: start_date, end_date, status inicial 'pending'
  - Editar status (aprobar/rechazar/completar)
  - Traducción de status: `pending→Pendiente`, `approved→Aprobado`, `rejected→Rechazado`, `completed→Completado`

### Queries Supabase
```js
// Actualizar empleado
supabase.from('users').update({ first_name, last_name, ... }).eq('user_id', userId)
// Vacaciones del empleado
supabase.from('vacations').select('*').eq('user_id', userId).order('start_date', { ascending: false })
// Crear vacación
supabase.from('vacations').insert({ user_id, start_date, end_date, status: 'pending' })
// Actualizar status vacación
supabase.from('vacations').update({ status }).eq('id', vacationId)
// Eliminar vacación
supabase.from('vacations').delete().eq('id', vacationId)
```

### Archivos creados/modificados

- `src/pages/EmpresaPage.jsx` — importa y renderiza `<EmployeesView>` en el tab Empleados (reemplaza placeholder).
- `src/components/empresa/EmployeesView.jsx` — vista completa: lista empleados con avatar, cargo,
  departamento, nivel y badge Admin; búsqueda local; botones Editar y Vacaciones; realtime
  `'empresa-empleados-changes'`; estado optimista en `handleEmployeeSaved`.
- `src/components/empresa/EmployeeModal.jsx` — modal solo edición (no creación — Fase 4); campos:
  nombre, apellido, teléfono, birth_date, hire_date, departamento, cargo filtrado, access_level,
  toggle admin; email read-only; select con joins para devolver nombres resueltos a `onSaved`.
- `src/components/empresa/VacationsDialog.jsx` — gestión de vacaciones: lista, crear, cambiar
  status (Aprobar/Rechazar/Completar según estado actual), eliminar con `ConfirmDeleteDialog`.
  Formato de fechas con `date-fns`. Chips de color por status.
- `src/test/EmpresaEmployees.test.jsx` — 11 tests nuevos.

### Decisión de diseño
**Borrado de empleado omitido en esta fase.** Borrar una fila de `users` dejaría huérfana la cuenta
`auth.users` y podría romper FKs (evaluaciones, vacaciones). Se difiere a Fase 4 donde se gestiona
auth.users con service role vía Netlify function.

### Tests

- 255 passed, 0 failed (`npm test`).

### Verificación manual
Editar un empleado real, asignar una vacación, confirmar persistencia recargando.

---

## Fase 4 — Empresa: Crear empleado (Netlify fn)

**Estado:** ✅ done  
**Fecha:** 2026-06-22

### Contexto
Crear un nuevo empleado requiere crear un usuario en `auth.users` (solo con service role) y
luego insertar en la tabla `users`. El original usaba un Supabase Edge Function `bright-task`.
Aquí se reimplementa como Netlify function, siguiendo el patrón de `netlify/functions/projects.js`.

### Archivos a crear
- `netlify/functions/create-employee.js`:
  - Método: POST
  - Auth: verifica el JWT del caller vía `supabase.auth.getUser(token)` con el cliente service
    role (NO usa `MCP_API_TOKEN`, ese es solo para el MCP server). Confirma que el caller tiene
    `admin === true` en la tabla `users`.
  - Body JSON: `{ email, first_name, last_name, department_id, position_id, access_level, admin, company_id }`
  - Flujo:
    1. `supabase.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })`
       — genera una contraseña temporal aleatoria o usa `inviteUserByEmail` si se prefiere invite.
    2. `supabase.from('users').insert({ user_id: newAuthUser.id, email, first_name, ... })`
    3. Retorna `{ user_id, email }` o error.
  - Usa `netlify/functions/_lib/supabase.js` (ya existe, usa `SUPABASE_SERVICE_ROLE_KEY`)
- `src/components/empresa/NewEmployeeDialog.jsx`:
  - Form: email, first_name, last_name, department_id (selector), position_id (selector filtrado por dept),
    access_level (1-3), admin (checkbox)
  - POST a `/.netlify/functions/create-employee` con `Authorization: Bearer <session.access_token>`
  - Feedback de éxito/error inline

### Variables de entorno necesarias
Ya existen: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` y Netlify.

### Archivos creados/modificados

- `netlify/functions/_lib/requireAdmin.js` — helper JWT: verifica token del caller vía
  `supabase.auth.getUser(token)` y confirma `admin === true` en la tabla `users`.
  Devuelve `{ caller }` con `company_id` de confianza, o un response `401`/`403` listo.
  Distinto de `requireBearer` (que valida el secreto MCP_API_TOKEN).
- `netlify/functions/create-employee.js` — POST handler: requiere admin, parsea body,
  valida email/nombre/apellido, llama `supabase.auth.admin.inviteUserByEmail(email)`,
  inserta en `users` con `company_id` del caller (nunca del body), devuelve la fila con joins.
- `netlify.toml` — redirect `/api/employees` → `/.netlify/functions/create-employee`.
- `src/components/empresa/NewEmployeeDialog.jsx` — dialog crear empleado: campos email,
  nombre, apellido, departamento, cargo filtrado, access_level y toggle admin. POST a
  `/api/employees` con `session.access_token`. Error inline si el servidor rechaza.
- `src/components/empresa/EmployeesView.jsx` — botón `+ Nuevo empleado` (amarillo, barra
  superior); renderiza `<NewEmployeeDialog>` pasando `departments`, `positions`,
  `onCreated={handleEmployeeSaved}` (rama append ya existía).
- `src/test/NewEmployeeDialog.test.jsx` — 10 tests nuevos.

### Tests

- 267 passed, 0 failed (`npm test`).

### Verificación manual

> Requiere `netlify dev` (no `npm run dev`) para que `/api/employees` resuelva la Netlify function localmente.
> Si `netlify-cli` no está instalado: `npm install -g netlify-cli && netlify link`.

1. **Iniciar el entorno local**
   ```bash
   netlify dev
   # Sirve el frontend en http://localhost:8888 con las functions disponibles
   ```

2. **Crear empleado de prueba (flujo feliz)**
   - Iniciar sesión como admin.
   - Ir a Empresa → Empleados → clic en `+ Nuevo empleado`.
   - Completar: email de prueba, nombre, apellido, departamento y cargo.
   - Clic en "Crear empleado".
   - Verificar:
     - [ ] El empleado aparece en la lista sin recargar la página (update optimista).
     - [ ] En Supabase → Authentication → Users: aparece con estado `invited`.
     - [ ] En Supabase → Table Editor → `users`: fila creada con `company_id` correcto.
     - [ ] Llega el email de invitación a la dirección indicada (requiere SMTP configurado en Supabase).

3. **Probar error de email duplicado**
   - Intentar crear otro empleado con el mismo email.
   - Verificar que aparece un mensaje de error inline y el dialog permanece abierto.

4. **Probar acceso no-admin**
   - Iniciar sesión con un usuario `admin = false`.
   - Confirmar que el botón `+ Nuevo empleado` no es visible (solo admins ven `EmployeesView`).

5. **Limpieza del empleado de prueba**
   - **IMPORTANTE:** Antes de eliminar de `auth.users` en producción, pedir confirmación 3 veces.
   - En Supabase → Authentication → Users → eliminar el usuario de prueba.
   - La fila en `users` quedará huérfana hasta la Fase 4b (delete con service role) — eliminarla manualmente desde Table Editor si es necesario.

---

## Fase 5 — Empresa: Preguntas

**Estado:** ✅ done  
**Fecha:** 2026-06-22

### Contexto
Tab "preguntas" dentro de `EmpresaPage.jsx`. Gestiona las preguntas de evaluación y a qué
cargos (positions) aplica cada una.

Las tablas ya existen:
- `questions`: `id` (PK), `text`, `company_id`, `removed` (bool — soft delete)
- `question_positions`: `id` (PK), `question_id` (FK), `position_id` (FK)
- `question_tags`: `id` (PK), `question_id` (FK), `tag` (text)

### Archivos a crear
- `src/components/empresa/QuestionsView.jsx`:
  - Fetch: `supabase.from('questions').select('*, question_positions(position_id), question_tags(tag)').eq('company_id', companyId).eq('removed', false)`
  - Lista de preguntas con sus cargos asociados (nombres resueltos desde positions)
  - Filtro por cargo (position)
  - Crear/editar pregunta: campo `text` + selector múltiple de positions + tags opcionales
  - Eliminar: soft delete → `supabase.from('questions').update({ removed: true }).eq('id', id)`
  - Al guardar positions: delete todas las `question_positions` del question y re-insertar

### Queries clave
```js
// Guardar question_positions (replace)
await supabase.from('question_positions').delete().eq('question_id', questionId)
await supabase.from('question_positions').insert(positionIds.map(pid => ({ question_id: questionId, position_id: pid })))
```

### Archivos creados/modificados

- `src/components/empresa/QuestionsView.jsx` — vista completa del banco de preguntas: lista,
  filtro por cargo, chips de cargos y tags, botones Editar/Eliminar (soft delete), realtime
  channel `'empresa-questions-changes'`.
- `src/components/empresa/QuestionModal.jsx` — modal crear/editar: textarea de texto, lista
  checkbox de cargos agrupados por departamento (patrón TeamManagerModal), tags con input +
  chips removibles, replace join `question_positions` y `question_tags` en submit.
- `src/pages/EmpresaPage.jsx` — reemplazado el placeholder de Preguntas por
  `<QuestionsView companyId={userProfile.company_id} />`.
- `src/test/EmpresaQuestions.test.jsx` — 11 tests nuevos.

### Tests

- 274 passed, 0 failed nuevos (`npm test`). Los 10 fallos de `AppLayout.test.jsx` son
  pre-existentes (causados por `InstallBanner.jsx` usando `window.matchMedia` sin mock en jsdom).

### Verificación manual
Crear una pregunta y asignarla a un cargo. Ir a Fase 6 (EvaluationModal) y confirmar que
aparece en el formulario de evaluación para un empleado con ese cargo.

---

## Fase 6 — Evaluaciones: flujo principal

**Estado:** ✅ done  
**Fecha:** 2026-06-22

### Contexto
Sección completa de evaluaciones: lista de empleados evaluables, modal de evaluación (crear y
ver), perfil del empleado con historial + gráfica, y resumen de empresa.

Las tablas ya existen:
- `evaluation_sessions`: `id`, `manager_id`, `employee_id`, `period` (date — primer día del mes anterior), `total_score`, `created_at`
- `evaluation_responses`: `id`, `evaluation_id`, `question_id`, `response` (int 1-5)
- `evaluation_comments`: `id`, `evaluation_id`, `comment`
- Vista DB: `employee_evaluation_summary_last_month`
- RPC DB: `summary(period_param)` — retorna resumen por empleado

### Archivos a crear
- `src/pages/EvaluacionesPage.jsx` — reescribir con tabs: "empleados" | "resumen"
  Tab activo según sub-ruta (`/evaluaciones` → empleados, `/evaluaciones/resumen` → resumen).
  Fetch inicial: todos los `users` de la empresa con `position_id` y `department`.

- `src/components/evaluaciones/EvaluationModal.jsx` — modal de crear/ver evaluación:
  - Props: `employeeId`, `employeeName`, `employeePositionId`, `evaluationId` (si es ver)
  - Cargar preguntas: `supabase.from('question_positions').select('id:question_id, ...questions(text)').eq('position_id', employeePositionId).eq('questions.removed', false)` — filtrar `q.text !== null`
  - Si `evaluationId` → cargar respuestas existentes (modo lectura, sin submit)
  - Período: primer día del mes anterior (helper `getPastMonthRange()` — ver abajo)
  - Radio 1-5 por pregunta; submit deshabilitado hasta que todas estén respondidas
  - Score: `(suma_respuestas / (n_preguntas * 5)) * 5`
  - Submit: insertar `evaluation_sessions` → luego `evaluation_responses` (una por pregunta) → luego `evaluation_comments`
  - Eliminar evaluación existente: `supabase.from('evaluation_sessions').delete().eq('id', evaluationId)`

- `src/components/evaluaciones/EmployeeEvalList.jsx` — tabla de empleados con:
  - Columnas: nombre, cargo, departamento, última evaluación (score + período), botón "Evaluar" / "Ver"
  - "Evaluar" abre `EvaluationModal` con `evaluationId=undefined` (crear)
  - "Ver" abre `EvaluationModal` con `evaluationId=<id>` (read-only)

- `src/components/evaluaciones/EmployeeProfileView.jsx` (ruta `/evaluaciones/empleado/:id`):
  - Historial de evaluaciones del empleado (lista + gráfica de score a lo largo del tiempo)
  - Gráfica: `recharts` `LineChart` o `BarChart` con `period` en X y `total_score` en Y
  - Fetch: `supabase.from('evaluation_sessions').select('*, evaluation_responses(*), evaluation_comments(*)').eq('employee_id', employeeId).order('period', { ascending: false })`

- `src/components/evaluaciones/SummaryView.jsx` (ruta `/evaluaciones/resumen`):
  - Usa vista `employee_evaluation_summary_last_month`: `supabase.from('employee_evaluation_summary_last_month').select('*').eq('company_id', companyId)`
  - Tabla de empleados ordenados por score descendente (top rated)
  - Selector de período para llamar al RPC: `supabase.rpc('summary', { period_param: firstOfMonth })`

### Helper `getPastMonthRange()`
```js
// src/utils/getPastMonthRange.js
export default function getPastMonthRange() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
  return {
    firstDay: firstDay.toISOString().split('T')[0],
    lastDay: lastDay.toISOString().split('T')[0],
  }
}
```

### Archivos creados/modificados

- `src/utils/getPastMonthRange.js` — helper que retorna `{ firstDay, lastDay }` del mes anterior en ISO.
- `src/pages/EvaluacionesPage.jsx` — reescrito como hub con tabs Empleados/Resumen sincronizados a la
  URL; gateado por `access_level >= 2 || admin`; renderiza `<EmployeeProfileView>` en la sub-ruta
  `/evaluaciones/empleado/:id`.
- `src/components/evaluaciones/EmployeeEvalList.jsx` — lista de empleados evaluables (excluye al
  usuario actual): botón "Evaluar" (amarillo) o "Ver" (outline) según si el período ya tiene
  sesión; nombre clickeable al perfil; búsqueda local; realtime canal `'evaluaciones-list-changes'`.
- `src/components/evaluaciones/EvaluationModal.jsx` — modal crear/ver evaluación: preguntas del
  cargo con botones de radio 1–5; score `(suma/(n*5))*5`; submit bloqueado hasta responder todo;
  modo lectura con `ConfirmDeleteDialog` para eliminar (borra hijos antes de la sesión).
- `src/components/evaluaciones/EmployeeProfileView.jsx` — perfil del empleado: cabecera con
  `Avatar`, gráfica `LineChart` de score vs período (recharts, estilo tickets/analytics), historial
  de sesiones con respuestas y comentarios.
- `src/components/evaluaciones/SummaryView.jsx` — resumen: vista
  `employee_evaluation_summary_last_month` por defecto; selector de período que llama a la RPC
  `summary(period_param)`; tabla top-rated con colores de score.
- `src/test/EvaluationModal.test.jsx` — 10 tests nuevos (scoring math, submit gating, read-only).
- `src/test/EvaluacionesPage.test.jsx` — 9 tests nuevos (render lista, acceso gateado, tab activo).

### Tests

- 292 passed, 0 fallos nuevos (`npm test`). Pre-existentes: 10 en `AppLayout.test.jsx`
  (window.matchMedia), 1 flakiness en `ProjectModal.members.test.jsx` (aislamiento de mocks —
  pasa solo). No introducidos por esta fase.

### Verificación manual

> Requiere `npm run dev` (o `netlify dev`) y sesión con `access_level >= 2` o `admin`.

1. **Lista de evaluables** — ir a Evaluaciones: aparece la lista sin el usuario logueado; cada
   empleado muestra cargo y departamento.
2. **Crear evaluación** — "Evaluar" un empleado con preguntas asignadas a su cargo; radios 1–5;
   submit bloqueado hasta completar todas; guardar.
3. **Modo Ver** — tras guardar, el botón pasa a "Ver"; abre en solo lectura con respuestas marcadas
   y botón Eliminar.
4. **Perfil** — click en el nombre del empleado → página de perfil con gráfica de evolución e
   historial de evaluaciones.
5. **Resumen** — tab Resumen: lista de empleados ordenados por score; cambiar el selector de período
   recarga vía RPC.

---

## Fase 7 — Avatares (Cloudinary)

**Estado:** ✅ done  
**Fecha:** 2026-06-22

### Contexto
Upload de foto de perfil vía **unsigned preset** de Cloudinary directamente desde el browser.
El API secret nunca se expone en variables `VITE_` (se filtraría al bundle).
Incluye recorte cuadrado con `react-image-crop` y compresión client-side (canvas → WebP 85%,
máx 512×512 px) para controlar peso del archivo.

### Prerequisitos del usuario (acción pendiente — bloquea solo la verificación manual)

1. En Cloudinary (cuenta `mdnclientes`) → Settings → Upload → Upload Presets → Add →
   **Signing mode: Unsigned**. Copiar el nombre del preset.
2. Agregar en `.env.local`:
   ```
   VITE_CLOUDINARY_CLOUD_NAME=mdnclientes
   VITE_CLOUDINARY_UPLOAD_PRESET=<nombre_del_preset_unsigned>
   ```
3. Agregar las mismas variables en Netlify (Site settings → Env vars).

> ⚠️ Las variables del proyecto original (`VITE_CLOUDINARY_URL`, `VITE_CLOUDINARY_API_KEY`)
> **no deben usarse aquí**: contienen el API secret y lo expondrían en el bundle JS del cliente.

### Archivos creados/modificados

- `package.json` — `react-image-crop ^11.1.2` agregado.
- `src/utils/uploadToCloudinary.js` — helpers puros y testeables:
  - `cropToBlob(image, completedCrop)` — dibuja el área recortada en un `<canvas>` (máx 512×512)
    y exporta como `image/webp` (calidad 0.85).
  - `uploadToCloudinary(blob)` — POST a Cloudinary con unsigned preset, devuelve `secure_url`.
- `src/components/empresa/AvatarUpload.jsx` — componente reutilizable:
  - Trigger: click en el avatar muestra overlay de edición; también acepta prop `triggerRef`
    para que un botón externo (ej. Sidebar) dispare el file picker directamente.
  - Flujo: file input → FileReader → modal con `<ReactCrop aspect={1} circularCrop>` →
    botón "Subir foto" → `cropToBlob` → `uploadToCloudinary` → `onUploaded(secureUrl)`.
  - El componente NO persiste en DB — el padre decide (EmployeeModal lo hace en handleSubmit,
    Sidebar lo hace de inmediato con `refreshProfile`).
- `src/components/empresa/EmployeeModal.jsx` — `avatar_url` añadido al form inicial y al payload
  `.update()`; `<AvatarUpload>` renderizado en el header del modal (avatar clickeable = nuevo trigger).
- `src/components/Sidebar.jsx` — opción "Cambiar foto" en el popover del usuario; `AvatarUpload`
  montado con `size=0` y `triggerRef=avatarInputRef`; al completar: persistencia inmediata en
  `users.avatar_url` + `refreshProfile()` para que el avatar actualice sin recargar.
- `src/context/AuthContext.jsx` — se expone `refreshProfile()` en el contexto: llama a
  `fetchUserProfile` con la sesión actual y actualiza `userProfile` en contexto.
- `src/test/AvatarUpload.test.jsx` — 11 tests nuevos.

### Tests

- 304 passed, 0 fallos nuevos (`npm test`). Pre-existentes: 10 en `AppLayout.test.jsx`
  (window.matchMedia de InstallBanner — no introducidos por esta fase).

### Verificación manual

> Requiere el Upload Preset unsigned creado y las env vars configuradas.

1. `npm run dev`, login como admin → Empresa → Empleados → "Editar" → clic en el avatar del
   header → seleccionar imagen → recortar → "Subir foto" → "Guardar cambios". La foto aparece
   en la lista de empleados sin recargar.
2. Clic en los 3 puntos del menú de usuario (sidebar inferior) → "Cambiar foto" → seleccionar
   imagen → recortar → "Subir foto". El avatar de la sidebar se actualiza al instante.
3. Confirmar en Supabase → Table Editor → `users`: columna `avatar_url` tiene la URL
   `https://res.cloudinary.com/mdnclientes/image/upload/...`.
4. `npm run build && grep -ri "api_secret\|55QgoR" dist/` → no debe aparecer ningún secreto.

---

## Fase 8 — IA (Gemini)

**Estado:** ✅ done  
**Fecha:** 2026-06-22

### Contexto
El original (`mdnevaluacion`) llamaba a Gemini directamente desde el browser con la API key
expuesta en una variable `VITE_`. Aquí se proxea vía Netlify function para mantener
`GEMINI_API_KEY` solo en el servidor. El análisis vive en la página de perfil del empleado
(`/evaluaciones/empleado/:id`), activado por botón (no auto-run, para evitar una llamada paga
en cada visita). Retorna Resumen + Fortalezas + Debilidades + Recomendaciones en español,
analizando todo el historial de evaluaciones.

### Prerequisitos (acciones del usuario — bloquean solo la verificación manual)
1. Obtener la API key de Google Gemini en aistudio.google.com.
2. Agregar en `.env.local`: `GEMINI_API_KEY=<clave>` (sin prefijo `VITE_` — solo servidor).
3. Agregar la misma variable en Netlify → Site settings → Env vars.

`@google/genai ^2.9.0` ya estaba en `package.json`. No requiere instalar nada.

### Archivos creados/modificados

- `netlify/functions/_lib/requireUser.js` — nuevo helper JWT: verifica token del caller vía
  `supabase.auth.getUser(token)` pero **sin** exigir `admin === true` (acepta `access_level >= 2`).
  Complementa `requireAdmin.js`. Devuelve `{ caller: { user_id, company_id } }` o `{ error }`.
- `netlify/functions/evaluation-analysis.js` — POST handler: autenticación con `requireUser`,
  verificación de tenant (`company_id` del empleado == `company_id` del caller), carga el historial
  completo de evaluaciones con texto de preguntas via join `evaluation_responses → questions`,
  guard de `GEMINI_API_KEY`, llama a `gemini-2.5-flash` con el prompt del original (claves inglés,
  valores español; comments solo del período más reciente), devuelve
  `{ summary, strengths, weaknesses, recommendations }`.
- `netlify.toml` — redirect `/api/evaluation-analysis` → `/.netlify/functions/evaluation-analysis`
  (insertado antes del catch-all SPA `/*`).
- `src/components/evaluaciones/AiEvaluation.jsx` — componente autocontenido con props `{ employeeId }`:
  botón "Generar análisis IA", spinner, card de resultado (Resumen + Fortalezas + Debilidades +
  Recomendaciones con bullets `#FFB800`), error rojo + botón Reintentar, botón Regenerar.
  Token vía `supabase.auth.getSession()` → `session.access_token` (patrón NewEmployeeDialog).
- `src/components/evaluaciones/EmployeeProfileView.jsx` — importa y renderiza `<AiEvaluation>`
  entre la gráfica de score y el historial de sesiones (solo visible cuando hay evaluaciones).
- `src/test/AiEvaluation.test.jsx` — 10 tests nuevos.

### Tests

- 314 passed, 0 fallos nuevos (`npm test`). Pre-existentes: 10 en `AppLayout.test.jsx`
  (window.matchMedia de InstallBanner — no introducidos por esta fase).

### Verificación manual

> Requiere `GEMINI_API_KEY` en `.env.local` y `netlify dev` (no `npm run dev`) para que
> `/api/evaluation-analysis` resuelva la Netlify function localmente.

1. Login con `access_level >= 2` o admin → Evaluaciones → clic en el nombre de un empleado con
   evaluaciones → perfil del empleado → clic "Generar análisis IA".
2. Verificar: aparece spinner "Generando análisis…" → luego el card con Resumen / Fortalezas /
   Debilidades / Recomendaciones en español.
3. Clic "Regenerar" → vuelve al estado inicial con el botón.
4. Probar con empleado sin evaluaciones → el card no aparece (rama `sessions.length === 0`).
5. Seguridad: `npm run build && grep -ri "GEMINI" dist/` → no debe aparecer la clave en el
   bundle (la llamada es server-side; el cliente solo hace `fetch` a `/api/...`).

---

## Notas y decisiones tomadas

- **Sistema de evaluación:** solo el nuevo (evaluation_sessions + questions). La tabla legacy `evaluations` no tendrá UI.
- **Build order:** Empresa primero, Evaluaciones después.
- **Empresa:** visible para todos; pestañas de gestión (Departamentos/Empleados/Preguntas) solo para `admin === true`.
- **Evaluaciones:** acceso para `access_level >= 2 || admin`.
- **Charts:** recharts (ya instalado).
- **Edge functions del original:** `bright-task` se reimplementa como Netlify function; `express` (Cloudinary) se reemplaza por upload sin firma directo desde el browser.
- **Contexto técnico:** `mdnevaluacion` usaba TypeScript + Zustand + shadcn/MUI. Todo se reescribe en JSX plano con los tokens de Tailwind del dashboard. No se copia código verbatim.
