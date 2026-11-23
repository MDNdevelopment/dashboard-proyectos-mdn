-- Estado por video dentro de cada lote de edición (Pautas).
--
-- El rediseño de octubre llevó la edición a LOTES (`av_pauta_piezas.es_lote`): por editor ×
-- formato hay `cantidad` asignadas y `listas` entregadas, y se perdió el estado de cada video
-- (pendiente / en edición / espera de aprobación / listo / cancelado). Esta tabla lo recupera
-- SIN tocar el lote:
--
--   - El lote sigue siendo la unidad que mide la evaluación de personal: score, log de
--     `listas` (`av_pieza_listas_log`), RPC `av_lotes_listas_a_fecha`, reportes y KPIs leen
--     `cantidad`/`listas` del lote y nunca el status de un video.
--   - `av_pauta_videos` cuelga del lote (una fila por unidad) y un trigger mantiene
--     `lote.listas = count(videos en 'listo')` en la misma transacción. El log se sigue
--     alimentando solo porque `listas` cambia por el mismo camino de siempre.
--   - Un video 'cancelado' sigue contando en `cantidad` pero nunca en `listas`: el lote no
--     llega a 'listo' hasta que se baje `cantidad` (el trigger borra los cancelados del
--     final). Por eso solo quien puede editar la pauta ofrece 'Cancelado' en la UI.
--   - Los videos los crean/borran los triggers (security definer) al cambiar `cantidad`; por
--     eso la tabla no tiene policies de INSERT ni DELETE: desde el cliente solo se actualiza
--     el status y el nombre.

create table if not exists public.av_pauta_videos (
  id         uuid primary key default gen_random_uuid(),
  pieza_id   uuid not null references public.av_pauta_piezas(id) on delete cascade,
  company_id text not null,
  nombre     text,
  status     text not null default 'pendiente',
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint av_pauta_videos_status_check check (
    status in ('pendiente', 'en_edicion', 'espera_aprobacion', 'listo', 'cancelado')
  )
);

create index if not exists av_pauta_videos_pieza_idx on public.av_pauta_videos (pieza_id, position);

alter table public.av_pauta_videos enable row level security;

-- Lectura: mismo criterio que av_pauta_piezas (cualquier autenticado).
drop policy if exists "av_pauta_videos_select" on public.av_pauta_videos;
create policy "av_pauta_videos_select" on public.av_pauta_videos
  for select to authenticated
  using (true);

