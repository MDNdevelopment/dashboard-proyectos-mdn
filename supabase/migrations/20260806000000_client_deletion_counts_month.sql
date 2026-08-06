-- Al dar de baja un cliente, indica si su mes de baja aún cuenta en los reportes.
-- true  = conserva el mes de baja (facturó/trabajó parte del mes) — comportamiento histórico.
-- false = se excluye también del mes de baja (no facturó / alta por error).
-- Solo aplica cuando deleted_at NO es null. Default true preserva el comportamiento
-- de todos los clientes ya archivados antes de esta migración.

ALTER TABLE metric_clients
  ADD COLUMN IF NOT EXISTS baja_incluye_mes boolean NOT NULL DEFAULT true;
