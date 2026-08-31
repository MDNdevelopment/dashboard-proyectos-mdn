-- Desglose de piezas por formato (Video/Reel/Foto) en pautas audiovisuales.
--
-- Hasta ahora, al marcar una pauta 'realizada' solo se registraba un total global de
-- piezas: piezas_totales (manual) y piezas_editadas (derivado del checklist
-- av_pauta_piezas, ver 20260828000000_av_pauta_piezas.sql). Eso no permite responder
-- "¿cuántos reels salieron y se editaron?" separado de "¿cuántas fotos?".
--
-- av_pautas.piezas_por_formato guarda, por cada código de av_pautas.formats (V/R/F, ver
-- utils/audiovisual.js FORMAT_KEYS), cuántas piezas salieron y cuántas se editaron:
--   {"R": {"salieron": 3, "editadas": 2}, "F": {"salieron": 5, "editadas": 5}}
--
-- Regla de compatibilidad (ver ARQUITECTURA.md §2.4ter): piezas_por_formato = '{}' es el
-- camino LEGACY — piezas_totales sigue siendo el input manual de siempre y
-- piezas_editadas la sigue derivando el checklist, sin cambios para pautas anteriores a
-- esta migración. En cuanto una pauta tiene algo en piezas_por_formato, ese objeto pasa a
-- mandar sobre los dos contadores y el checklist deja de escribir piezas_editadas para
-- ella (sigue sirviendo para el seguimiento del trabajo por editor). Esto evita
-- backfillear el histórico repartiendo un total global entre formatos sin base real.
alter table public.av_pautas
  add column if not exists piezas_por_formato jsonb not null default '{}'::jsonb;

-- Un check constraint no puede usar subqueries (jsonb_each) directamente, así que la
-- validación vive en esta función auxiliar.
create or replace function public.av_pautas_valid_piezas_por_formato(data jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    bool_and(
      key in ('V', 'R', 'F')
      and jsonb_typeof(value) = 'object'
      and coalesce((value->>'salieron')::int, 0) >= 0
      and coalesce((value->>'editadas')::int, 0) >= 0
    ),
    true
  )
  from jsonb_each(data) as e(key, value)
$$;

alter table public.av_pautas
  add constraint av_pautas_piezas_por_formato_check
  check (public.av_pautas_valid_piezas_por_formato(piezas_por_formato));

-- ── Trigger: deriva piezas_totales/piezas_editadas de piezas_por_formato ────────────
-- Solo actúa cuando piezas_por_formato trae datos; si está vacío no toca nada (camino
-- legacy: piezas_totales manual, piezas_editadas derivado por
-- av_pauta_piezas_sync_counters_trigger de abajo).
create or replace function public.av_pautas_sync_formato_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.piezas_por_formato is distinct from '{}'::jsonb and new.piezas_por_formato <> '{}'::jsonb then
    select
      coalesce(sum((value->>'salieron')::int), 0),
      coalesce(sum((value->>'editadas')::int), 0)
    into new.piezas_totales, new.piezas_editadas
    from jsonb_each(new.piezas_por_formato);
  end if;
  return new;
end;
$$;

drop trigger if exists av_pautas_sync_formato_counters_trigger on public.av_pautas;
create trigger av_pautas_sync_formato_counters_trigger
before insert or update on public.av_pautas
for each row execute function public.av_pautas_sync_formato_counters();

-- ── Guarda en el trigger del checklist: no pisar piezas_editadas cuando la pauta ya usa
-- el desglose por formato (piezas_por_formato no vacío) ─────────────────────────────
create or replace function public.av_pauta_piezas_sync_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pauta_id uuid;
begin
  target_pauta_id := coalesce(new.pauta_id, old.pauta_id);
  update public.av_pautas
  set piezas_editadas = (
    select count(*) from public.av_pauta_piezas
    where pauta_id = target_pauta_id and status = 'listo'
  )
  where id = target_pauta_id
    and piezas_por_formato = '{}'::jsonb;
  return null;
end;
$$;
