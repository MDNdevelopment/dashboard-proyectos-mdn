-- Desacopla "quién recibe notificaciones de Audiovisual" de "quién puede coordinar"
-- (agendar/declinar, permiso real vía RLS/UI). La migración anterior
-- (20260825000000) dejó `av_coordinadora_recipients()` gobernada por las rules de
-- 'audiovisual.coordina' — correcto para no barrer admins ajenos al módulo, pero acopla
-- de más: dirección (nivel≥4) y cualquier futuro coordinador real seguirían recibiendo
-- notificaciones aunque durante el desarrollo solo se quiera notificar a una persona
-- puntual (hoy: Juan Lauretta, developer; a futuro: Lizdania, coordinadora real) sin
-- avisarle a todos los niveles.
--
-- Nueva capability 'audiovisual.notificaciones' — mismo motor de rules de
-- module_permissions, pero exclusiva para enrutar notificaciones (no afecta permisos de
-- escritura). Cambiar el destinatario a futuro es un UPDATE de una fila, no un deploy.
create or replace function public.av_coordinadora_recipients(p_company_id text)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rules      jsonb;
  v_groups     jsonb;
  v_result     text[] := '{}';
  v_user       record;
  i            int;
  j            int;
  v_group      jsonb;
  v_cond       jsonb;
  v_type       text;
  v_negate     boolean;
  v_pass       boolean;
  v_group_pass boolean;
begin
  select rules into v_rules
  from public.module_permissions
  where company_id = p_company_id and module_key = 'audiovisual.notificaciones';

  v_groups := v_rules -> 'rules';

  for v_user in
    select user_id, coalesce(access_level, 1) as access_level, department_id, position_id
    from public.users
    where company_id::text = p_company_id
      and deleted_at is null
  loop
    if v_groups is null or jsonb_array_length(v_groups) = 0 then
      v_result := array_append(v_result, v_user.user_id::text);
      continue;
    end if;

    for i in 0 .. jsonb_array_length(v_groups) - 1 loop
      v_group := v_groups -> i;

      if v_group -> 'all' is null or jsonb_array_length(v_group -> 'all') = 0 then
        v_result := array_append(v_result, v_user.user_id::text);
        exit;
      end if;

      v_group_pass := true;
      for j in 0 .. jsonb_array_length(v_group -> 'all') - 1 loop
        v_cond := (v_group -> 'all') -> j;
        v_type := v_cond ->> 'type';

        v_pass := case v_type
          when 'min_level' then
            v_user.access_level >= coalesce((v_cond ->> 'value')::int, 1)
          when 'department' then
            v_user.department_id is not null and (v_cond -> 'ids') @> to_jsonb(v_user.department_id)
          when 'position' then
            v_user.position_id is not null and (v_cond -> 'ids') @> to_jsonb(v_user.position_id)
          when 'user' then
            (v_cond -> 'ids') @> to_jsonb(v_user.user_id::text)
          else false
        end;

        v_negate := coalesce((v_cond ->> 'negate')::boolean, false);
        if v_negate and v_type in ('department', 'min_level', 'user', 'position') then
          v_pass := not v_pass;
        end if;

        if not v_pass then
          v_group_pass := false;
          exit;
        end if;
      end loop;

      if v_group_pass then
        v_result := array_append(v_result, v_user.user_id::text);
        exit;
      end if;
    end loop;
  end loop;

  return v_result;
end;
$$;

comment on function public.av_coordinadora_recipients(text) is
  'Destinatarios de notificaciones de Audiovisual (pauta solicitada + recordatorio de '
  'cierre de agenda): evalúa las rules de module_permissions para '
  '''audiovisual.notificaciones'' por cada empleado (capability independiente de '
  '''audiovisual.coordina'', que sigue gobernando el permiso real de agendar/declinar). '
  'Cambiar destinatarios = actualizar esa fila, sin tocar permisos de escritura.';

-- Seed: hoy solo Juan Lauretta (developer, en pruebas). Reemplazar por Lizdania (u otro
-- coordinador real) antes de producción con un UPDATE de esta fila.
insert into public.module_permissions (company_id, module_key, rules)
select company_id, 'audiovisual.notificaciones',
  '{"rules":[{"all":[{"type":"user","ids":["2d50a4e5-35db-4be5-b27a-a24d1282ce82"]}]}]}'::jsonb
from public.module_permissions
where module_key = 'audiovisual.coordina'
on conflict (company_id, module_key) do update set rules = excluded.rules;
