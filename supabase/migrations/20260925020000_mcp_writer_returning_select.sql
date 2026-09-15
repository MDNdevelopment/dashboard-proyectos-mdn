-- Fix: INSERT ... RETURNING requiere privilegio SELECT sobre las columnas
-- devueltas (no basta con INSERT) — detalle poco conocido de Postgres. El rol
-- `mcp_writer` (20260925010000_mcp_writer_role.sql) solo tenía INSERT, así que
-- todo intento de create_task fallaba con "permission denied for table tasks"
-- justo en el RETURNING, después de que el INSERT ya había sido válido.
--
-- Se otorga SELECT únicamente sobre las columnas que
-- netlify/functions/_lib/mcpWrite.js pide en su RETURNING — no la tabla
-- completa. No amplía la superficie real: mcp_writer solo se usa desde
-- createTask() (nunca desde query_database), así que no hay ninguna tool que
-- permita explotar este SELECT para leer filas o columnas fuera de esa lista.
GRANT SELECT (id, team_id, client, description, assignee_ids, due_date, status, created_at)
  ON public.tasks TO mcp_writer;
