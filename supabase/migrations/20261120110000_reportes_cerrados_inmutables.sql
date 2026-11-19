-- Reportes cerrados inmutables, con desbloqueo solo para admin.
-- NO aplicar a producción sin confirmación del desarrollador.
--
-- Hasta ahora un reporte cerrado (closed_at no nulo) solo estaba protegido contra UPDATE
-- (20260715185715), y ese trigger no dejaba pasar a nadie: ni siquiera existía forma de reabrirlo.
-- Esta migración cierra los demás caminos y agrega un desbloqueo controlado:
--
--  1. UPDATE: un reporte cerrado solo puede cambiar por la RPC `unlock_metric_report` (admin +
--     motivo), y esa RPC solo voltea las columnas de cierre: nunca toca `data`.
--  2. DELETE (incluido el cascade al borrar una línea), INSERT de un reporte ya cerrado hecho por
--     un usuario de la app y TRUNCATE quedan bloqueados.
--  3. Cada desbloqueo deja un registro append-only con una copia de los datos.
--  4. `reopened_at/by` marcan un reporte desbloqueado: la app lo sigue tratando como congelado (no
--     recalcula ni autoguarda con datos de hoy) hasta que se vuelva a cerrar.
--  5. `move_client_line_reports` avisa con un mensaje claro si el mes está cerrado.
--
-- Migraciones de datos futuras que hagan UPDATE/DELETE masivo sobre metric_reports deben excluir
-- los cerrados (`where closed_at is null`); si no, abortan completas.

-- ── 1. Columnas del estado «desbloqueado» ───────────────────────────────────
alter table public.metric_reports
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by text;

comment on column public.metric_reports.reopened_at is
  'Cuándo un admin desbloqueó el reporte. Solo viene lleno mientras esté desbloqueado; al cerrarlo de nuevo se limpia.';

-- ── 2. Auditoría de desbloqueos (append-only) ───────────────────────────────
-- Sin FK al reporte: el registro debe sobrevivir aunque el reporte desaparezca algún día.
create table if not exists public.metric_report_unlocks (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null,
  company_id       text not null,
  line_id          uuid not null,
  year             int  not null,
  month            int  not null,
  unlocked_by      text not null,
  reason           text not null,
  prev_closed_at   timestamptz,
  prev_closed_by   text,
  prev_closed_auto boolean,
  data_snapshot    jsonb not null,
  created_at       timestamptz not null default now()
);

alter table public.metric_report_unlocks enable row level security;

