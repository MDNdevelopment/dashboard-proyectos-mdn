-- Liga cada pieza del checklist (av_pauta_piezas) a un formato (V/R/F) de la pauta, y
-- deriva "editadas" por formato desde ahí en vez de escribirse a mano.
--
-- Antes, "editadas" por formato (av_pautas.piezas_por_formato[code].editadas) era un
-- número que el coordinador tecleaba directamente en PautaDetailModal. Eso no dice QUIÉN
-- edita cada pieza de cada formato, y no hay garantía de que no supere "salieron". Ahora:
-- - av_pauta_piezas.formato (V/R/F, nullable) dice de qué formato es cada pieza.
-- - "editadas" de un formato = piezas de ESE formato en status='listo', recalculado por
--   trigger cada vez que el checklist cambia — y siempre clampeado a "salieron" (que
--   sigue siendo manual: el coordinador decide cuántas piezas de ese formato salieron).
-- - "salieron" sigue siendo 100% manual (PautaDetailModal → input "Salieron").
--
-- Regla de activación (sin regresión para pautas viejas): el desglose por formato solo
-- se recalcula para una pauta cuando su piezas_por_formato YA es distinto de '{}' — o
-- sea, el coordinador ya tecleó al menos un "salieron" alguna vez (ver migración
-- 20260909000000). Pautas que nunca tocaron esa UI (piezas_por_formato = '{}') siguen
-- 100% en el camino legacy: piezas_editadas = conteo global de piezas 'listo', sin mirar
-- el campo formato.
alter table public.av_pauta_piezas
  add column if not exists formato text;

alter table public.av_pauta_piezas
  add constraint av_pauta_piezas_formato_check
  check (formato is null or formato in ('V', 'R', 'F'));

-- ── Recalcula piezas_por_formato[*].editadas desde el checklist, clampeado a salieron ──
create or replace function public.av_pautas_sync_formato_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.piezas_por_formato is distinct from '{}'::jsonb and new.piezas_por_formato <> '{}'::jsonb then
    select jsonb_object_agg(
      e.key,
      jsonb_build_object(
        'salieron', coalesce((e.value->>'salieron')::int, 0),
        'editadas', least(
          coalesce((e.value->>'salieron')::int, 0),
          (
            select count(*)::int
            from public.av_pauta_piezas p
            where p.pauta_id = new.id and p.formato = e.key and p.status = 'listo'
          )
        )
      )
    )
    into new.piezas_por_formato
    from jsonb_each(new.piezas_por_formato) as e(key, value);

    select
      coalesce(sum((value->>'salieron')::int), 0),
      coalesce(sum((value->>'editadas')::int), 0)
    into new.piezas_totales, new.piezas_editadas
    from jsonb_each(new.piezas_por_formato);
  end if;
  return new;
end;
$$;

-- ── El trigger del checklist, al cambiar una pieza, "toca" av_pautas para forzar el
-- recálculo de arriba (camino formato) o recalcula piezas_editadas directo (camino
-- legacy) ────────────────────────────────────────────────────────────────────────
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

  -- Camino formato: re-touch de piezas_por_formato dispara av_pautas_sync_formato_counters
  -- (trigger BEFORE UPDATE en av_pautas), que recalcula editadas desde el checklist.
  update public.av_pautas
  set piezas_por_formato = piezas_por_formato
  where id = target_pauta_id
    and piezas_por_formato <> '{}'::jsonb;

  -- Camino legacy: pautas que nunca usaron el desglose por formato.
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
