-- Rol de solo lectura para el servidor MCP remoto (netlify/functions/mcp.js).
-- Objetivo: que la tool query_database no pueda escribir NUNCA, incluso si el
-- validador de SQL de la app (netlify/functions/_lib/db.js) tuviera un hueco.
-- default_transaction_read_only = on hace que Postgres rechace cualquier
-- escritura a nivel de motor, no de regex.
--
-- IMPORTANTE — seguridad: la contraseña de abajo es un placeholder. Antes de
-- usar este rol en producción, rótala con:
--   ALTER ROLE mcp_readonly WITH PASSWORD '<contraseña fuerte generada aparte>';
-- y guarda la cadena de conexión resultante SOLO como env var de Netlify
-- (SUPABASE_READONLY_DB_URL). Nunca commitees la contraseña real al repo.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_readonly') THEN
    CREATE ROLE mcp_readonly WITH LOGIN PASSWORD 'CHANGE_ME_ROTATE_BEFORE_USE';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_readonly;

-- Salvaguardas a nivel de sesión: toda transacción de este rol es read-only
-- por defecto, y las consultas se cortan a los 10s para no colgar la function.
ALTER ROLE mcp_readonly SET default_transaction_read_only = on;
ALTER ROLE mcp_readonly SET statement_timeout = '10s';
