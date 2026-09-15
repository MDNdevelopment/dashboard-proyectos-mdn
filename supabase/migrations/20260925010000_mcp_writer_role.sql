-- Rol de escritura acotada para el servidor MCP remoto (netlify/functions/mcp.js),
-- usado SOLO por la tool `create_task` cuando el token trae role='writer' (hoy,
-- un pequeño grupo de personas que comparte la contraseña de escritura — ver
-- netlify/functions/oauth.js y MCP_WRITER_USER_IDS en mcpWrite.js). A diferencia
-- de `mcp_readonly` (20260813000000_mcp_readonly_role.sql), este rol puede
-- escribir, pero el único privilegio que tiene es INSERT en `public.tasks`: no
-- puede tocar ninguna otra tabla, ni UPDATE/DELETE siquiera en tasks. El resto
-- de la protección (created_by validado contra una allowlist, company_id fijo,
-- status fijo en 'Pendiente') vive en la app (netlify/functions/_lib/mcpWrite.js),
-- no en la BD.
--
-- IMPORTANTE — seguridad: la contraseña de abajo es un placeholder. Antes de
-- usar este rol en producción, rótala con:
--   ALTER ROLE mcp_writer WITH PASSWORD '<contraseña fuerte generada aparte>';
-- y guarda la cadena de conexión resultante SOLO como env var de Netlify
-- (SUPABASE_WRITER_DB_URL). Nunca commitees la contraseña real al repo.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_writer') THEN
    CREATE ROLE mcp_writer WITH LOGIN PASSWORD 'CHANGE_ME_ROTATE_BEFORE_USE';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO mcp_writer;
GRANT INSERT ON public.tasks TO mcp_writer;

ALTER ROLE mcp_writer SET statement_timeout = '10s';

-- Se conecta como rol Postgres directo (sin JWT de Supabase Auth), así que
-- auth.uid() es null y las políticas RLS de `tasks` (que comparan contra
-- auth.uid()) nunca lo dejarían insertar — mismo motivo que BYPASSRLS en
-- mcp_readonly (20260813010000_mcp_readonly_bypass_rls.sql). No debilita nada:
-- el rol solo tiene GRANT INSERT en una tabla, así que lo único que puede
-- "saltarse" con BYPASSRLS es la propia política de tasks que igual tendría
-- que satisfacer.
ALTER ROLE mcp_writer BYPASSRLS;
