# Notificaciones (§2.9)

## Resumen
- Centro in-app (campanita) + correos. Grupos:
  1. Asignación a tarea/proyecto/reunión → in-app + correo.
  2. Fechas de cliente (aniversario empresa, aniversario MDN, cumpleaños de contacto) → solo in-app, a miembros de la línea + nivel 4.
  3. Fechas de empleados (cumpleaños, aniversario de entrada) → solo in-app, a toda la empresa.
  4. Recordatorios de reunión (día previo + 1 h antes) → in-app + correo, a participantes.
  5. Cierres automáticos de campañas/ads (in-app, `email=false`) y de reportes mensuales (recordatorio + cierre).
- WhatsApp: no implementado (pendiente, ver §2.11). Enganche previsto: edge function nueva disparada por el mismo patrón sobre `notifications`.

## Rutas y archivos
- Sin ruta propia (widget global).
- `src/components/notifications/NotificationBell.jsx`: montada en barra mobile de `AppLayout.jsx` y sección de usuario de `Sidebar.jsx` (desktop). Carga últimas 40, suscribe `postgres_changes` (INSERT + UPDATE) filtrado por `user_id`; badge de no leídas; marcar una/todas; clic navega a la entidad.
- `src/utils/notificationFormat.js`: ícono, etiqueta, ruta, tiempo relativo.
- Navegación: tarea → `/tareas`; proyecto → `/?projectId=<id>` (`AppLayout.jsx` abre `ProjectModal`); cliente → `/empresa/clientes`; empleado → `/empresa/empleados`; reunión → `/reuniones?meetingId=<id>` (`ReunionesPage.jsx` abre `MeetingDetail`, solo lectura); `campaign`/`ad` → `/ads`; `metric_report` → `/reportes/linea/:id?tab=operaciones&year=&month=`.
- Correo: `supabase/functions/notify-dispatch/index.ts` → Resend. Secrets `RESEND_API_KEY`, `SENDER_EMAIL`.

## Datos
- `notifications`: `id, company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key, created_at`. En `supabase_realtime`.
- Types: `task_assigned` · `checklist_item_assigned` · `project_added` · `meeting_invite` · `meeting_reminder_day` · `meeting_reminder_hour` · `client_anniversary` · `client_mdn_anniversary` · `client_contact_birthday` · `employee_birthday` · `employee_mdn_anniversary` · `campaign_autoclosed` · `ad_autoclosed` (entity_type `campaign`/`ad`) · `report_close_reminder` · `report_autoclosed` (entity_type `metric_report`, entity_id `<lineId>:<year>:<month>`, §2.5).
- `notif_cron_runs`: `id, job_name, ran_at, notifications_inserted, errors_count, error_sample, ok` (una fila por corrida; observabilidad del job de fechas).
- Fechas de empleado: `users.birth_date`, `users.hire_date` (editables en `EmployeeModal.jsx`).

## Permisos
- RLS `notifications`: solo el destinatario lee/actualiza las suyas.
- INSERT solo desde triggers y funciones SECURITY DEFINER.
- `notif_cron_runs`: solo lectura para `access_level ≥ 4`.

## Reglas de negocio
### Triggers de asignación (comparan OLD vs NEW; en INSERT todos son "nuevos")
- `notify_task_assignees()` sobre `tasks.assignee_ids`: nunca se auto-notifica (INSERT y UPDATE) comparando contra `auth.uid()::text` (actor real); fallback a `created_by` en INSERT sin sesión (service_role/backfills).
- `notify_checklist_assignees` sobre `tasks.checklist`: diff por id de ítem, notifica al `assignee_id` nuevo/cambiado.
- `notify_project_members()` sobre `projects.members`: excluye al creador solo en INSERT.
- `notify_meeting_attendees()` sobre `meetings.attendee_ids`: no excluye a nadie (el creador puede ser participante).

### Correo
- Database Webhook de Supabase en INSERT sobre `notifications` con `email = true` → `notify-dispatch`. Aplica a `task_assigned`, `project_added`, `meeting_invite`, `meeting_reminder_day`, `meeting_reminder_hour`.

