-- Tácticas por marca (F3): relevo entre tácticas, avisos de vencimiento y score al cierre.
-- Depende de 20261119100000_tacticas_objetivo_drive.sql (columna closed_at).
-- Aplicada a producción el 2026-11-19 (registrada como `tacticas_handoffs`), tras un ensayo con rollback.
--
-- 1) campaign_handoffs: "insumo para la siguiente táctica". Solo guarda el ESTADO (pendiente /
--    usado / descartado); su contenido (acciones hechas, pendientes, %) se lee en vivo del
--    checklist de la táctica de origen, así no queda desactualizado si se tilda algo después.
-- 2) Triggers: al pasar a Finalizado se fija closed_at y se crea el insumo. Cubre las tres vías de
--    cierre (cron diario, StatusPill y formulario) sin tocar enqueue_campaign_closures().
-- 3) Avisos 3 días antes y el día del vencimiento, en una función y un job APARTE: si fallan no
--    deben frenar los cierres (ya pasó con el cast uuid/text de 20260810000000).
-- 4) employee_score_inputs: las tácticas entran al score por su mes de cierre.
--
-- (Sin company_id ni IDs escritos a mano: Netlify trata los UUID como secretos y el escaneo
--  cancela el build.)

-- ── 1. Insumo para la siguiente táctica ──────────────────────────────────────
create table if not exists public.campaign_handoffs (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.metric_clients(id) on delete cascade,
  source_campaign_id      uuid not null unique references public.campaigns(id) on delete cascade,
  status                  text not null default 'pendiente'
                          check (status in ('pendiente', 'usado', 'descartado')),
  consumed_by_campaign_id uuid references public.campaigns(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.campaign_handoffs is
  'Insumo de una táctica cerrada para la siguiente de la marca. El contenido se deriva de campaigns.checklist.';

create index if not exists campaign_handoffs_client_status_idx
  on public.campaign_handoffs (client_id, status);

alter table public.campaign_handoffs enable row level security;

drop policy if exists campaign_handoffs_select on public.campaign_handoffs;
drop policy if exists campaign_handoffs_insert on public.campaign_handoffs;
drop policy if exists campaign_handoffs_update on public.campaign_handoffs;
drop policy if exists campaign_handoffs_delete on public.campaign_handoffs;

-- Lectura abierta, igual que `campaigns`; escribir exige la capability ads.manage.
create policy campaign_handoffs_select on public.campaign_handoffs
  for select to authenticated using (true);
create policy campaign_handoffs_insert on public.campaign_handoffs
  for insert to authenticated with check (public.user_can('ads.manage'));
create policy campaign_handoffs_update on public.campaign_handoffs
  for update to authenticated using (public.user_can('ads.manage'));
create policy campaign_handoffs_delete on public.campaign_handoffs
  for delete to authenticated using (public.user_can('ads.manage'));

-- ── 2. Triggers de cierre ────────────────────────────────────────────────────
-- BEFORE: fija closed_at al pasar a Finalizado y lo limpia si se reabre.
create or replace function public.campaigns_set_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Finalizado' then
    if tg_op = 'INSERT' then
      new.closed_at := coalesce(new.closed_at, now());
    elsif old.status is distinct from 'Finalizado' then
      new.closed_at := now();
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

-- AFTER: crea el insumo al cerrar; si se reabre, borra el insumo que siga pendiente.
create or replace function public.campaigns_handoff_on_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is null then
    return new;
  end if;

  if new.status = 'Finalizado'
     and (tg_op = 'INSERT' or old.status is distinct from 'Finalizado') then
    insert into public.campaign_handoffs (client_id, source_campaign_id)
    values (new.client_id, new.id)
    on conflict (source_campaign_id) do nothing;
  elsif tg_op = 'UPDATE'
        and old.status = 'Finalizado'
        and new.status is distinct from 'Finalizado' then
    delete from public.campaign_handoffs
     where source_campaign_id = new.id
       and status = 'pendiente';
  end if;

  return new;
end;
$$;

drop trigger if exists campaigns_closed_at_trg on public.campaigns;
create trigger campaigns_closed_at_trg
  before insert or update of status on public.campaigns
  for each row execute function public.campaigns_set_closed_at();

drop trigger if exists campaigns_handoff_trg on public.campaigns;
create trigger campaigns_handoff_trg
  after insert or update of status on public.campaigns
  for each row execute function public.campaigns_handoff_on_close();

-- ── 3. Avisos de vencimiento ─────────────────────────────────────────────────
-- Destinatarios: el responsable de la táctica + la jefa (is_lead) de la línea de su marca.
create or replace function public.notif_tactic_recipients(p_client_id uuid, p_assignee text)
returns table (user_id text)
language sql
security definer
stable
set search_path = public
as $$
  select distinct mlm.user_id
    from public.metric_clients mc
    join public.metric_line_members mlm
      on mlm.line_id = mc.line_id and mlm.is_lead = true
    join public.users u on u.user_id::text = mlm.user_id
   where mc.id = p_client_id
     and u.deleted_at is null
  union
  select p_assignee
   where p_assignee is not null and p_assignee <> '';
$$;

-- Avisa a las tácticas en marcha que vencen en 3 días o hoy. No avisa si la marca ya tiene cargada
-- otra táctica en marcha que termina después (el relevo ya está hecho).
create or replace function public.enqueue_tactic_expiry_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'America/Caracas')::date;
  v_rec       record;
  v_recipient record;
  v_days      int;
  v_title     text;
  v_body      text;
  v_dkey      text;
begin
  for v_rec in
    select c.id, c.name, c.client, c.client_id, c.assignee, c.end_date,
           coalesce(mc.company_id::text, u.company_id::text, '') as company_id
      from public.campaigns c
      left join public.metric_clients mc on mc.id = c.client_id
      left join public.users u
        on u.user_id::text = coalesce(nullif(c.assignee, ''), c.created_by::text)
     where c.status in ('Pendiente', 'En Curso')
       and c.end_date in (v_today, v_today + 3)
       and not exists (
         select 1
           from public.campaigns n
          where n.client_id = c.client_id
            and n.id <> c.id
            and n.status in ('Pendiente', 'En Curso')
            and n.end_date > c.end_date
       )
  loop
    -- Un error en una fila no debe cortar los avisos del resto.
    begin
      v_days := v_rec.end_date - v_today;
      if v_days = 0 then
        v_title := '⚠️ Una táctica vence hoy';
        v_body  := 'La táctica "' || v_rec.name || '" de ' || coalesce(v_rec.client, 'la marca')
                   || ' vence hoy. Prepara la táctica del próximo período.';
      else
        v_title := '⏳ Una táctica vence en 3 días';
        v_body  := 'La táctica "' || v_rec.name || '" de ' || coalesce(v_rec.client, 'la marca')
                   || ' vence el ' || to_char(v_rec.end_date, 'DD/MM/YYYY')
                   || '. Ve preparando la táctica del próximo período.';
      end if;

      for v_recipient in
        select r.user_id from public.notif_tactic_recipients(v_rec.client_id, v_rec.assignee) r
      loop
        -- end_date en la clave: si se mueve la fecha de fin, se vuelve a avisar.
        v_dkey := 'campaign_due_soon:' || v_rec.id::text || ':' || v_rec.end_date::text
                  || ':' || v_days::text || ':' || v_recipient.user_id;
        insert into public.notifications
          (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
        values
          (v_rec.company_id, v_recipient.user_id, 'campaign_due_soon',
           v_title, v_body, 'campaign', v_rec.id::text, false, false, v_dkey)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    exception when others then
      raise warning 'enqueue_tactic_expiry_reminders: la táctica % falló: %', v_rec.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- Diario a las 07:05 Caracas (11:05 UTC), justo después del cierre automático. Idempotente.
select cron.schedule(
  'enqueue-tactic-expiry-reminders',
  '5 11 * * *',
  $$select public.enqueue_tactic_expiry_reminders()$$
)
where not exists (
  select 1 from cron.job where jobname = 'enqueue-tactic-expiry-reminders'
);

-- ── 4. Score: las tácticas cuentan en su mes de cierre ───────────────────────
-- Copia de employee_score_inputs de 20261103120000 con UN solo cambio: el bloque 'campaigns'.
create or replace function public.employee_score_inputs(p_year int, p_month int)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $function$
declare
  v_caller        uuid := auth.uid();
  v_company_uuid  uuid;
  v_company_text  text;
  v_access_level  int;
  v_can_view_all  boolean;
  v_month_start   date := make_date(p_year, p_month, 1);
  v_month_end     date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_prev_start    date := (make_date(p_year, p_month, 1) - interval '1 month')::date;
  v_next_end      date := (make_date(p_year, p_month, 1) + interval '2 month - 1 day')::date;
  v_visible_ids   text[];
begin
  select company_id, coalesce(access_level, 1)
  into v_company_uuid, v_access_level
  from public.users
  where user_id = v_caller;

  if v_company_uuid is null then
    raise exception 'employee_score_inputs: usuario sin perfil de empresa';
  end if;

  v_company_text := v_company_uuid::text;
  v_can_view_all := public.task_user_view_all() or public.user_can('evaluaciones.ver_todo');

  if v_can_view_all then
    select array_agg(user_id::text)
    into v_visible_ids
    from public.users
    where company_id = v_company_uuid and deleted_at is null;
  else
    select array_agg(distinct u.user_id::text)
    into v_visible_ids
    from public.users u
    where u.company_id = v_company_uuid
      and u.deleted_at is null
      and (
        u.user_id = v_caller
        or (
          v_access_level >= 2
          and exists (
            select 1 from public.metric_line_members mlm
            where mlm.user_id = u.user_id::text
              and public.task_user_in_line(mlm.line_id::text)
          )
        )
      );
  end if;

  v_visible_ids := coalesce(v_visible_ids, array[v_caller::text]);

  return jsonb_build_object(
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'first_name', u.first_name, 'last_name', u.last_name,
        'avatar_url', u.avatar_url, 'access_level', u.access_level,
        'department_id', u.department_id, 'position_id', u.position_id,
        'hire_date', u.hire_date, 'on_probation', u.on_probation
      )), '[]'::jsonb)
      from public.users u
      where u.user_id::text = any(v_visible_ids)
    ),
    'clients', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.metric_clients c
      where c.company_id = v_company_text and c.deleted_at is null
    ),
    'tasks', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.tasks t
      where t.company_id = v_company_text
        and t.assignee_ids && v_visible_ids
        and (
          t.request_date between v_prev_start and v_next_end
          -- Tareas largas pedidas hace meses que VENCEN en este mes: el indicador
          -- `tareas` las evalúa por due_date, así que tienen que llegar al cálculo.
          or t.due_date between v_month_start and v_month_end
        )
    ),
    'cnp', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.cnp_requests c
      where c.company_id = v_company_text
        and c.assignee_id = any(v_visible_ids)
        and (
          c.created_at::date between v_prev_start and v_next_end
          or c.due_date between v_month_start and v_month_end
        )
    ),
    'marks', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.fixed_task_marks m
      where m.company_id = v_company_text
        and m.period_year = p_year and m.period_month = p_month
    ),
    'piezas', (
      -- `listas_a_fecha_entrega`: cuántas unidades del lote estaban listas al terminar su
      -- fecha de entrega (null si no hay fecha o no hay historia anterior a esa fecha).
      select coalesce(jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'listas_a_fecha_entrega', public.av_pieza_listas_a_fecha(p.id, p.fecha_entrega)
        )
      ), '[]'::jsonb)
      from public.av_pauta_piezas p
      where p.company_id = v_company_text
        and p.editor_user_id = any(v_visible_ids)
        and (
          p.created_at::date between v_prev_start and v_next_end
          or p.fecha_entrega between v_month_start and v_month_end
        )
    ),
    'pautas', (
      -- Pautas audiovisuales donde alguien visible fue como recurso (`recurso_ids` es la lista
      -- autoritativa de quién sale a grabar), del mes por su fecha O con algún lote de edición
      -- cuya fecha de entrega cae en el mes. `entrega_por_formato`: por formato, fecha de
      -- entrega y unidades listas a esa fecha (ver av_pauta_entrega_por_formato).
      select coalesce(jsonb_agg(
        to_jsonb(ap) || jsonb_build_object(
          'entrega_por_formato', public.av_pauta_entrega_por_formato(ap.id)
        )
      ), '[]'::jsonb)
      from public.av_pautas ap
      where ap.company_id = v_company_text
        and ap.deleted_at is null
        and ap.recurso_ids && v_visible_ids
        and (
          ap.pauta_date between v_month_start and v_month_end
          or exists (
            select 1 from public.av_pauta_piezas pz
            where pz.pauta_id = ap.id
              and pz.fecha_entrega between v_month_start and v_month_end
          )
        )
    ),
    'meetings', (
      select coalesce(jsonb_agg(to_jsonb(mt)), '[]'::jsonb)
      from public.meetings mt
      where mt.company_id = v_company_text
        and mt.attendee_ids && v_visible_ids
        and mt.starts_at::date between v_prev_start and v_next_end
    ),
    'campaigns', (
      -- `campaigns` no tiene company_id (a diferencia de paid_campaigns) — el scope de
      -- empresa ya lo da v_visible_ids, acotado arriba a los usuarios de v_company_uuid.
      -- Una táctica cuenta en el mes en que CIERRA (no en el que se creó): solo las Finalizadas,
      -- fechadas por el menor entre su cierre real (Caracas) y su fecha de fin. El menor evita
      -- que el cierre automático (que corre el día siguiente) la pase al mes siguiente.
      select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
      from public.campaigns cp
      where cp.assignee = any(v_visible_ids)
        and cp.status = 'Finalizado'
        and least(
              coalesce((cp.closed_at at time zone 'America/Caracas')::date, cp.end_date),
              cp.end_date
            ) between v_prev_start and v_next_end
    ),
    'paidCampaigns', (
      select coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb)
      from public.paid_campaigns pc
      where pc.company_id = v_company_text
        and pc.responsable_id = any(v_visible_ids)
        and coalesce(pc.updated_at, pc.created_at)::date between v_prev_start and v_next_end
    ),
    'checks', (
      -- Casillas del Chequeo del MES de las cuentas que llevan los empleados visibles
      -- (no las que ellos editaron): `plataformas` mide cobertura sobre lo que les tocaba,
      -- así que también hacen falta las casillas que otro llenó o que quedaron vacías.
      select coalesce(jsonb_agg(to_jsonb(ch)), '[]'::jsonb)
      from public.publication_checks ch
      where ch.company_id = v_company_text
        and ch.period_year = p_year
        and ch.period_month = p_month
        and ch.client_id in (
          select mc.id
          from public.metric_clients mc
          where mc.company_id = v_company_text
            and mc.deleted_at is null
            and mc.social_manager_id = any(v_visible_ids)
        )
    ),
    'tickets', (
      select coalesce(jsonb_agg(to_jsonb(tk)), '[]'::jsonb)
      from public.support_tickets tk
      where tk.company_id = v_company_uuid
        and tk.assigned_to::text = any(v_visible_ids)
        and tk.created_at::date between v_prev_start and v_next_end
    ),
    'vacations', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
      from public.vacations v
      where v.company_id = v_company_uuid
        and v.user_id::text = any(v_visible_ids)
        and v.end_date >= v_month_start
        and v.start_date <= v_month_end
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from public.employee_score_profiles p
      where p.company_id = v_company_text
    )
  );
end;
$function$;

revoke execute on function public.employee_score_inputs(int, int) from public;
revoke execute on function public.employee_score_inputs(int, int) from anon;
grant execute on function public.employee_score_inputs(int, int) to authenticated;
