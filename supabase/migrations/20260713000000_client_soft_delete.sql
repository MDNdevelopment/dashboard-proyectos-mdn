-- Soft delete de clientes: agrega columna deleted_at e índice parcial para activos.
-- Un cliente archivado tiene deleted_at NOT NULL; activo = deleted_at IS NULL.
-- Los registros nunca se borran, preservando referencias en metric_reports, tasks y campaigns.

ALTER TABLE metric_clients
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS metric_clients_active_idx
  ON metric_clients (company_id)
  WHERE deleted_at IS NULL;
