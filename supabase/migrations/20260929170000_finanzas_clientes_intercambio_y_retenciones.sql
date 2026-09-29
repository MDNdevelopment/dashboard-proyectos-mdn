-- ─────────────────────────────────────────────────────────────────────────────
-- Finanzas → Clientes: edición económica, marcas en intercambio y retenciones.
--
-- Tres cosas que van juntas porque comparten las mismas columnas y el mismo
-- permiso:
--
--   1. La pestaña Finanzas → Clientes deja de ser de solo lectura: se puede
--      editar la mensualidad y el día de pago de una marca desde ahí, sin pasar
--      por el maestro completo de Empresa → Clientes.
--   2. `es_intercambio`: marcas a las que la agencia les trabaja pero no les
--      cobra dinero (hacen canje). No entran en la facturación fija del mes ni
--      suman a la cartera.
--   3. Retenciones por cliente (ISL 5%|2%, IVA 75%|100%, municipal 1%). El
--      cliente retiene esa parte y la entera al fisco, así que el monto que de
--      verdad entra a caja —el "neto a cobrar"— es menor que el facturado. La
--      aritmética vive en src/utils/retenciones.js; aquí solo la configuración.
--
-- Y un endurecimiento de permisos pedido explícitamente por la dirección: de
-- aquí en adelante SOLO quien entra al módulo Finanzas (nivel 4 o departamento
-- Administración) o es admin puede tocar los datos económicos de un cliente.
-- Hasta ahora alcanzaba con `empresa.clientes.manage` + nivel >= 3, lo que
-- dejaba el absurdo de que quien lleva el dinero (Administración) no pudiera
-- corregir una mensualidad y quien sí podía no maneja la plata.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. metric_clients: intercambio + configuración de retenciones ────────────
alter table public.metric_clients
  add column if not exists es_intercambio boolean not null default false,
  add column if not exists ret_isl        boolean not null default false,
  add column if not exists ret_isl_rate   numeric(5,4),
  add column if not exists ret_iva        boolean not null default false,
  add column if not exists ret_iva_rate   numeric(5,4),
  add column if not exists ret_municipal  boolean not null default false;

comment on column public.metric_clients.es_intercambio is
  'La marca no paga mensualidad en dinero (canje). Queda fuera de la facturación fija del mes.';
comment on column public.metric_clients.ret_isl_rate is
  'Tasa de retención de ISL sobre la base imponible: 0.05 o 0.02. NULL = no aplica.';
comment on column public.metric_clients.ret_iva_rate is
  'Porcentaje del IVA contenido que el cliente retiene: 0.75 o 1.00. NULL = no aplica.';

-- Las tasas son cerradas por ley, no configurables: el CHECK hace imposible
-- guardar una inválida aunque un formulario futuro se equivoque.
alter table public.metric_clients
  drop constraint if exists metric_clients_ret_isl_rate_chk,
  drop constraint if exists metric_clients_ret_iva_rate_chk,
  drop constraint if exists metric_clients_ret_isl_coherente_chk,
  drop constraint if exists metric_clients_ret_iva_coherente_chk,
  drop constraint if exists metric_clients_intercambio_sin_fee_chk;

alter table public.metric_clients
  add constraint metric_clients_ret_isl_rate_chk
    check (ret_isl_rate is null or ret_isl_rate in (0.0500, 0.0200)),
  add constraint metric_clients_ret_iva_rate_chk
    check (ret_iva_rate is null or ret_iva_rate in (0.7500, 1.0000)),
  -- Una retención activa sin tasa dejaría un cálculo a medias: la BD no depende
  -- de que la UI lo impida.
  add constraint metric_clients_ret_isl_coherente_chk
    check (not ret_isl or ret_isl_rate is not null),
  add constraint metric_clients_ret_iva_coherente_chk
    check (not ret_iva or ret_iva_rate is not null),
  -- Intercambio y mensualidad son excluyentes por definición.
  add constraint metric_clients_intercambio_sin_fee_chk
    check (not es_intercambio or coalesce(monthly_fee, 0) = 0);

-- ── 2. fin_invoices: snapshot inmutable de las retenciones ───────────────────
-- Snapshot, igual que `client_name`: la factura de marzo debe seguir cuadrando
-- aunque en abril le cambien la configuración a la marca. NO se guardan montos
-- derivados (neto, total retenido): se calculan siempre desde `amount` + estas
-- columnas, por la misma razón por la que `estadoFactura` no es una columna —
-- un valor guardado se desincroniza del monto en cuanto alguien edita la
-- factura.
--
-- Sin backfill: toda la facturación existente queda en los defaults, lo que da
-- retenciones 0 y neto = amount, es decir el comportamiento exacto de hoy. Un
-- backfill además sería imposible en meses cerrados: fin_block_closed_month()
-- rechaza cualquier UPDATE sobre un mes con closed = true.
alter table public.fin_invoices
  add column if not exists ret_isl        boolean not null default false,
  add column if not exists ret_isl_rate   numeric(5,4),
  add column if not exists ret_iva        boolean not null default false,
  add column if not exists ret_iva_rate   numeric(5,4),
  add column if not exists ret_municipal  boolean not null default false;

alter table public.fin_invoices
  drop constraint if exists fin_invoices_ret_isl_rate_chk,
  drop constraint if exists fin_invoices_ret_iva_rate_chk;

