# Tickets / Soporte IT y Buzón anónimo

|---|---|
|---|---|
| **Propósito** | Mesa de ayuda IT: crear/gestionar tickets, comentarios, SLA, analítica y preferencias de notificación. |
| **Archivos principales** | `src/pages/TicketsPage.jsx` (host de tabs) · `src/components/tickets/TicketsListView.jsx` · `src/components/tickets/TicketAnalyticsView.jsx` · `src/components/tickets/NotificationPreferencesView.jsx` · `src/components/tickets/*` (TicketList, TicketForm, TicketDetail, TicketCard, TicketComments, slaUtils, constants) · `src/components/tickets/analytics/*` · `src/hooks/useTicketAnalytics.js` |
| **Tablas** | `support_tickets` (`requester_id→users, assigned_to→users, title, description, category, priority, status, company_id`) · `ticket_comments` (`ticket_id, author_id→users, body`) · `users.receive_ticket_notifications` |
| **Notificaciones** | Edge fn `express` (`supabase.functions.invoke('express')`) |
| **Rutas** | `/tickets` · `/tickets/analytics` · `/tickets/notificaciones` — las tres apuntan al mismo componente host `TicketsPage`; la sección activa se determina por la URL (patrón tabs). |
| **Navegación** | **Oculto** desde el sidebar y de los accesos rápidos del Inicio (entrada `tickets` con `hidden: true` en `src/config/modules.js`), reemplazado por el buzón anónimo (ver [2.8bis](#28bis-buzón-anónimo-de-sugerencias-y-errores)). Las rutas siguen activas por URL directa; reactivar quitando `hidden: true`. |
| **Permisos por tab** | Lista de tickets: todos los usuarios con acceso al módulo. Analíticas: `access_level ≥ 3` o `admin = true`. Notificaciones: `department_id = 0` AND (`access_level ≥ 3` OR `admin = true`). Acceder a una ruta sin permiso redirige a `/tickets`. |

## 2.8bis Buzón anónimo de sugerencias y errores

|---|---|
|---|---|
| **Propósito** | Reemplaza el acceso visible a Soporte Técnico: cualquier usuario logueado puede enviar una recomendación o un reporte de error **de forma 100% anónima** (sin autor asociado, ni siquiera para el admin). |
| **Archivos principales** | `src/lib/feedback.js` (validación + tipos/estados, testeable sin DOM) · `src/components/feedback/FeedbackModal.jsx` (formulario de envío, botón amarillo del Sidebar) · `src/components/feedback/FeedbackListView.jsx` + `src/pages/FeedbackPage.jsx` (panel de administración) · `src/components/RequireAdmin.jsx` (guard de ruta) |
| **Tabla** | `anonymous_feedback` (`company_id, type, area, message, status, admin_note, created_at, updated_at`). **Sin columna de autor a propósito** — no existe `user_id` ni equivalente, es la garantía estructural del anonimato. |
| **Ruta** | `/feedback`, envuelta en `<RequireAdmin>` (no en `<RequireModule>`: registrar el módulo en `MODULES` dejaría el buzón abierto a todos por el default "sin reglas = acceso libre" de `src/lib/permissions.js`). |
| **Permisos** | Envío: cualquier `authenticated` (RLS `insert ... with check (true)`, sin riesgo porque la fila no lleva identidad). Lectura/actualización de estado: solo `userProfile.admin === true`, reforzado por RLS del lado del servidor (policies `admin = true` sobre `public.users`). |
| **Navegación** | Botón amarillo "Sugerencias y errores" fijo al fondo del sidebar (reemplaza el link a Soporte Técnico). Link "Buzón anónimo (admin)" debajo, visible solo si `userProfile.admin`. |
