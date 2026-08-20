-- "Graba" (una sola persona, graba_user_id/graba_other) pasa a "Recursos": selección
-- múltiple de empleados de Audiovisual que graban fotos/video de una pauta (misma
-- estructura que attendee_ids). No se borran graba_user_id/graba_other (quedan sin uso
-- en la UI nueva, sin operación destructiva sobre datos históricos).
alter table public.av_pautas
  add column if not exists recurso_ids text[] not null default '{}';
