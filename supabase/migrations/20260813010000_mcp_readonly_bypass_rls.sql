-- mcp_readonly (ver 20260813000000_mcp_readonly_role.sql) se conecta como rol Postgres
-- directo, sin JWT de Supabase Auth — las políticas RLS que dependen de auth.uid()/
-- auth.role() lo tratan como "no autenticado" y devuelven 0 filas en todas las tablas
-- con RLS, aunque tenga GRANT SELECT. Para el caso de uso de MCP (análisis ad-hoc sobre
-- toda la base, no una vista con scoping por usuario/empresa) necesita ver todas las
-- filas, así que le damos BYPASSRLS.
--
-- Esto NO afecta la garantía de solo lectura: default_transaction_read_only = on está
-- fijado a nivel de rol (independiente de RLS) y sigue rechazando cualquier escritura.
ALTER ROLE mcp_readonly BYPASSRLS;
