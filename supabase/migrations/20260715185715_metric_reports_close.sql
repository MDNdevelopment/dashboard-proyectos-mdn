-- Migration: cierre permanente de reportes (Métricas → Operaciones/Finanzas)
-- Agrega el concepto de "reporte cerrado": una vez cerrado por un nivel 4/admin,
-- el reporte (línea, año, mes) queda de solo lectura para siempre. No hay reapertura
-- por diseño — ver ARQUITECTURA.md §2.5. El gating de QUIÉN puede cerrar (nivel 4/admin,
-- capability `reportes.close`) vive en la app (canAccessModule) y en el módulo Permisos,
-- igual que el resto de capabilities de metric_reports; esta migración solo garantiza,
-- a nivel de datos, que un reporte cerrado no se pueda volver a editar aunque la UI falle.

alter table public.metric_reports
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by text;

-- Bloquea cualquier UPDATE sobre una fila que ya estaba cerrada (OLD.closed_at not null).
-- El UPDATE que cierra el reporte (closed_at pasa de null a un valor) SÍ pasa, porque en
-- ese momento OLD.closed_at todavía es null.
create or replace function public.prevent_closed_report_edit()
returns trigger language plpgsql as $$
begin
  if OLD.closed_at is not null then
    raise exception 'metric_reports: el reporte % (línea %, %/%) está cerrado y no se puede modificar',
      OLD.id, OLD.line_id, OLD.month, OLD.year;
  end if;
  return NEW;
end;
$$;

drop trigger if exists metric_reports_prevent_closed_edit on public.metric_reports;
create trigger metric_reports_prevent_closed_edit
  before update on public.metric_reports
  for each row execute procedure public.prevent_closed_report_edit();
