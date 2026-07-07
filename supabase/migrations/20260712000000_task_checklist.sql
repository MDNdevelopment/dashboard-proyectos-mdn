-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: task checklist (JSONB) — checklist estilo Trello dentro de tareas
--
-- Cada ítem del checklist: { id, title, assignee_id, due_date, done }
-- El estado de la tarea es SIEMPRE manual — el checklist no lo modifica.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columna
alter table public.tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Recortar due_date de ítems al rango [request_date, due_date] de la tarea.
--    Se ejecuta ANTES de la derivación de estado (nombre 'trg_a_clamp...' para
--    garantizar que dispare primero alfabéticamente entre los BEFORE triggers).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clamp_checklist_item_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   jsonb;
  v_due    date;
  v_result jsonb := '[]'::jsonb;
begin
  for v_item in
    select * from jsonb_array_elements(coalesce(new.checklist, '[]'))
  loop
    if (v_item->>'due_date') is not null and (v_item->>'due_date') <> '' then
      v_due := (v_item->>'due_date')::date;
      if new.request_date is not null and v_due < new.request_date then
        v_due := new.request_date;
      end if;
      if new.due_date is not null and v_due > new.due_date then
        v_due := new.due_date;
      end if;
      v_item := v_item || jsonb_build_object('due_date', to_char(v_due, 'YYYY-MM-DD'));
    end if;
    v_result := v_result || jsonb_build_array(v_item);
  end loop;

  new.checklist := v_result;
  return new;
end;
$$;

-- Nombre prefijado con 'trg_a_' para disparar ANTES que 'trg_b_derive_...'
-- (PostgreSQL ordena BEFORE triggers alfabéticamente por nombre)
create or replace trigger trg_a_clamp_checklist_item_dates
  before insert or update of checklist, request_date, due_date
  on public.tasks
  for each row
  execute function public.clamp_checklist_item_dates();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. (Eliminado) Derivación de estado desde el checklist.
--    El estado de la tarea es 100% manual — indiferente del checklist.
--    Drops idempotentes para re-aplicar sobre una migración anterior.
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_b_derive_task_status_from_checklist on public.tasks;
drop function if exists public.derive_task_status_from_checklist();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Notificar al encargado de un ítem cuando se le asigna.
--    Reutiliza el patrón de notify_task_assignees (diff por assignee_id del ítem).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_checklist_assignees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item         jsonb;
  v_id           text;
  v_title        text;
  v_old_assignee text;
begin
  for v_item in
    select * from jsonb_array_elements(coalesce(new.checklist, '[]'))
  loop
    v_id    := v_item->>'assignee_id';
    v_title := coalesce(nullif(v_item->>'title', ''), 'Ítem sin título');

    -- Sin encargado → saltar
    if v_id is null or v_id = '' then
      continue;
    end if;

    -- Encontrar encargado anterior del mismo ítem (por id)
    v_old_assignee := null;
    if tg_op = 'UPDATE' then
      select o->>'assignee_id'
        into v_old_assignee
        from jsonb_array_elements(coalesce(old.checklist, '[]')) o
       where o->>'id' = v_item->>'id'
       limit 1;
    end if;

    -- Notificar solo si el encargado es nuevo o cambió
    if v_old_assignee is distinct from v_id then
      -- No notificar al creador de la tarea (igual que notify_task_assignees)
      if v_id = coalesce(new.created_by, '') then
        continue;
      end if;

      insert into public.notifications (
        company_id, user_id, type, title, body,
        entity_type, entity_id, email, read
      ) values (
        new.company_id,
        v_id,
        'checklist_item_assigned',
        'Te asignaron un ítem del checklist',
        v_title || ' — ' || coalesce(new.description, 'Tarea sin descripción'),
        'task',
        new.id::text,
        true,
        false
      );
    end if;
  end loop;

  return new;
end;
$$;

create or replace trigger trg_notify_checklist_assignees
  after insert or update of checklist on public.tasks
  for each row
  execute function public.notify_checklist_assignees();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS: el encargado de un ítem del checklist puede ver la tarea.
--    Política permisiva — Postgres combina con OR con las existentes.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists tasks_select_checklist_assignee on public.tasks;
create policy tasks_select_checklist_assignee on public.tasks
  for select
  using (
    exists (
      select 1
        from jsonb_array_elements(checklist) e
       where e->>'assignee_id' = auth.uid()::text
    )
  );
