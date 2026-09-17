-- Memoria de a quién pertenecía una pieza antes de quedar sin editor.
--
-- Al quitar a un editor del picker (PautaDetailModal → handleEditorsChange), sus piezas
-- pasan a editor_user_id = null. Antes de este cambio, volver a agregarlo NO las
-- recuperaba: quedaban en un recuadro "Sin asignar" junto al bloque vacío del editor
-- recién re-agregado, y parecía un fantasma. Ahora la huerfanización guarda aquí al editor
-- anterior, para poder OFRECER la devolución al re-agregarlo — también tras recargar la
-- página o desde otro usuario/coordinador (un estado local de React no sobreviviría a
-- ninguna de las dos cosas).
--
-- Mismo tipo que editor_user_id (text desde 20260830000001_av_piezas_editor_text.sql):
-- admite 'ext:<uuid>'. Nullable y sin FK, igual que editor_user_id. No lo lee ningún
-- trigger ni contador — es pura UX de reasignación.
alter table public.av_pauta_piezas
  add column if not exists prev_editor_user_id text;
