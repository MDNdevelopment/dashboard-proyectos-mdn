-- Soft delete de pautas audiovisuales: agrega columna deleted_at para poder restaurar una
-- pauta borrada desde cualquiera de las 3 fases (Solicitudes/Agenda/Realizadas), en vez del
-- DELETE físico anterior. Una pauta borrada tiene deleted_at NOT NULL; activa = deleted_at
-- IS NULL. Mismo patrón que metric_clients (20260713000000_client_soft_delete.sql).
--
-- No hace falta una policy RLS nueva: "borrar" y "restaurar" pasan a ser un UPDATE de
-- deleted_at, y la policy "av_pautas_update" (20260824000000) ya cubre exactamente el mismo
-- criterio que la de DELETE físico (audiovisual.coordina OR audiovisual.manage). La policy
-- "av_pautas_delete" se deja sin uso desde el cliente (mismo criterio que metric_clients, que
-- tampoco removió su policy de DELETE al introducir soft delete).
alter table public.av_pautas
  add column if not exists deleted_at timestamptz;

create index if not exists av_pautas_active_idx
  on public.av_pautas (company_id)
  where deleted_at is null;
