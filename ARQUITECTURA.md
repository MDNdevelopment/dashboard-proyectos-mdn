# Arquitectura — MAPPI (MDN Dashboard)

Suite de gestión interna de **MDN Publicidad**. Este archivo es un **índice corto**: el detalle de
cada módulo vive en `docs/arquitectura/<modulo>.md`. Lee SOLO los documentos de los módulos que vas
a tocar (más `datos.md` / `permisos.md` / `interconexiones.md` si el cambio cruza módulos o toca
tablas o permisos). Al tocar archivos de un módulo, `.claude/rules/arq-*.md` te recuerdan cuál leer.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite, React Router v6 (`BrowserRouter`) |
| Estilos | Tailwind CSS 3 · DM Sans / DM Mono · colores hex hardcoded |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| Deploy | Netlify (SPA redirect, `netlify.toml`) |
| Imágenes | **Cloudinary** (`src/utils/uploadToCloudinary.js`: `uploadToCloudinary`/`deleteFromCloudinary`) — no Supabase Storage. Edge fn `express` firma tanto la subida como el borrado (`action: 'destroy'`) con el API secret; el cliente nunca lo ve. |
| IA | Gemini (Evaluaciones vía Netlify fn `evaluation-analysis.js`; resumen ejecutivo del Home vía Netlify fn `ceo-analysis.js`, §2.2) |
| Notificaciones email | Resend (Edge fn `notify-campaign-assignee`) + Edge fn `express` (tickets) + Edge fn `notify-dispatch` (asignaciones de tarea/proyecto/reunión, recordatorios de reunión) |
| Notificaciones in-app | Tabla `notifications` con campanita realtime en toda la app (`NotificationBell.jsx`) |

## Punto de entrada y routing

```
src/main.jsx          ← BrowserRouter + <Routes> (definición completa de rutas)
  └─ <ProtectedRoute> ← redirige a /login si no hay sesión (solo verifica sesión)
       └─ <RequireModule moduleKey="X"> ← redirige a / si can(key)=false
            └─ <AppLayout> ← Outlet + suscripción realtime a `projects`
                 └─ rutas hijas (ver mapa de módulos)
```

- Cliente Supabase: `src/supabase.js`
- Auth context + hook `useAuth`: `src/context/AuthContext.jsx`
- Navegación central: `src/components/Sidebar.jsx`
- Guard de módulo: `src/components/RequireModule.jsx`
- Registro central de módulos: `src/config/modules.js`

## Mapa de módulos

