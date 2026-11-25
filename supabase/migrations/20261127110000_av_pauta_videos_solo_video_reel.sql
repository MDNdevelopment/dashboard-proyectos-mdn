-- El estado por video (`av_pauta_videos`) aplica solo a Video de marca (V) y Reel (R).
-- Las fotos (F) se siguen llevando por cantidad: un lote puede tener cientos y darle estado
-- a cada una no tiene sentido. En los lotes de fotos `listas` vuelve a ser el dato editable.
--
-- Orden importante: primero los triggers aprenden a ignorar las fotos y recién después se
-- borran sus videos. Si se borraran antes, `av_pauta_videos_sync_listas` recalcularía `listas`
-- a 0 (no quedan videos en 'listo') y se perdería lo entregado, con filas espurias en
-- `av_pieza_listas_log`.

create or replace function public.av_pauta_videos_sync_listas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pieza uuid := coalesce(new.pieza_id, old.pieza_id);
  v_formato text;
  v_listas int;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- Bloquea el lote (ver 20261127100000) y de paso lee su formato.
  select formato into v_formato from public.av_pauta_piezas where id = v_pieza for update;

  -- Las fotos llevan `listas` a mano: nunca se recalcula desde los videos.
  if v_formato is null or v_formato = 'F' then
    return null;
  end if;

  select count(*) into v_listas
  from public.av_pauta_videos
  where pieza_id = v_pieza and status = 'listo';

  update public.av_pauta_piezas
  set listas = least(v_listas, cantidad)
  where id = v_pieza
    and es_lote
    and listas is distinct from least(v_listas, cantidad);
  return null;
end;
$$;

create or replace function public.av_pauta_piezas_sync_videos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actuales int;
  v_sobran int;
  v_borrables uuid[];
begin
  if not new.es_lote or new.formato = 'F' then
    return null;
  end if;

  select count(*) into v_actuales from public.av_pauta_videos where pieza_id = new.id;

  if v_actuales < new.cantidad then
    insert into public.av_pauta_videos (pieza_id, company_id, status, position)
    select new.id, new.company_id,
           case when tg_op = 'INSERT' and g <= new.listas then 'listo' else 'pendiente' end,
           g - 1
    from generate_series(v_actuales + 1, new.cantidad) as g;
  elsif v_actuales > new.cantidad then
    v_sobran := v_actuales - new.cantidad;
    select coalesce(array_agg(id), '{}') into v_borrables
    from (
      select id from public.av_pauta_videos
      where pieza_id = new.id and status in ('pendiente', 'cancelado')
      order by position desc
      limit v_sobran
    ) b;
    if coalesce(array_length(v_borrables, 1), 0) < v_sobran then
      raise exception 'No se puede bajar la cantidad: hay videos en edición o listos que se perderían'
        using errcode = '23514';
    end if;
    delete from public.av_pauta_videos where id = any(v_borrables);
  end if;
  return null;
end;
$$;

-- Quita los videos que el backfill de 20261127100000 creó para lotes de fotos. Con los
-- triggers ya corregidos, este borrado no toca `listas` ni el log.
delete from public.av_pauta_videos v
using public.av_pauta_piezas pz
where v.pieza_id = pz.id and pz.formato = 'F';
