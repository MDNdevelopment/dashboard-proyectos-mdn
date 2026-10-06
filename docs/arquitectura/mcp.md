### 2.13 MCP — acceso a la base de datos con IA

Servidor MCP **remoto** (HTTP, usable desde PC/Mac e iPhone) para que el chat de Claude consulte **cualquier tabla** (lectura para todo el equipo) y, solo para un grupo autorizado, cree/edite/elimine tareas, reuniones y CNP.

#### Archivos
- `netlify/functions/mcp.js` — endpoint MCP, JSON-RPC 2.0 a mano: `initialize`, `notifications/initialized`, `ping`, `tools/list` (filtra tools por `role` del token), `tools/call`.
- `netlify/functions/oauth.js` — OAuth 2.1 mínimo: metadata `.well-known`, Dynamic Client Registration, `authorize` (formulario de contraseña, `resolveAuth()`), `token`.
- `netlify/functions/_lib/oauthCrypto.js` — `issueToken`/`verifyToken`: tokens opacos HMAC-SHA256 + expiración, sin tabla de sesiones.
- `netlify/functions/_lib/db.js` — `runReadOnlyQuery`/`listTables` (tools de lectura); `runInternalQuery`: SELECT parametrizado interno (nunca expuesto como tool) que usan las tools de reuniones/CNP para resolver snapshots.
- `netlify/functions/_lib/mcpWrite.js` — primitivas: `getWriterPool`, `ValidationError`, `assertNonEmptyString`, `requiredCompanyId`, `buildSet` (SET parametrizado desde whitelist hardcodeado de columnas) + `createTask`.
- `netlify/functions/_lib/mcpWriteMeetings.js` — `createMeeting`/`updateMeeting`/`deleteMeeting`: reimplementan en SQL el snapshot posicional de clientes y la exclusión mutua de modalidad de `meetingsApi.js`.
- `netlify/functions/_lib/mcpWriteCnp.js` — `createCnp`/`updateCnp`/`softDeleteCnp`: reimplementa `closeBlockedReason`; nunca expone `team_checked_*`/`print_approved_*`.
- `mcp-server/` — README y `mcp-server/GUIA-INSTALACION.md`; su `index.js` (MCP local stdio, solo `projects`) es obsoleto.
- Gotcha: las reglas de negocio de reuniones/CNP viven en JS (`meetingsApi.js`, etc.) y el rol de escritura tiene BYPASSRLS → cualquier cambio de esas reglas debe replicarse en `mcpWrite*.js`.

#### Endpoint
- `POST /mcp` con `Authorization: Bearer <access_token>`.
- Sin token válido → `401` + `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"` (le indica a Claude dónde iniciar OAuth).
- Gotcha: OAuth 2.1 + PKCE es el único auth que soporta el conector remoto de Claude; una URL con secreto embebido falla con "couldn't register with sign in service".

#### Flujo OAuth (sin BD de sesiones)
- `client_id`, `code` y `access_token` son payloads JSON firmados con `MCP_OAUTH_SIGNING_SECRET` (HMAC-SHA256) + expiración; se verifican solo por firma.
1. `POST /oauth/register` (DCR) → `client_id` que codifica sus `redirect_uris`.
2. `GET /oauth/authorize` (PKCE `S256` obligatorio) → formulario HTML de contraseña.
3. Contraseña correcta → `code` (TTL 5 min, con `role`/`userId` embebidos) → redirect al `redirect_uri`.
4. `POST /oauth/token` (valida `code_verifier`) → `access_token` Bearer, TTL 90 días, sin refresh, mismo `role`/`userId`.

#### Roles y tools
- Contraseñas (`resolveAuth()`): una **individual por escritor** en `MCP_WRITERS` (JSON `[{ "secret", "user_id", "name" }, ...]`) → `role: 'writer'` + `userId`; contraseña compartida `MCP_URL_SECRET` → `role: 'reader'`.
- Token sin `role` → `reader`, nunca `writer`.
- Siempre: `list_tables` (desde `information_schema.columns`) y `query_database` (`sql`, `limit` opcional ≤1000, default 500).
- Solo `writer` (6 más, consolidadas por entidad+verbo como MAPPI §2.14):
  - `create_task` (sobre `tasks`).
  - `update_task` (estado `Pendiente`/`En proceso`/`Paralizado`/`Terminado`; `Terminado` fija `closed_date` = hoy en Caracas, `Paralizado` exige `blocked_reason`) y `add_task_comment` (inserta en `task_comments`, `author_id` = token). Ambas solo sobre tareas donde quien escribe es responsable (`assignee_id`/`assignee_ids`) o creador (`created_by`); lógica en `_lib/mcpWriteTaskUpdates.js`. Las usa `/tareas-mappi`.
  - `create_meeting`/`update_meeting`/`delete_meeting` sobre `meetings`; `update_meeting` cubre editar, reagendar, realizada/cancelar/desmarcar vía `status`.
  - `create_cnp`/`update_cnp`/`delete_cnp` sobre `cnp_requests`; `update_cnp` cubre editar y cambiar estado; `delete_cnp` = soft delete (`deleted_at`).