-- Actualizar (status/nombre): mismo criterio que UPDATE de av_pauta_piezas — coordina,
-- gestión, jefa de la línea, recurso de la pauta o el editor del lote.
drop policy if exists "av_pauta_videos_update" on public.av_pauta_videos;
create policy "av_pauta_videos_update" on public.av_pauta_videos
  for update to authenticated
  using (
    exists (
      select 1 from public.av_pauta_piezas pz
      where pz.id = pieza_id
        and (
          user_can('audiovisual.coordina')
          or user_can('audiovisual.pautas.gestion')
          or user_leads_av_pauta(pz.pauta_id)
          or auth.uid()::text = pz.editor_user_id
          or exists (
            select 1 from public.av_pautas p
            where p.id = pz.pauta_id and auth.uid()::text = any(p.recurso_ids)
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.av_pauta_piezas pz
      where pz.id = pieza_id
        and (
          user_can('audiovisual.coordina')
          or user_can('audiovisual.pautas.gestion')
          or user_leads_av_pauta(pz.pauta_id)
          or auth.uid()::text = pz.editor_user_id
          or exists (
            select 1 from public.av_pautas p
            where p.id = pz.pauta_id and auth.uid()::text = any(p.recurso_ids)
          )
        )
    )
  );

-- Un UPDATE no puede mover un video a otro lote ni a otra empresa.
create or replace function public.av_pauta_videos_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pieza_id is distinct from old.pieza_id
     or new.company_id is distinct from old.company_id then
    raise exception 'Un video no puede cambiar de lote' using errcode = '42501';
  end if;
  -- `position` ordena los videos y decide cuáles borra la baja de `cantidad`: no se reordena.
  if new.position is distinct from old.position then
    raise exception 'Los videos no se pueden reordenar' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists av_pauta_videos_guard_trigger on public.av_pauta_videos;
create trigger av_pauta_videos_guard_trigger
before update on public.av_pauta_videos
for each row execute function public.av_pauta_videos_guard();

-- ── lote.listas = videos en 'listo' ───────────────────────────────────────────────────────
-- Solo escribe si el valor cambia, para no ensuciar `av_pieza_listas_log`. Al actualizar
-- `listas` corren los mismos triggers de siempre sobre el lote: `av_pauta_piezas_sync_lote`
-- (deriva el status del lote) y `av_pauta_piezas_log_listas` (historial).
create or replace function public.av_pauta_videos_sync_listas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pieza uuid := coalesce(new.pieza_id, old.pieza_id);
  v_listas int;
begin
  -- Anidado = lo disparó otro trigger (p. ej. `av_pauta_piezas_sync_videos` al crear o borrar
  -- videos del lote). Esas altas/bajas ya respetan `listas`; recalcular a mitad de camino
  -- escribiría valores intermedios en `av_pieza_listas_log`.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- Serializa a quienes mueven videos del mismo lote: sin este lock, dos transacciones
  -- concurrentes cuentan cada una solo su propio 'listo' y la segunda no escribe, dejando
  -- `listas` por debajo de los videos listos (y el score leyendo un número equivocado).
  -- El count va DESPUÉS del lock para ver lo que la otra ya confirmó (READ COMMITTED).
  perform 1 from public.av_pauta_piezas where id = v_pieza for update;

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

drop trigger if exists av_pauta_videos_sync_listas_trigger on public.av_pauta_videos;
create trigger av_pauta_videos_sync_listas_trigger
after insert or update of status or delete on public.av_pauta_videos
for each row execute function public.av_pauta_videos_sync_listas();

-- ── Un video por unidad del lote ──────────────────────────────────────────────────────────
-- Sube `cantidad` → crea los videos que faltan en 'pendiente' (al insertar un lote con
-- `listas` > 0 los primeros van en 'listo'). Baja `cantidad` → borra los 'pendiente' y
-- 'cancelado' del final; si para bajar hay que borrar videos en curso o listos, falla.
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
  if not new.es_lote then
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

drop trigger if exists av_pauta_piezas_sync_videos_trigger on public.av_pauta_piezas;
create trigger av_pauta_piezas_sync_videos_trigger
after insert or update of cantidad on public.av_pauta_piezas
for each row execute function public.av_pauta_piezas_sync_videos();

-- ── Backfill: un video por unidad de cada lote existente, sin tocar `listas` ──────────────
-- Los primeros `listas` van en 'listo' y el resto en 'pendiente', así el conteo coincide con
-- el lote. El trigger de sync se apaga durante la carga: de lo contrario cada alta
-- reescribiría `listas` y quedarían filas espurias en `av_pieza_listas_log`.
alter table public.av_pauta_videos disable trigger av_pauta_videos_sync_listas_trigger;

insert into public.av_pauta_videos (pieza_id, company_id, status, position)
select pz.id, pz.company_id,
       case when g <= pz.listas then 'listo' else 'pendiente' end,
       g - 1
from public.av_pauta_piezas pz
cross join lateral generate_series(1, pz.cantidad) as g
where pz.es_lote
  and not exists (select 1 from public.av_pauta_videos v where v.pieza_id = pz.id);

alter table public.av_pauta_videos enable trigger av_pauta_videos_sync_listas_trigger;

-- Realtime: el resto de las tablas de Pautas ya publican sus cambios.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'av_pauta_videos'
  ) then
    alter publication supabase_realtime add table public.av_pauta_videos;
  end if;
end $$;
