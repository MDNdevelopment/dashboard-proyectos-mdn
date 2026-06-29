-- Agrega la columna `metas` a metric_lines.
-- Almacena metas por defecto de reuniones y tareas fijas para cada línea.
-- Formato: { "reuniones": 15, "tareas": [ { "nombre": "Calendario", "meta": 10 }, ... ] }
-- Líneas sin metas configuradas mantienen {} y la UI cae a los defaults del código.

ALTER TABLE metric_lines
  ADD COLUMN IF NOT EXISTS metas jsonb NOT NULL DEFAULT '{}'::jsonb;
