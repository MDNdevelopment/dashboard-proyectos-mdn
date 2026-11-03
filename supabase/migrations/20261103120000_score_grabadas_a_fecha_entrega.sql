-- Score de quienes graban (piezas_grabadas / fotos / videos) medido a tiempo: el RPC
-- `employee_score_inputs` entrega, por pauta y formato, la fecha de entrega de sus lotes de
-- edición y las unidades listas a esa fecha (`entrega_por_formato`), y también las pautas cuyos
-- lotes vencen en el mes aunque la pauta sea de otro. Depende de 20261102130000..130200.
-- NO aplicar a producción sin confirmación del desarrollador.

-- Por formato de una pauta: { "F": { "fecha": "YYYY-MM-DD", "listas": n, "cantidad": n } }.
-- Solo incluye el formato si TODOS sus lotes vigentes tienen fecha de entrega (si falta alguna,
-- el formato conserva la medición anterior). `fecha` es la más tardía; `listas` suma, por lote,
-- las unidades listas a SU fecha (si no hay historia a esa fecha, el avance actual).
create or replace function public.av_pauta_entrega_por_formato(p_pauta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(
      f.formato,
      jsonb_build_object('fecha', f.fecha, 'listas', f.listas, 'cantidad', f.cantidad)
    ),
    '{}'::jsonb
  )
  from (
    select pz.formato,
           max(pz.fecha_entrega) as fecha,
           sum(least(pz.cantidad,
                     coalesce(public.av_pieza_listas_a_fecha(pz.id, pz.fecha_entrega), pz.listas)))::int as listas,
           sum(pz.cantidad)::int as cantidad
    from public.av_pauta_piezas pz
    where pz.pauta_id = p_pauta_id
      and pz.es_lote
      and pz.status <> 'cancelado'
      and pz.formato is not null
    group by pz.formato
    having bool_and(pz.fecha_entrega is not null)
  ) f;
$$;

revoke execute on function public.av_pauta_entrega_por_formato(uuid) from public, anon;
grant execute on function public.av_pauta_entrega_por_formato(uuid) to authenticated, service_role;

-- Vista mínima para el loader de la función programada (service role): evita duplicar la regla
-- en JavaScript.
create or replace view public.av_pauta_entrega_v
with (security_invoker = true) as
select ap.id,
       ap.company_id,
       public.av_pauta_entrega_por_formato(ap.id) as entrega_por_formato
from public.av_pautas ap
where ap.deleted_at is null;

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
