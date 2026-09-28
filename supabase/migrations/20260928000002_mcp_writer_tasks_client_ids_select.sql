-- Varias marcas por tarea (20260928000001_tasks_multi_client.sql) agregó `client_ids` al
-- RETURNING de createTask() en netlify/functions/_lib/mcpWrite.js. Igual que
-- 20260925020000_mcp_writer_returning_select.sql, el rol mcp_writer necesita SELECT
-- explícito sobre esa columna nueva o el INSERT ... RETURNING falla con
-- "permission denied for table tasks".
GRANT SELECT (client_ids) ON public.tasks TO mcp_writer;
