-- Al completarse el segundo check (aprobación de impresión) de un CNP:
--   1. el status pasa automáticamente a 'Terminado' (ya no depende de que alguien
--      lo cambie a mano en el select del modal).
--   2. se notifica a quien creó la solicitud (created_by) de que fue aprobada.
-- Dispara solo en la transición null -> not null de print_approved_at, para no
-- repetir la notificación en ediciones posteriores del mismo CNP.
create or replace function public.notify_cnp_print_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.print_approved_at is not null and OLD.print_approved_at is null then
    NEW.status := 'Terminado';

    if NEW.created_by is not null then
      insert into public.notifications (
        company_id,
        user_id,
        type,
        title,
        body,
        entity_type,
        entity_id,
        email,
        read
      ) values (
        NEW.company_id,
        NEW.created_by,
        'cnp_print_approved',
        'CNP aprobado para impresión',
        left(NEW.title, 120),
        'cnp',
        NEW.id::text,
        true,
        false
      );
    end if;
  end if;

  return NEW;
end;
$$;

create trigger trg_notify_cnp_print_approved
  before update on public.cnp_requests
  for each row
  execute function public.notify_cnp_print_approved();