alter table public.fin_invoices
  add constraint fin_invoices_ret_isl_rate_chk
    check (ret_isl_rate is null or ret_isl_rate in (0.0500, 0.0200)),
  add constraint fin_invoices_ret_iva_rate_chk
    check (ret_iva_rate is null or ret_iva_rate in (0.7500, 1.0000));

-- ── 3. Capability finanzas.clientes.manage ───────────────────────────────────
-- Se siembra copiando las reglas del módulo `finanzas` y no con el default de
-- nivel 4, siguiendo la doctrina fijada en 20260929160000: quien entra al
-- módulo entra a todo el módulo. Las reglas de `finanzas` ya son "nivel >= 4 O
-- departamento Administración", y `user_can`/`can()` dejan pasar siempre al
-- admin — exactamente lo pedido.
--
-- Una capability SIN fila en module_permissions queda ABIERTA a todos, así que
-- esta siembra es parte de la feature: desplegar el front sin ella expondría
-- los datos económicos de los clientes a toda la empresa.
do $$
declare
  cid text;
  v_rules jsonb;
  v_default jsonb := jsonb_build_object(
    'deny', '[]'::jsonb,
    'rules', jsonb_build_array(
      jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('type', 'min_level', 'value', 4, 'ids', '[]'::jsonb)
      ))
    )
  );
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    select rules into v_rules
      from public.module_permissions
     where company_id = cid and module_key = 'finanzas';

    insert into public.module_permissions (company_id, module_key, rules)
    values (cid, 'finanzas.clientes.manage', coalesce(v_rules, v_default))
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;

-- ── 4. RLS: Finanzas también puede escribir metric_clients ───────────────────
-- Hasta ahora el UPDATE exigía `empresa.clientes.manage`, que el equipo de
-- Finanzas no tiene. Se amplía a un OR para que puedan guardar.
--
-- OJO: esto por sí solo sería una ESCALADA DE PRIVILEGIOS — un usuario de
-- Finanzas pasaría el gate para la fila entera y podría renombrar una marca,
-- cambiarle la línea o archivarla. Lo que lo impide es el trigger del punto 5,
-- que controla columna por columna en las dos direcciones. Las dos piezas van
-- juntas: no tocar una sin la otra.
drop policy if exists "metric_clients_manage_update" on public.metric_clients;
create policy "metric_clients_manage_update" on public.metric_clients
  for update to authenticated
  using      (public.user_can('empresa.clientes.manage')
              or public.user_can('finanzas.clientes.manage'))
  with check (public.user_can('empresa.clientes.manage')
              or public.user_can('finanzas.clientes.manage'));

-- ── 5. Guarda por columna ────────────────────────────────────────────────────
-- La RLS no sabe de columnas: solo puede decir "esta fila sí / esta fila no".
-- Este trigger es lo que hace cumplir las dos direcciones del requisito:
--
--   • columnas económicas  → exigen finanzas.clientes.manage
--   • cualquier otra       → exige empresa.clientes.manage
--
-- Se prefirió un trigger a una función SECURITY DEFINER de escritura porque la
-- RPC solo resolvería que Finanzas pueda escribir, no el "solo ellos": el
-- camino normal (updateClient() en metricsApi.js) seguiría abierto para quien
-- tenga empresa.clientes.manage. El trigger cubre TODOS los caminos de
-- escritura, presentes y futuros, y deja una sola API de escritura que mantener.
create or replace function public.metric_clients_guard_economico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  econ_cols text[] := array['monthly_fee','payment_day','es_intercambio',
                            'ret_isl','ret_isl_rate','ret_iva','ret_iva_rate','ret_municipal'];
  econ_changed  boolean;
  otros_changed boolean;
begin
  -- Cron, service_role y funciones SECURITY DEFINER sin JWT no son un usuario
  -- pidiendo permiso (p. ej. apply_due_client_line_moves): pasan de largo.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    econ_changed := coalesce(new.monthly_fee, 0) <> 0
                 or new.payment_day is not null
                 or new.es_intercambio
                 or new.ret_isl or new.ret_iva or new.ret_municipal;
    otros_changed := true;
  else
    econ_changed := new.monthly_fee   is distinct from old.monthly_fee
                 or new.payment_day   is distinct from old.payment_day
                 or new.es_intercambio is distinct from old.es_intercambio
                 or new.ret_isl       is distinct from old.ret_isl
                 or new.ret_isl_rate  is distinct from old.ret_isl_rate
                 or new.ret_iva       is distinct from old.ret_iva
                 or new.ret_iva_rate  is distinct from old.ret_iva_rate
                 or new.ret_municipal is distinct from old.ret_municipal;
    -- Se comparan "todas las columnas menos las económicas" en bloque en vez de
    -- enumerarlas: así una columna que se agregue en el futuro queda protegida
    -- por defecto, que es el lado seguro del error.
    otros_changed := (to_jsonb(new) - econ_cols) is distinct from (to_jsonb(old) - econ_cols);
  end if;

  if econ_changed and not public.user_can('finanzas.clientes.manage') then
    raise exception 'Solo Finanzas puede modificar los datos económicos de un cliente'
      using errcode = '42501';
  end if;

  if otros_changed and not public.user_can('empresa.clientes.manage') then
    raise exception 'No tienes permiso para modificar los datos del cliente'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists metric_clients_guard_economico on public.metric_clients;
create trigger metric_clients_guard_economico
  before insert or update on public.metric_clients
  for each row execute function public.metric_clients_guard_economico();
