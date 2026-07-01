-- ─────────────────────────────────────────────────────────────────────────────
-- user_can(p_capability_key) → boolean  (con soporte de exclusiones / deny)
--
-- Extiende la función anterior agregando el bloque "deny" en config:
--
--   config = {
--     rules: [ { all: [...] }, ... ],   ← OR entre grupos AND (permiso)
--     deny:  [ cond, ... ]              ← OR plano (exclusión global)
--   }
--
-- Orden de evaluación:
--   1. Sin fila de usuario       → false
--   2. admin = true              → true  (siempre, incluso si está en deny)
--   3. Alguna condición en deny  → false (gana a rules)
--   4. Sin reglas                → true  (acceso libre)
--   5. DNF de rules              → OR entre grupos, AND dentro de cada grupo
--
-- Retrocompatible: filas sin "deny" en el JSON se evalúan igual que antes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.user_can(p_capability_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_access_level  int;
  v_admin         boolean;
  v_department_id int;
  v_position_id   int;
  v_user_id       uuid;
  v_company_id    text;

  v_rules         jsonb;
  v_deny          jsonb;
  v_groups        jsonb;
  n_groups        int;
  n_conds         int;
  n_deny          int;
  i               int;
  j               int;
  k               int;
  v_group         jsonb;
  v_cond          jsonb;
  v_group_passes  boolean;
  v_cond_passes   boolean;
  v_negate        boolean;
  v_type          text;
begin
  -- ── 1. Cargar perfil del usuario autenticado ──────────────────────────────
  select
    coalesce(access_level, 1),
    coalesce(admin, false),
    department_id,
    position_id,
    user_id,
    company_id::text
  into
    v_access_level, v_admin, v_department_id, v_position_id, v_user_id, v_company_id
  from public.users
  where user_id = auth.uid();

  -- Sin fila de usuario → denegar
  if not found then return false; end if;

  -- Admin siempre pasa (igual que permissions.js), incluso si está en deny
  if v_admin then return true; end if;

  -- ── 2. Cargar config de la capacidad ─────────────────────────────────────
  select rules
  into v_rules
  from public.module_permissions
  where company_id = v_company_id
    and module_key = p_capability_key;

  -- Sin configuración o config vacía → abierto
  if not found or v_rules is null then return true; end if;

  -- ── 3. Evaluar exclusiones (deny) — gana a rules ─────────────────────────
  v_deny := v_rules -> 'deny';
  if v_deny is not null then
    n_deny := jsonb_array_length(v_deny);

    for k in 0 .. n_deny - 1
    loop
      v_cond := v_deny -> k;
      v_type := v_cond ->> 'type';

      v_cond_passes := case v_type
        when 'min_level' then
          v_access_level >= coalesce((v_cond ->> 'value')::int, 1)

        when 'department' then
          v_department_id is not null
          and (v_cond -> 'ids') @> to_jsonb(v_department_id)

        when 'position' then
          v_position_id is not null
          and (v_cond -> 'ids') @> to_jsonb(v_position_id)

        when 'user' then
          (v_cond -> 'ids') @> to_jsonb(v_user_id::text)

        else false
      end;

      -- negate soportado en deny también (p. ej. "excluir a quienes NO sean de Diseño")
      v_negate := coalesce((v_cond ->> 'negate')::boolean, false);
      if v_negate and v_type in ('department', 'min_level', 'user', 'position') then
        v_cond_passes := not v_cond_passes;
      end if;

      -- Si el usuario cumple CUALQUIER condición de exclusión → denegar
      if v_cond_passes then return false; end if;
    end loop;
  end if;

  -- ── 4. Evaluar DNF de rules: OR entre grupos, AND dentro de cada grupo ───
  v_groups := v_rules -> 'rules';
  if v_groups is null then return true; end if;

  n_groups := jsonb_array_length(v_groups);
  if n_groups = 0 then return true; end if;

  for i in 0 .. n_groups - 1
  loop
    v_group := v_groups -> i;
    v_group_passes := true;

    -- Grupo vacío → pasa siempre
    if v_group -> 'all' is null or jsonb_array_length(v_group -> 'all') = 0 then
      return true;
    end if;

    n_conds := jsonb_array_length(v_group -> 'all');

    for j in 0 .. n_conds - 1
    loop
      v_cond := (v_group -> 'all') -> j;
      v_type := v_cond ->> 'type';

      v_cond_passes := case v_type
        when 'min_level' then
          v_access_level >= coalesce((v_cond ->> 'value')::int, 1)

        when 'department' then
          v_department_id is not null
          and (v_cond -> 'ids') @> to_jsonb(v_department_id)

        when 'position' then
          v_position_id is not null
          and (v_cond -> 'ids') @> to_jsonb(v_position_id)

        when 'user' then
          (v_cond -> 'ids') @> to_jsonb(v_user_id::text)

        else false
      end;

      -- Aplicar negación solo a tipos conocidos (guarda de seguridad)
      v_negate := coalesce((v_cond ->> 'negate')::boolean, false);
      if v_negate and v_type in ('department', 'min_level', 'user', 'position') then
        v_cond_passes := not v_cond_passes;
      end if;

      if not v_cond_passes then
        v_group_passes := false;
        exit;   -- AND falló; salir del loop de condiciones
      end if;
    end loop;

    if v_group_passes then return true; end if;  -- OR: basta un grupo
  end loop;

  return false;
end;
$$;

comment on function public.user_can(text) is
  'Evalúa si el usuario autenticado tiene la capacidad indicada según la config '
  'almacenada en module_permissions (campo rules). Réplica de la lógica de permissions.js. '
  'config = { rules: [grupo...], deny: [cond...] }. '
  'deny: OR plano — si el usuario cumple cualquier condición de exclusión, se deniega '
  'el acceso aunque las rules lo permitan. Los admin siempre pasan (incluso si están en deny). '
  'Soporta el flag "negate" por condición tanto en rules como en deny. '
  'Usar como predicado en políticas RLS de escritura.';
