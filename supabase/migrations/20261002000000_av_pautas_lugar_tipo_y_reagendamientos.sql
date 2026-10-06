-- Rediseño del módulo Pautas (1/3): tipo de lugar e historial de reagendamientos.
--
-- `lugar_tipo`: hasta ahora el lugar era texto libre (`place`). Para poder validar la
-- reserva del estudio hace falta saber de forma estructurada si la pauta ocurre en el
-- Estudio MDN o en una locación externa. Es `text` (no boolean) para poder sumar otros
-- tipos sin migrar. `place` sigue siendo el texto libre de la locación; para estudio queda
-- sin uso y la UI pinta "Estudio MDN".
--
-- `reagendamientos`: historial de cambios de fecha/hora de una pauta ya programada. Lo
-- escribe un trigger (no el cliente): así el botón "Reagendar", una edición directa de la
-- fecha y cualquier escritura por API/MCP dejan exactamente el mismo rastro y nadie puede
-- omitirlo. Cada entrada: {from_date, from_salida, to_date, to_salida, at, by}.
alter table public.av_pautas
  add column if not exists lugar_tipo text not null default 'locacion',
  add column if not exists reagendamientos jsonb not null default '[]'::jsonb;

alter table public.av_pautas
  drop constraint if exists av_pautas_lugar_tipo_check;
alter table public.av_pautas
  add constraint av_pautas_lugar_tipo_check check (lugar_tipo in ('estudio', 'locacion'));

alter table public.av_pautas
  drop constraint if exists av_pautas_reagendamientos_check;
alter table public.av_pautas
  add constraint av_pautas_reagendamientos_check check (jsonb_typeof(reagendamientos) = 'array');

-- Backfill heurístico y reversible: las pautas que ya decían "estudio" en el lugar libre
-- pasan a lugar_tipo = 'estudio'. Solo etiqueta; no entran en la constraint de solape
-- (ver 20261002000001, que tiene fecha de corte).
update public.av_pautas
set lugar_tipo = 'estudio'
where place ilike '%estudio%';

create or replace function public.av_pautas_track_reagendamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'programada'
     and new.status = 'programada'
     and old.pauta_date is not null
     and (old.pauta_date is distinct from new.pauta_date
          or old.salida is distinct from new.salida) then
    new.reagendamientos := coalesce(old.reagendamientos, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'from_date', old.pauta_date,
        'from_salida', old.salida,
        'to_date', new.pauta_date,
        'to_salida', new.salida,
        'at', now(),
        'by', auth.uid()::text
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists av_pautas_track_reagendamiento_trigger on public.av_pautas;
create trigger av_pautas_track_reagendamiento_trigger
before update of pauta_date, salida on public.av_pautas
for each row execute function public.av_pautas_track_reagendamiento();
