-- Consolidar los estados de Tácticas (campaigns) y Ads (paid_campaigns) de 6 a 4:
-- Pendiente, En Curso, Finalizado, Descartado.
-- Ninguna de las dos columnas tiene CHECK constraint, así que basta con UPDATE.
--
-- Mapeo:
--   Cancelado  -> Descartado
--   Revisión   -> Pendiente
--   Aprobado   -> En Curso  si la fecha de inicio ya corrió (start_date <= hoy)
--                Pendiente  en caso contrario

update public.campaigns set status = 'Descartado' where status = 'Cancelado';
update public.campaigns set status = 'Pendiente' where status = 'Revisión';
update public.campaigns
  set status = case
    when start_date is not null and start_date <= current_date then 'En Curso'
    else 'Pendiente'
  end
  where status = 'Aprobado';

update public.paid_campaigns set status = 'Descartado' where status = 'Cancelado';
update public.paid_campaigns set status = 'Pendiente' where status = 'Revisión';
update public.paid_campaigns
  set status = case
    when start_date is not null and start_date <= current_date then 'En Curso'
    else 'Pendiente'
  end
  where status = 'Aprobado';