drop policy if exists metric_report_unlocks_select on public.metric_report_unlocks;
create policy metric_report_unlocks_select on public.metric_report_unlocks
  for select to authenticated
  using (
    public.is_company_admin()
    and company_id = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

-- Solo lectura para admins; escribe únicamente la RPC (security definer).
revoke all on public.metric_report_unlocks from anon, authenticated;
grant select on public.metric_report_unlocks to authenticated;

create or replace function public.metric_report_unlocks_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'metric_report_unlocks: el registro de desbloqueos es de solo inserción';
end;
$$;

drop trigger if exists metric_report_unlocks_no_update on public.metric_report_unlocks;
create trigger metric_report_unlocks_no_update
  before update or delete on public.metric_report_unlocks
  for each row execute function public.metric_report_unlocks_immutable();

drop trigger if exists metric_report_unlocks_no_truncate on public.metric_report_unlocks;
create trigger metric_report_unlocks_no_truncate
  before truncate on public.metric_report_unlocks
  for each statement execute function public.metric_report_unlocks_immutable();

-- ── 3. UPDATE: un cerrado solo cambia por el desbloqueo de admin ─────────────
-- El trigger metric_reports_prevent_closed_edit (BEFORE UPDATE) ya existe: se reemplaza su función.
create or replace function public.prevent_closed_report_edit()
returns trigger language plpgsql as $$
begin
  if OLD.closed_at is null then
    -- Al cerrar (null → valor) el reporte deja de estar «desbloqueado».
    if NEW.closed_at is not null then
      NEW.reopened_at := null;
      NEW.reopened_by := null;
    end if;
    return NEW;
  end if;

  -- Reporte cerrado: lo único permitido es el desbloqueo hecho por la RPC de admin. Se exigen las
  -- cuatro condiciones a la vez: la marca de transacción que solo pone la RPC, que quien llama sea
  -- admin, que solo se voltee closed_at y que `data` y la identidad del reporte no cambien.
  if current_setting('app.report_unlock', true) = 'on'
     and public.is_company_admin()
     and NEW.closed_at is null
     and NEW.data is not distinct from OLD.data
     and NEW.line_id = OLD.line_id
     and NEW.year = OLD.year
     and NEW.month = OLD.month
     and NEW.company_id is not distinct from OLD.company_id
  then
    return NEW;
  end if;

  raise exception 'metric_reports: el reporte % (línea %, %/%) está cerrado y no se puede modificar; un administrador puede desbloquearlo',
    OLD.id, OLD.line_id, OLD.month, OLD.year;
end;
$$;

-- ── 4. DELETE (también el cascade al borrar una línea) ──────────────────────
create or replace function public.prevent_closed_report_delete()
returns trigger language plpgsql as $$
begin
  if OLD.closed_at is not null then
    raise exception 'metric_reports: el reporte % (línea %, %/%) está cerrado y no se puede eliminar',
      OLD.id, OLD.line_id, OLD.month, OLD.year;
  end if;
  return OLD;
end;
$$;

drop trigger if exists metric_reports_prevent_closed_delete on public.metric_reports;
create trigger metric_reports_prevent_closed_delete
  before delete on public.metric_reports
  for each row execute function public.prevent_closed_report_delete();

-- ── 5. INSERT de un reporte ya cerrado ──────────────────────────────────────
-- Un usuario de la app (auth.uid() no nulo) no puede crear un reporte directamente cerrado ni
-- inventar closed_by. Cron, servicio y mantenimiento (auth.uid() nulo) sí, para que no se rompa la
-- función de autocierre si algún día se reactiva.
create or replace function public.prevent_closed_report_insert()
returns trigger language plpgsql as $$
begin
  if NEW.closed_at is not null and auth.uid() is not null then
    raise exception 'metric_reports: no se puede crear un reporte ya cerrado; guárdalo abierto y ciérralo después';
  end if;
  return NEW;
end;
$$;

drop trigger if exists metric_reports_prevent_closed_insert on public.metric_reports;
create trigger metric_reports_prevent_closed_insert
  before insert on public.metric_reports
  for each row execute function public.prevent_closed_report_insert();

-- ── 6. TRUNCATE ─────────────────────────────────────────────────────────────
create or replace function public.prevent_report_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'metric_reports: no se permite vaciar la tabla de reportes';
end;
$$;

drop trigger if exists metric_reports_prevent_truncate on public.metric_reports;
create trigger metric_reports_prevent_truncate
  before truncate on public.metric_reports
  for each statement execute function public.prevent_report_truncate();

revoke truncate on public.metric_reports from anon, authenticated, service_role;

-- ── 7. Desbloqueo (solo admin) ──────────────────────────────────────────────
-- Requiere admin (`users.admin`, helper is_company_admin) de la MISMA empresa que el reporte, y un
-- motivo. Deja el registro de auditoría con una copia de los datos y reabre el reporte SIN tocar
-- `data`. La marca `app.report_unlock` es local a la transacción: solo vale dentro de esta función.
create or replace function public.unlock_metric_report(
  p_line_id uuid,
  p_year    int,
  p_month   int,
  p_reason  text
)
returns public.metric_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company text;
  v_row     public.metric_reports;
  v_reason  text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_company_admin() then
    raise exception 'Solo un administrador puede desbloquear un reporte cerrado';
  end if;

  if char_length(v_reason) < 10 then
    raise exception 'Indica el motivo del desbloqueo (mínimo 10 caracteres)';
  end if;

  select u.company_id::text into v_company from public.users u where u.user_id = auth.uid();

  select * into v_row
    from public.metric_reports
   where line_id = p_line_id and year = p_year and month = p_month
     for update;

  if not found then
    raise exception 'El reporte no existe';
  end if;
  -- Mismo mensaje que para un no-admin: no se revela si un reporte ajeno existe.
  if v_row.company_id is distinct from v_company then
    raise exception 'Solo un administrador puede desbloquear un reporte cerrado';
  end if;
  if v_row.closed_at is null then
    raise exception 'El reporte no está cerrado';
  end if;

  insert into public.metric_report_unlocks
    (report_id, company_id, line_id, year, month, unlocked_by, reason,
     prev_closed_at, prev_closed_by, prev_closed_auto, data_snapshot)
  values
    (v_row.id, v_row.company_id, v_row.line_id, v_row.year, v_row.month, auth.uid()::text, v_reason,
     v_row.closed_at, v_row.closed_by, v_row.closed_auto, v_row.data);

  perform set_config('app.report_unlock', 'on', true);

  update public.metric_reports
     set closed_at   = null,
         closed_by   = null,
         closed_auto = false,
         reopened_at = now(),
         reopened_by = auth.uid()::text,
         updated_at  = now()
   where id = v_row.id
  returning * into v_row;

  perform set_config('app.report_unlock', 'off', true);

  return v_row;
end;
$$;

revoke execute on function public.unlock_metric_report(uuid, int, int, text) from public, anon;
grant execute on function public.unlock_metric_report(uuid, int, int, text) to authenticated;

-- ── 8. Mover cuenta de línea: mensaje claro si el mes está cerrado ──────────
-- Misma función de 20260926000000 con un chequeo previo; sigue siendo atómica.
create or replace function public.move_client_line_reports(
  p_company_id   uuid,
  p_from_line_id uuid,
  p_to_line_id   uuid,
  p_year         int,
  p_month        int,
  p_from_data    jsonb,
  p_to_data      jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerrada text;
begin
  if not (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = p_to_line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  ) then
    raise exception 'No tienes permiso para mover cuentas a esta línea';
  end if;

  -- Un reporte cerrado no se puede reescribir: se avisa antes de intentar nada.
  select l.name into v_cerrada
    from public.metric_reports r
    join public.metric_lines l on l.id = r.line_id
   where r.year = p_year
     and r.month = p_month
     and r.closed_at is not null
     and (r.line_id = p_to_line_id or r.line_id = p_from_line_id)
   order by (r.line_id = p_to_line_id) desc
   limit 1;

  if v_cerrada is not null then
    raise exception 'El reporte de «%» de %/% está cerrado: un administrador debe desbloquearlo antes de mover la cuenta con esa fecha',
      v_cerrada, p_month, p_year;
  end if;

  if p_from_line_id is not null then
    insert into public.metric_reports (company_id, line_id, year, month, data, updated_at)
    values (p_company_id, p_from_line_id, p_year, p_month, p_from_data, now())
    on conflict (line_id, year, month)
    do update set data = excluded.data, updated_at = excluded.updated_at, company_id = excluded.company_id;
  end if;

  insert into public.metric_reports (company_id, line_id, year, month, data, updated_at)
  values (p_company_id, p_to_line_id, p_year, p_month, p_to_data, now())
  on conflict (line_id, year, month)
  do update set data = excluded.data, updated_at = excluded.updated_at, company_id = excluded.company_id;
end;
$$;

grant execute on function public.move_client_line_reports(uuid, uuid, uuid, int, int, jsonb, jsonb) to authenticated;
