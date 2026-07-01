-- ─────────────────────────────────────────────────────────────────────────────
-- user_can(p_capability_key) → boolean  (con soporte de negación por condición)
--
-- Extiende la función anterior agregando el flag "negate" en cada condición.
-- Cuando negate = true, el resultado de esa condición se invierte.
--
-- Guarda crítica: negate solo aplica a tipos conocidos (department, min_level,
-- user, position). Tipo ausente/desconocido siempre devuelve false sin invertir,
-- para no abrir acceso por error — idéntico a permissions.js.
--
-- Compatibilidad: las reglas sin "negate" (o con negate = false) se comportan
-- exactamente igual que antes.
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
  v_groups        jsonb;
  n_groups        int;
  n_conds         int;
  i               int;
  j               int;
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

  -- Admin siempre pasa (igual que permissions.js)
  if v_admin then return true; end if;

  -- ── 2. Cargar reglas de la capacidad ─────────────────────────────────────
  select rules
  into v_rules
  from public.module_permissions
  where company_id = v_company_id
    and module_key = p_capability_key;

  -- Sin configuración o reglas vacías → abierto (igual que permissions.js)
  if not found or v_rules is null then return true; end if;

  v_groups := v_rules -> 'rules';
  if v_groups is null then return true; end if;

  n_groups := jsonb_array_length(v_groups);
  if n_groups = 0 then return true; end if;

  -- ── 3. Evaluar DNF: OR entre grupos, AND dentro de cada grupo ────────────
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

      -- Calcular resultado base según tipo
      v_cond_passes := case v_type
        -- access_level >= value
        when 'min_level' then
          v_access_level >= coalesce((v_cond ->> 'value')::int, 1)

        -- department_id ∈ ids  (ids almacena enteros)
        when 'department' then
          v_department_id is not null
          and (v_cond -> 'ids') @> to_jsonb(v_department_id)

        -- position_id ∈ ids  (ids almacena enteros)
        when 'position' then
          v_position_id is not null
          and (v_cond -> 'ids') @> to_jsonb(v_position_id)

        -- user_id ∈ ids  (ids almacena strings UUID)
        when 'user' then
          (v_cond -> 'ids') @> to_jsonb(v_user_id::text)

        -- Tipo desconocido/ausente → false, NO se invierte aunque negate = true
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
  'Evalúa si el usuario autenticado tiene la capacidad indicada según las reglas '
  'almacenadas en module_permissions. Réplica de la lógica DNF de permissions.js. '
  'Soporta el flag "negate" por condición para invertir una condición específica. '
  'Usar como predicado en políticas RLS de escritura.';