- `tools/call` re-valida `role` en servidor para las 9 tools de escritura aunque no se hayan anunciado.
- Un solo grupo de escritores para tasks/meetings/cnp.

#### Reglas de escritura
- `created_by` y `company_id` **nunca** vienen del modelo: `mcp.js` fija `created_by` desde `tokenPayload.userId` (pisando cualquier valor enviado) y `company_id` desde `MCP_COMPANY_ID`.
- Ninguna tool acepta SQL ni columnas libres: lista fija de columnas por tool; `buildSet` toma nombres de columna solo del array literal del código, nunca de `patch`.
- Estados iniciales: `create_task`/`create_cnp` → `'Pendiente'`; `create_meeting` → `'programada'`.
- `update_cnp`: un CNP `is_print` no pasa a `'Terminado'` (`status: 'Terminado'`) sin `team_checked_at` y `print_approved_at`, y la tool **nunca** escribe esas columnas (aprobación exclusiva del dashboard, capability `cnp.print.approve`). Ver §2.4quinquies.
- `delete_meeting` = borrado duro (igual que el dashboard).
- Todo UPDATE/DELETE de `meetings`/`cnp_requests` acotado por `id` y `company_id = $MCP_COMPANY_ID`.
- El modelo debe resolver `team_id`/`assignee_ids`/`client_id`/`line_id`/`attendee_ids` con `query_database` antes; no hay validación de existencia: IDs inválidos fallan por FK/tipo y vuelven como `isError`.

#### Seguridad — lectura
1. La app solo acepta un único `SELECT` / `WITH...SELECT`.
2. Conexión con rol `mcp_readonly`: `default_transaction_read_only = on` a nivel de rol; `BYPASSRLS` (conecta directo a Postgres sin JWT, `auth.uid()` sería nulo).
- `runInternalQuery` corre sobre esta MISMA conexión de solo lectura, nunca sobre `mcp_writer` (no ampliar `mcp_writer` con SELECT sobre `metric_clients`).

#### Seguridad — escritura
3. Rol aparte `mcp_writer`, grants tabla por tabla y SIEMPRE por migración explícita (nunca `ALL TABLES`), también `BYPASSRLS`:
   - `public.tasks`: `GRANT INSERT` + `GRANT UPDATE (status, closed_date, blocked_reason)` (sin DELETE) + `GRANT SELECT` **por columna** solo sobre las columnas de WHERE/`RETURNING` de `mcpWrite.js` y `mcpWriteTaskUpdates.js`.
   - `public.task_comments`: `GRANT INSERT` + `SELECT` por columna del `RETURNING`.
   - `public.meetings`: `GRANT SELECT, INSERT, UPDATE, DELETE`.
   - `public.cnp_requests`: `GRANT SELECT, INSERT, UPDATE` (sin DELETE: borrado siempre soft).
   - SELECT de tabla completa en meetings/cnp porque UPDATE/DELETE con `RETURNING`/WHERE exige SELECT sobre esas columnas; no amplía superficie (`mcp_readonly` ya las lee).
   - Gotcha: `RETURNING` exige privilegio `SELECT` sobre esas columnas; sin él el INSERT se ejecuta pero falla con "permission denied". Al cambiar columnas del RETURNING de tasks, ajustar el grant.
   - Los triggers de tabla (notificación de asistentes de reuniones, aprobación de impresión de CNP, `closed_date`) SÍ disparan; solo RLS queda de lado.
4. Tools de escritura solo con `role: 'writer'` (contraseña individual de `MCP_WRITERS`).
5. `created_by` no se puede falsear: sale del token, no de `tools/call`.
- `/mcp` siempre exige Bearer válido, obtenible solo superando `/oauth/authorize`.

#### Variables de entorno (nunca hardcodeadas)
- `SUPABASE_READONLY_DB_URL` / `SUPABASE_WRITER_DB_URL`: usar el **pooler Supavisor** `postgresql://<rol>.<project_ref>:<password>@aws-0-<región>.pooler.supabase.com:6543/postgres`.
  - Gotcha: NUNCA `db.<project_ref>.supabase.co` (solo IPv6; Netlify no tiene salida IPv6 → `ENOTFOUND`).
  - Gotcha: sin `sslmode=require` en la query string: `pg` lo trata como `verify-full` y pisa `ssl:{rejectUnauthorized:false}`.
- `MCP_URL_SECRET` (contraseña de lectura), `MCP_WRITERS`, `MCP_OAUTH_SIGNING_SECRET`, `MCP_COMPANY_ID` (empresa fija de toda escritura).
- No usa `SUPABASE_SERVICE_ROLE_KEY`.

#### Instalación (usuario)
- Claude → Settings → Connectors → "Add custom connector" → `https://mdngestion.netlify.app/mcp` (sin secreto) → pantalla de contraseña.
- Equipo: contraseña de lectura. Cada escritor: SU PROPIA contraseña (usar la ajena atribuye la autoría a otra persona).
- Requiere plan de pago (Pro/Max/Team/Enterprise). Guía: `mcp-server/GUIA-INSTALACION.md`.
