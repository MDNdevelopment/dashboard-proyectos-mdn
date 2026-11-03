-- Fecha de entrega de las piezas: SIN valor por defecto y con fecha vencida movible por la jefa.
--
-- Cambia lo de 20261102130100_av_pauta_piezas_fecha_entrega.sql:
--   1. Ya no se supone `pauta_date + 7` al marcar la pauta realizada: la fecha se llena a mano
--      (null = sin fecha; esos lotes se miden como antes). Sin valor supuesto, la columna
--      `fecha_entrega_confirmada` no tiene sentido y se elimina.
--   2. Una fecha vencida ya no queda congelada: la puede mover SOLO la jefa de la línea de la
--      pauta (antes de vencer sigue pudiendo fijarla coordinación, gestión o la jefa).
-- NO aplicar a producción sin confirmación del desarrollador (incluye DROP de objetos propios).

-- Las fechas supuestas por el trigger anterior (sin confirmar) se limpian antes de quitar la columna.
update public.av_pauta_piezas
set fecha_entrega = null
where fecha_entrega is not null and not fecha_entrega_confirmada;

drop trigger if exists av_pautas_default_fecha_entrega_trigger on public.av_pautas;
drop function if exists public.av_pautas_default_fecha_entrega();

-- Solo la jefa de la línea de la pauta (o contextos sin usuario: service role / SQL editor).
create or replace function public.av_pieza_puede_mover_vencida(p_pauta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null or public.user_leads_av_pauta(p_pauta_id);
$$;

create or replace function public.av_pauta_piezas_guard_fecha_entrega()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Caracas')::date;
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

  if old.fecha_entrega is not null and old.fecha_entrega < v_hoy
     and not public.av_pieza_puede_mover_vencida(new.pauta_id) then
    raise exception 'Una fecha de entrega vencida solo la puede cambiar la jefa de la línea'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop function if exists public.av_pieza_fecha_entrega_default(uuid);

alter table public.av_pauta_piezas drop column if exists fecha_entrega_confirmada;
