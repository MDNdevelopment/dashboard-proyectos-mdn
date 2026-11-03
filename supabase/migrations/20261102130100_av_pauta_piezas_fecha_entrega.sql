-- Fecha de entrega de las piezas de edición (lotes de `av_pauta_piezas`).
--
-- Hasta ahora no había plazo: Pautas marcaba una pieza "atrasada" a los 7 días fijos
-- (PIEZAS_ATRASO_DIAS, src/utils/audiovisual.js) y el score no podía medir si se entregó a
-- tiempo. Con `fecha_entrega` por lote, la evaluación cuenta cada pieza en el MES de su fecha
-- y mira cuántas estaban listas a esa fecha (ver `av_pieza_listas_log`, migración anterior).
--
--   fecha_entrega            null = lote anterior a esta regla (se sigue midiendo como antes).
--   fecha_entrega_confirmada false = fecha supuesta por defecto; true = alguien con autoridad la
--                            fijó o la revisó (alimenta el aviso para jefas en Pautas).
alter table public.av_pauta_piezas
  add column if not exists fecha_entrega date,
  add column if not exists fecha_entrega_confirmada boolean not null default false;

-- Días del default: mismo valor que PIEZAS_ATRASO_DIAS (src/utils/audiovisual.js).
create or replace function public.av_pieza_fecha_entrega_default(p_pauta_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select p.pauta_date + 7
  from public.av_pautas p
  where p.id = p_pauta_id and p.status = 'realizada' and p.pauta_date is not null;
$$;

-- Quien puede fijar/mover fechas: coordinación, gestión de pautas o la jefa de la línea.
-- `auth.uid() is null` = contexto sin usuario (service role, SQL editor): la RLS ya protege
-- los caminos de usuario, esto solo evita bloquear tareas de mantenimiento.
create or replace function public.av_pieza_puede_fijar_fecha(p_pauta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
    or public.user_can('audiovisual.coordina')
    or public.user_can('audiovisual.pautas.gestion')
    or public.user_leads_av_pauta(p_pauta_id);
$$;

-- ── Guardia: solo quien corresponde fija la fecha, y una vencida no se mueve ─────────────
-- La policy de UPDATE deja que el propio editor (y los recursos) modifiquen cualquier columna
-- de sus lotes; sin esta guardia podría moverse su propia fecha de entrega.
create or replace function public.av_pauta_piezas_guard_fecha_entrega()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_default date;
  v_hoy date := (now() at time zone 'America/Caracas')::date;
begin
  v_default := public.av_pieza_fecha_entrega_default(new.pauta_id);

  if tg_op = 'INSERT' then
    -- Un lote nuevo solo trae fecha propia si quien lo crea puede fijarla; si no, el default.
    if not public.av_pieza_puede_fijar_fecha(new.pauta_id) then
      new.fecha_entrega := null;
      new.fecha_entrega_confirmada := false;
    end if;
    if new.fecha_entrega is null and v_default is not null then
      new.fecha_entrega := v_default;
      new.fecha_entrega_confirmada := false;
    elsif new.fecha_entrega is not null and not new.fecha_entrega_confirmada
          and new.fecha_entrega is distinct from v_default then
      new.fecha_entrega_confirmada := true;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.fecha_entrega is not distinct from old.fecha_entrega
     and new.fecha_entrega_confirmada is not distinct from old.fecha_entrega_confirmada then
    return new;
  end if;

  -- Asignación del default (null → pauta_date + 7) sin confirmar: la hace el sistema al marcar
  -- la pauta realizada, también cuando quien la marca es un recurso sin permiso de fechas.
  if old.fecha_entrega is null and not new.fecha_entrega_confirmada
     and new.fecha_entrega is not distinct from v_default then
    return new;
  end if;

  if not public.av_pieza_puede_fijar_fecha(new.pauta_id) then
    raise exception 'No tienes permiso para cambiar la fecha de entrega de las piezas'
      using errcode = '42501';
  end if;

  if old.fecha_entrega is not null and old.fecha_entrega < v_hoy
     and new.fecha_entrega is distinct from old.fecha_entrega
     and auth.uid() is not null then
    raise exception 'La fecha de entrega ya venció y no se puede mover'
      using errcode = '22023';
  end if;

  -- Confirmar (o cambiar) la fecha la deja confirmada.
  new.fecha_entrega_confirmada := true;
  return new;
end;
$$;

create trigger av_pauta_piezas_guard_fecha_entrega_trigger
before insert or update on public.av_pauta_piezas
for each row execute function public.av_pauta_piezas_guard_fecha_entrega();

-- ── Al marcar la pauta `realizada`, sus lotes sin fecha reciben la de por defecto ────────
create or replace function public.av_pautas_default_fecha_entrega()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'realizada' and old.status is distinct from 'realizada'
     and new.pauta_date is not null then
    update public.av_pauta_piezas
    set fecha_entrega = new.pauta_date + 7,
        fecha_entrega_confirmada = false
    where pauta_id = new.id and fecha_entrega is null;
  end if;
  return null;
end;
$$;

create trigger av_pautas_default_fecha_entrega_trigger
after update of status on public.av_pautas
for each row execute function public.av_pautas_default_fecha_entrega();

create index if not exists av_pauta_piezas_fecha_entrega_idx
  on public.av_pauta_piezas (fecha_entrega)
  where fecha_entrega is not null;