### Jobs `pg_cron` (todas SECURITY DEFINER, idempotentes vía `dedupe_key` + `ON CONFLICT DO NOTHING`)
- **Fechas** — diario 08:00 Caracas (12:00 UTC), `enqueue_date_notifications()`.
  - Cliente: 3 días antes + el día. Empleado: solo el día exacto.
  - Destinatarios cliente: `notif_client_recipients()` = miembros de línea ∪ `access_level ≥ 4`, excluyendo `deleted_at`; `line_id` nulo → solo nivel 4.
  - Lee `metric_clients.anniversary_date`, `metric_clients.mdn_since`, `metric_clients.contacts[].birth_day/birth_month`, `users.birth_date`, `users.hire_date`; excluye usuarios archivados.
  - Cada evento (cliente/contacto/empleado) en su propio `BEGIN/EXCEPTION`; cada corrida registra en `notif_cron_runs`.
- **Recordatorios de reunión** — cada 15 min, `enqueue_meeting_reminders()`. Ventanas `[+24h, +24h15m)` y `[+1h, +1h15m)` sobre `meetings.starts_at` con `status='programada'`. `dedupe_key` incluye `starts_at` (reprogramar genera recordatorios nuevos).
- **Cierre de campañas** — diario 07:00 Caracas (11:00 UTC), `enqueue_campaign_closures()`. `campaigns` y `paid_campaigns` con `end_date < hoy` (Caracas) y `status in ('Pendiente','En Curso')` → `status='Finalizado'`; en ads además `results_pending=true` (§2.10). In-app (`email=false`) a responsable + Marketing Managers vía `notif_campaign_recipients(company_id, responsable)` (match `lower(position_name)='marketing manager'`). `company_id` de táctica derivado de `assignee`/`created_by`. `dedupe_key` = `campaign_autoclosed:`/`ad_autoclosed:` + id + user_id.
- **Cierre de reportes** — diario 07:30 Caracas (11:30 UTC), `enqueue_metric_report_closures()` (§2.5 "Cierre de reporte"). Solo días 1-5 del mes; recorre `metric_lines` no-generales sobre el mes anterior en `metric_reports`:
  - Días 1-4: `report_close_reminder` a la jefa (`metric_report_close_recipients(line_id, company_id, false)`); `dedupe_key` con la fecha del día (un aviso diario).
  - Día 5: cierre incondicional (`closed_auto=true`, crea la fila si no existe) + `report_autoclosed` a jefa y nivel ≥4 (`metric_report_close_recipients(..., true)`); `dedupe_key` solo con el mes.

## Setup manual
- Database Webhook en dashboard: tabla `notifications`, evento INSERT, URL `{SUPABASE_URL}/functions/v1/notify-dispatch`, header `Authorization: Bearer {SERVICE_ROLE_KEY}`.
- Habilitar extensión `pg_cron` (Dashboard → Extensions).

## Gotchas
- Self-skip de tareas usa `auth.uid()`, no `created_by`: `created_by` se preserva al reasignar y no identifica al actor.
- Datos sucios en fechas (p. ej. `contacts[].birth_day = ''`) llegaron a abortar el job entero y dejar a toda la empresa sin avisos semanas; por eso el aislamiento por evento. Al tocar `enqueue_date_notifications()` mantener ese aislamiento **y** el filtro de archivados (un parche previo lo regresionó). Versión vigente: `20260901000000_fix_notif_date_cron_hardening.sql`.

## Conexiones
- Tareas → Notificaciones: `tasks.assignee_ids`, `tasks.checklist`.
- Proyectos → Notificaciones: `projects.members`.
- Reuniones → Notificaciones: `meetings.attendee_ids`, `meetings.starts_at`.
- Empresa → Notificaciones: fechas de `metric_clients`/`users`; destinatarios por `metric_lines.member_user_ids` y `users.access_level`.
- Ads → Notificaciones: cierre de `campaigns`/`paid_campaigns`.
- Reportes → Notificaciones: cierre de `metric_reports`.
