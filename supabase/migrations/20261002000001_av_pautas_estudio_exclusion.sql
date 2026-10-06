-- Rediseño del módulo Pautas (2/3): el Estudio MDN no admite dos pautas solapadas.
--
-- Regla de negocio: una pauta en estudio ocupa 2 horas desde su hora de salida. Dos pautas
-- de distinto cliente no pueden tener ventanas que se crucen. La UI ya lo valida en vivo
-- (ver `estudioConflicts` en src/utils/audiovisual.js); esta constraint cubre lo que la UI
-- no ve: dos pestañas abiertas a la vez, escrituras por API o por el MCP.
--
-- Decisiones:
--   - `client_id with <>`: el mismo cliente SÍ puede solaparse (una sesión partida en dos
--     pautas, caso real del 04/09/2026). Si alguna de las dos no tiene cliente, `<>` da
--     null y no choca — en ese caso solo protege la UI.
--   - Rango semiabierto '[)': una pauta a las 11:00 y otra a las 13:00 no chocan.
--   - Fecha de corte 2026-10-02: existe un solape histórico y las exclusion constraints no
--     admiten NOT VALID, así que el pasado queda fuera del predicado.
--   - Solo estados confirmados ('programada', 'realizada'): una solicitud es una fecha
--     deseada que todavía nadie aprobó y no puede vetar a otra.
create extension if not exists btree_gist;

alter table public.av_pautas
  drop constraint if exists av_pautas_estudio_sin_solape;

alter table public.av_pautas
  add constraint av_pautas_estudio_sin_solape
  exclude using gist (
    company_id with =,
    client_id with <>,
    tsrange(
      (pauta_date + salida)::timestamp,
      (pauta_date + salida)::timestamp + interval '2 hours',
      '[)'
    ) with &&
  )
  where (
    lugar_tipo = 'estudio'
    and status in ('programada', 'realizada')
    and deleted_at is null
    and pauta_date is not null
    and salida is not null
    and pauta_date >= date '2026-10-02'
  );
