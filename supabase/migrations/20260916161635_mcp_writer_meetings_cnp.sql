-- Amplía el rol `mcp_writer` (20260925010000_mcp_writer_role.sql) para que el MCP
-- remoto pueda gestionar Reuniones y CNP, no solo crear tareas — ver
-- netlify/functions/_lib/mcpWriteMeetings.js y mcpWriteCnp.js. Mismo modelo de
-- permisos que create_task: solo el access_token con role='writer' (contraseña
-- individual de MCP_WRITERS) anuncia/ejecuta estas tools.
--
-- A diferencia del GRANT SELECT por columna que tiene `tasks`, acá se otorga
-- SELECT de tabla completa: un UPDATE/DELETE con RETURNING exige privilegio
-- SELECT sobre toda columna referenciada en el WHERE y en el RETURNING, y el
-- grant por columna de `tasks` ya causó el incidente de "permission denied" del
-- 2026-09-25 en cada ajuste de esquema. No amplía la superficie real: mcp_readonly
-- ya lee todas las tablas, y ninguna tool expone SQL libre sobre esta conexión.
--
-- meetings: sin soft-delete en el dominio, así que se otorga DELETE real (igual
-- que meetingsApi.js#deleteMeeting). cnp_requests: el borrado de la app es
-- SIEMPRE soft (deleted_at) — no se otorga DELETE, una capa más de contención
-- física además de que mcpWriteCnp.js nunca emite un DELETE.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO mcp_writer;
GRANT SELECT, INSERT, UPDATE ON public.cnp_requests TO mcp_writer;
