-- Evaluación automática de desempeño: ítems básicos por cargo (ver docs/arquitectura/evaluaciones.md).
--
-- 1. employee_score_inputs: devuelve además `pautas` (av_pautas del mes) y amplía la
--    ventana de tareas/CNP a las que VENCEN en el mes (aunque se hayan pedido antes).
-- 2. employee_score_profiles: pesos nuevos sobre los indicadores simples (tareas, cnp,
--    grilla, calendario, metricas, artes, pautas, piezas_grabadas, fotos, edicion). Los
--    indicadores viejos quedan en 0 pero siguen en el catálogo (los snapshots ya
--    congelados los usan y un admin puede volver a sumarlos desde Perfiles de Desempeño).
--    Los perfiles por cargo (position_ids) ganan a los de departamento.
-- NO aplicar a producción sin confirmación del desarrollador.

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
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from public.av_pauta_piezas p
      where p.company_id = v_company_text
        and p.editor_user_id = any(v_visible_ids)
        and p.created_at::date between v_prev_start and v_next_end
    ),
    'pautas', (
      -- Pautas audiovisuales del mes donde alguien visible fue como recurso
      -- (`recurso_ids` es la lista autoritativa de quién sale a grabar).
      select coalesce(jsonb_agg(to_jsonb(ap)), '[]'::jsonb)
      from public.av_pautas ap
      where ap.company_id = v_company_text
        and ap.deleted_at is null
        and ap.recurso_ids && v_visible_ids
        and ap.pauta_date between v_month_start and v_month_end
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
      select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
      from public.campaigns cp
      where cp.assignee = any(v_visible_ids)
        and cp.created_at::date between v_prev_start and v_next_end
    ),
    'paidCampaigns', (
      select coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb)
      from public.paid_campaigns pc
      where pc.company_id = v_company_text
        and pc.responsable_id = any(v_visible_ids)
        and coalesce(pc.updated_at, pc.created_at)::date between v_prev_start and v_next_end
    ),
    'checks', (
      select coalesce(jsonb_agg(to_jsonb(ch)), '[]'::jsonb)
      from public.publication_checks ch
      where ch.company_id = v_company_text
        and ch.updated_by = any(v_visible_ids)
        and ch.updated_at::date between v_prev_start and v_next_end
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

-- Postgres concede EXECUTE a PUBLIC por defecto en funciones nuevas — revocarlo es
-- necesario para que `anon` no pueda invocar esta SECURITY DEFINER sin sesión.
revoke execute on function public.employee_score_inputs(int, int) from public;
revoke execute on function public.employee_score_inputs(int, int) from anon;
grant execute on function public.employee_score_inputs(int, int) to authenticated;


-- ─── Perfiles de peso ────────────────────────────────────────────────────────
do $$
declare
  v_company_id text;
  v_zero       jsonb := '{"entregas":0,"puntualidad":0,"arrastre":0,"tareas_fijas":0,"piezas_av":0,"reuniones":0,"campanas":0,"chequeo":0,"tickets":0,"tareas":0,"cnp":0,"grilla":0,"calendario":0,"metricas":0,"artes":0,"pautas":0,"piezas_grabadas":0,"fotos":0,"edicion":0}'::jsonb;
begin
  select id::text into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise exception 'score_items_basicos: no hay ninguna empresa en companies';
  end if;

  -- Perfiles existentes: se reemplazan los pesos completos por nombre.
  update public.employee_score_profiles set weights = v_zero || '{"tareas":70,"cnp":30}'::jsonb, updated_at = now()
    where company_id = v_company_id and name in ('Default', 'Redes / Social', 'Diseño', 'Audiovisual');
  update public.employee_score_profiles set weights = v_zero || '{"tickets":60,"tareas":40}'::jsonb, updated_at = now()
    where company_id = v_company_id and name = 'IT';
  update public.employee_score_profiles set weights = v_zero || '{"campanas":60,"tareas":40}'::jsonb, updated_at = now()
    where company_id = v_company_id and name = 'Marketing / Ads';
  update public.employee_score_profiles set weights = v_zero || '{"tareas":100}'::jsonb, updated_at = now()
    where company_id = v_company_id and name in ('Dirección / Administración', 'Operativo / Back-office');

  -- Perfiles nuevos por cargo (match por position_ids → ganan al de departamento).
  -- Pesos = los de las fichas técnicas normalizados a 100 (el 15% que las fichas
  -- reservaban al jefe ya lo cubre el 30% de la nota combinada).
  create temp table _perfiles_cargo (cargo text, nombre text, pesos jsonb) on commit drop;
  insert into _perfiles_cargo values
    ('Social Media Manager', 'Social Media Manager', '{"grilla":35,"calendario":18,"metricas":18,"tareas":18,"cnp":11}'),
    ('Diseñador', 'Diseñador', '{"artes":47,"cnp":29,"tareas":24}'),
    ('Creador Cont. Audiov.', 'Creador de Contenido Audiovisual', '{"pautas":53,"piezas_grabadas":24,"edicion":12,"tareas":11}'),
    ('Fotógrafo', 'Fotógrafo', '{"pautas":56,"fotos":44}'),
    ('Editor de video', 'Editor de Video', '{"edicion":70,"tareas":30}'),
    -- Community Manager: todo en 0 → solo cuenta la evaluación del jefe.
    ('Community Manager', 'Community Manager', '{}');

  insert into public.employee_score_profiles (company_id, name, priority, match, weights, is_default)
  select v_company_id, pc.nombre, 0,
         jsonb_build_object('position_ids', jsonb_build_array(p.position_id)),
         v_zero || pc.pesos, false
  from _perfiles_cargo pc
  join public.positions p on p.position_name = pc.cargo
  where not exists (
    select 1 from public.employee_score_profiles e
    where e.company_id = v_company_id and e.name = pc.nombre
  );
end $$;
