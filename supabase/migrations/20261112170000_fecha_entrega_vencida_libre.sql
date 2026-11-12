-- Fecha de entrega de las piezas: una fecha vencida ya no queda bloqueada.
--
-- Cambia lo de 20261103130000_fecha_entrega_manual.sql: antes una fecha ya vencida solo la
-- podía mover la jefa de la línea (22023). En las pautas de cuentas independientes
-- (`line_id` null, línea "Independientes" sin jefa) nadie podía moverla, y coordinación
-- tampoco podía en ninguna línea. Ahora quien puede fijar la fecha
-- (`av_pieza_puede_fijar_fecha`: coordina ∨ gestión ∨ jefa de la línea, admins vía user_can)
-- también la mueve después de vencida. El editor y el recurso siguen sin poder tocarla (42501).
-- NO aplicar a producción sin confirmación del desarrollador (incluye DROP de una función propia).

create or replace function public.av_pauta_piezas_guard_fecha_entrega()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Un lote nuevo solo trae fecha propia si quien lo crea puede fijarla.
    if new.fecha_entrega is not null and not public.av_pieza_puede_fijar_fecha(new.pauta_id) then
      new.fecha_entrega := null;
    end if;
    return new;
  end if;

  if new.fecha_entrega is not distinct from old.fecha_entrega then
    return new;
  end if;

  if not public.av_pieza_puede_fijar_fecha(new.pauta_id) then
    raise exception 'No tienes permiso para cambiar la fecha de entrega de las piezas'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop function if exists public.av_pieza_puede_mover_vencida(uuid);
