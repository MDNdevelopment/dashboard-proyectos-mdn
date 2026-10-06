-- MCP de escritura: cambiar estado de tareas propias y comentarlas.
--
-- Habilita las tools `update_task` y `add_task_comment` de netlify/functions/mcp.js
-- (lógica y validaciones en netlify/functions/_lib/mcpWriteTaskUpdates.js). Las usa el
-- flujo de agentes de desarrollo (/tareas-mappi) para dejar en la tarea el link del PR
-- que la resuelve, preguntas cuando la tarea es ambigua, y moverla de estado.
--
-- Alcance mínimo, igual que el resto del rol mcp_writer:
--   * tasks: UPDATE solo de status / closed_date / blocked_reason (nada de reasignar,
--     cambiar descripción, cliente ni fechas de solicitud/entrega).
--   * task_comments: INSERT (y SELECT de las columnas del RETURNING).
-- La restricción "solo tareas en las que eres responsable o creador" vive en la app
-- (mcpWriteTaskUpdates.js → loadOwnTask), el mismo modelo que create_task.
--
-- Postgres exige SELECT sobre las columnas que tocan WHERE/RETURNING de un UPDATE:
-- company_id (WHERE) y closed_date/blocked_reason (RETURNING) se suman al GRANT SELECT
-- por columna que ya tenía tasks.

GRANT UPDATE (status, closed_date, blocked_reason) ON public.tasks TO mcp_writer;
GRANT SELECT (company_id, closed_date, blocked_reason) ON public.tasks TO mcp_writer;

GRANT INSERT ON public.task_comments TO mcp_writer;
GRANT SELECT (id, task_id, author_id, content, created_at) ON public.task_comments TO mcp_writer;
