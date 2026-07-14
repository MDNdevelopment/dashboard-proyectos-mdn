-- Agrega el link de la minuta (Google Drive) a una reunión. Se captura opcionalmente
-- al marcarla como realizada desde MeetingDetail, y puede editarse después.
alter table public.meetings
  add column if not exists minuta_url text;
