-- `editor_user_id` debe poder guardar tanto un empleado (user_id) como un recurso
-- externo (id prefijado 'ext:<uuid>', ver src/utils/audiovisual.js externalAsUser).
-- Se quita la FK a `users` y se pasa la columna a texto libre — mismo criterio que
-- `av_pautas.recurso_ids`, que ya es text[] sin FK.
alter table public.av_pauta_piezas
  drop constraint if exists av_pauta_piezas_editor_user_id_fkey;

alter table public.av_pauta_piezas
  alter column editor_user_id type text using editor_user_id::text;
