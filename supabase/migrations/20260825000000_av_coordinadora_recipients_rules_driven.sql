-- Corrige a quién llegan las notificaciones de Audiovisual ("nueva pauta solicitada" y
-- el recordatorio semanal de cierre de agenda): `av_coordinadora_recipients()` incluía a
-- CUALQUIER admin de la empresa vía `coalesce(u.admin, false)`, sin importar si esa
-- persona coordina Audiovisual realmente. Eso hacía que admins ajenos al módulo (p. ej.
-- un admin de otro departamento) recibieran notificaciones de pautas que no les
-- correspondían.
--
-- Fix: la función deja de tener el criterio (departamento/nivel/admin) hardcodeado y en
-- su lugar evalúa, por cada empleado, las mismas `rules` configuradas en
-- `module_permissions` para la capability 'audiovisual.coordina' (sin el auto-pase de
-- admin que sí aplica en `user_can()` para permisos de escritura) — así que quien se
-- agregue/quite como coordinador desde Empresa → Permisos automáticamente empieza/deja de
-- recibir estas notificaciones, sin tener que tocar código de nuevo (esto es justo lo que
-- ya advertía el comentario original en 20260820000001_av_pauta_notifications.sql).
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
  where company_id = p_company_id and module_key = 'audiovisual.coordina';

  v_groups := v_rules -> 'rules';

  for v_user in
    select user_id, coalesce(access_level, 1) as access_level, department_id, position_id
    from public.users
    where company_id::text = p_company_id
      and deleted_at is null
  loop
    -- Sin config o sin grupos → capability abierta (mismo default que user_can/rules
    -- vacías); no debería activarse en producción, 'audiovisual.coordina' siempre tiene
    -- rules sembradas.
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
  'cierre de agenda): evalúa las rules de module_permissions para ''audiovisual.coordina'' '
  'por cada empleado (sin auto-pase de admin, a diferencia de user_can()). Mantener '
  'sincronizado con quien realmente coordina el módulo desde Empresa → Permisos.';
