-- Minuta corta: además del link (minuta_url), permite dejar un resumen de texto escrito
-- directamente en la reunión, para reuniones cortas donde armar un documento aparte no
-- vale la pena. Se edita/lee junto al link en MeetingDetail.jsx (ver sanitizeFields en
-- meetingsApi.js, que ya gatea la escritura de minuta_url con el mismo criterio).

alter table public.meetings
  add column if not exists minuta_text text;