| Módulo | Doc | Rutas | Código principal |
|---|---|---|---|
| Autenticación | `autenticacion.md` | `/login`, `/forgot-password`, `/reset-password` | `src/context/AuthContext.jsx`, `src/pages/LoginPage.jsx` |
| Inicio (Home) | `home.md` | `/` | `src/pages/HomePage.jsx`, `src/components/home/` |
| Proyectos | `proyectos.md` | `/proyectos` | `src/components/AppLayout.jsx`, `Dashboard.jsx`, `ProjectCard.jsx`, `ProjectModal.jsx` |
| Tareas | `tareas.md` | `/tareas` | `src/pages/TareasPage.jsx`, `src/components/tareas/` |
| Tareas Fijas (Redes/Diseño) | `tareas-fijas.md` | `/tareas/fijas` | `src/pages/TareasFijasPage.jsx`, `src/components/tareas-fijas/` |
| Pautas Audiovisual | `audiovisual.md` | `/tareas/pautas` | `src/pages/PautasPage.jsx`, `src/components/pautas/`, `src/utils/audiovisual.js` |
| Chequeo | `chequeo.md` | `/tareas/chequeo` | `src/pages/ChequeoPage.jsx`, `src/components/chequeo/` |
| CNP | `cnp.md` | `/cnp` | `src/pages/CnpPage.jsx`, `src/components/cnp/` |
| Métricas / Reportes | `metricas.md` | `/reportes`, `/reportes/linea/:lineId` | `src/pages/MetricasPage.jsx`, `src/components/metricas/` |
| Monitor de uso | `monitor-uso.md` | `/monitor-uso` | `src/pages/MonitorUsoPage.jsx` |
| Empresa | `empresa.md` | `/empresa/*` | `src/pages/EmpresaPage.jsx`, `src/components/empresa/` |
| Evaluaciones | `evaluaciones.md` | `/evaluaciones/*` | `src/pages/EvaluacionesPage.jsx`, `src/components/evaluaciones/` |
| Tickets + Buzón anónimo | `tickets.md` | `/tickets/*`, `/feedback` | `src/pages/TicketsPage.jsx`, `src/components/tickets/`, `src/components/feedback/` |
| Notificaciones | `notificaciones.md` | (campanita global) | `src/components/notifications/`, edge fns `notify-*` |
| Ads / Campañas | `ads.md` | `/ads` | `src/pages/AdsPage.jsx`, `src/components/ads/` |
| Reuniones | `reuniones.md` | `/reuniones` | `src/pages/ReunionesPage.jsx`, `src/components/reuniones/` |
| Leads | `leads.md` | `/leads` | `src/pages/LeadsPage.jsx`, `src/components/leads/` |
| MCP (BD con IA) | `mcp.md` | `/mcp` (Netlify fn) | `netlify/functions/mcp.js`, `oauth.js`, `_lib/mcpWrite*.js` |
| Asistente IA "MAPPI" | `asistente-ia.md` | (chat flotante) | `src/components/ai/`, `netlify/functions/ai-chat.js` |
| Finanzas | `finanzas.md` | `/finanzas/*` | `src/pages/FinanzasPage.jsx`, `src/components/finanzas/` |

Transversales: `permisos.md` (capabilities, `user_can()`, "Ver como"), `datos.md` (catálogo de
tablas, FK, RLS, jsonb), `interconexiones.md` (qué módulo alimenta a cuál), `convenciones.md`
(convenciones de código y componentes compartidos: `FilterBar`, `DescribedSelect`, `StatusPill`,
`NetworkIcon`). Dudas abiertas detectadas al condensar la doc: `verificar.md`.

## Cómo mantener esta documentación

- Describe el **estado actual**, no la historia. El historial vive en git: nada de "desde la
  migración X…", "antes era…".
- Un cambio que agrega/cambia rutas, tablas, columnas, permisos o relaciones entre módulos actualiza
  el `docs/arquitectura/<modulo>.md` correspondiente (y `datos.md` / `permisos.md` /
  `interconexiones.md` si aplica) en el mismo commit. Módulo nuevo → doc nuevo + fila en esta tabla +
  regla `.claude/rules/arq-<modulo>.md`.
- Viñetas cortas, sin filas de tabla gigantes. Presupuesto: ≤ 25 KB por doc. Si un doc lo supera,
  compáctalo en vez de seguir agregando.

## Referencias antiguas por sección (§)

Comentarios del código y migraciones citan secciones del antiguo `ARQUITECTURA.md` monolítico.
Equivalencias: §1 → este índice + `permisos.md` · §2.1 `autenticacion.md` · §2.2 `home.md` ·
§2.3 `proyectos.md` · §2.4 `tareas.md` · §2.4bis `tareas-fijas.md` · §2.4ter `audiovisual.md` ·
§2.4quater `chequeo.md` · §2.4quinquies `cnp.md` · §2.5 `metricas.md` · §2.5bis `monitor-uso.md` ·
§2.6 `empresa.md` · §2.7 `evaluaciones.md` · §2.8/§2.8bis `tickets.md` · §2.9 `notificaciones.md` ·
§2.10 `ads.md` · §2.11 `reuniones.md` · §2.12 `leads.md` · §2.13 `mcp.md` · §2.14 `asistente-ia.md` ·
§2.15 `finanzas.md` · §3 `datos.md` · §4 `interconexiones.md` · §5 `convenciones.md`.
