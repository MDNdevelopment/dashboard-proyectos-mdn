-- Piezas en lote para Fotos: una pauta con 50 fotos ya no genera 50 filas en el checklist.
--
-- Hasta ahora cada unidad "salida" (video, reel o foto) era una fila de av_pauta_piezas con
-- su propio nombre/estado. Tiene sentido para video/reel: son pocos y cada uno tiene una
-- finalidad propia que vale la pena nombrar y seguir. Para fotos no: repartir 50 fotos
-- insertaba 50 filas, disparaba 50 eventos de realtime y el checklist quedaba ilegible.
--
-- Desde ahora una fila puede ser un LOTE (es_lote = true): en vez de una sola unidad
-- representa `cantidad` unidades con `listas` de ellas terminadas. El resto del sistema
-- (status, pills, contadores) sigue funcionando sin saber que existe el lote porque un
-- trigger mantiene status y listas sincronizados en ambos sentidos:
--   - fila normal (es_lote = false): cantidad = 1, listas = 1 si status = 'listo' si no 0.
--   - fila lote (es_lote = true): listas es el dato editable (steppers "asignadas"/"listas"
--     en la UI); status se deriva de listas/cantidad para que status siga siendo una lectura
--     válida en cualquier fila.
-- Las fotos SIEMPRE se reparten como lote (ver createLotePieza en avPautasApi.js); video y
-- reel siguen creando una fila por unidad como hasta ahora.
alter table public.av_pauta_piezas
  add column if not exists es_lote boolean not null default false,
  add column if not exists cantidad int not null default 1,
  add column if not exists listas int not null default 0;

alter table public.av_pauta_piezas
  add constraint av_pauta_piezas_cantidad_check check (cantidad >= 1);

alter table public.av_pauta_piezas
  add constraint av_pauta_piezas_listas_check check (listas >= 0 and listas <= cantidad);

-- ── Trigger: mantiene status/cantidad/listas consistentes según es_lote ─────────────────
create or replace function public.av_pauta_piezas_sync_lote()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.es_lote then
    if new.listas <= 0 then
      new.status := 'pendiente';
    elsif new.listas >= new.cantidad then
      new.status := 'listo';
    else
      new.status := 'en_edicion';
    end if;
  else
    new.cantidad := 1;
    new.listas := case when new.status = 'listo' then 1 else 0 end;
  end if;
  return new;
end;
$$;

create trigger av_pauta_piezas_sync_lote_trigger
before insert or update on public.av_pauta_piezas
for each row execute function public.av_pauta_piezas_sync_lote();

-- ── Contadores derivados: pasan de contar filas 'listo' a sumar unidades (`listas`) ─────
-- Mismas dos funciones que 20260910000000_av_pauta_piezas_formato_link.sql, reemplazando
-- `count(*) where status = 'listo'` por `sum(listas)` para que un lote de 50 fotos con 32
-- listas aporte 32, no 1.
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
            -- listas ya es 0 en cualquier fila 'cancelado' (trigger av_pauta_piezas_sync_lote),
            -- así que sumar sin filtrar por status da el mismo resultado sin duplicar la regla.
            select coalesce(sum(p.listas), 0)::int
            from public.av_pauta_piezas p
            where p.pauta_id = new.id and p.formato = e.key
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
    select coalesce(sum(listas), 0) from public.av_pauta_piezas
    where pauta_id = target_pauta_id
  )
  where id = target_pauta_id
    and piezas_por_formato = '{}'::jsonb;

  return null;
end;
$$;

-- ── Backfill: colapsa las filas de Foto existentes en un lote por (pauta, editor) ───────
-- Agrupa por pauta_id + editor_user_id las filas con formato = 'F', crea una fila lote con
-- el total y cuántas ya estaban 'listo', y borra el resto del grupo. Deja intactas las
-- filas de video/reel y las fotos sin formato asignado (no hay base para agruparlas).
-- Una CTE solo vive dentro de la sentencia que la declara, y este backfill necesita el
-- mismo agrupamiento en dos pasos (update de la fila que se conserva + delete del resto):
-- se materializa una vez en una tabla temporal.
create temporary table av_pauta_piezas_foto_grupos on commit drop as
  select
    pauta_id,
    editor_user_id,
    min(position) as position,
    -- id es uuid (sin operador min/max): la fila que se conserva es la primera por
    -- position, con el id como desempate estable.
    (array_agg(id order by position, id))[1] as keep_id,
    count(*) as cantidad,
    count(*) filter (where status = 'listo') as listas
  from public.av_pauta_piezas
  where formato = 'F'
  group by pauta_id, editor_user_id
  having count(*) > 1;

update public.av_pauta_piezas p
set es_lote = true,
    nombre = 'Fotos',
    cantidad = g.cantidad,
    listas = g.listas,
    position = g.position
from av_pauta_piezas_foto_grupos g
where p.id = g.keep_id;

delete from public.av_pauta_piezas p
using av_pauta_piezas_foto_grupos g
where p.formato = 'F'
  and p.pauta_id = g.pauta_id
  and p.editor_user_id is not distinct from g.editor_user_id
  and p.id <> g.keep_id;

-- Fotos sueltas (una sola fila de formato 'F' por pauta/editor) también pasan a lote, para
-- que la UI no tenga que distinguir "lote de 1" de "pieza normal de formato F".
update public.av_pauta_piezas
set es_lote = true,
    nombre = 'Fotos',
    cantidad = 1,
    listas = case when status = 'listo' then 1 else 0 end
where formato = 'F' and es_lote = false;
