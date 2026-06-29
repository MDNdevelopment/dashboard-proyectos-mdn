-- Trigger: on INSERT to notifications where email=true, call notify-dispatch edge function.
-- Uses net.http_post (pg_net) mirroring the proven notify_new_ticket() pattern.
-- The service-role key is read from vault.decrypted_secrets (name = 'service_role_key').
-- Wrapped in exception handler so a delivery failure NEVER aborts the parent insert.

create or replace function public.notify_dispatch_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  srv_key text;
begin
  if new.email = true then
    begin
      select decrypted_secret into srv_key
        from vault.decrypted_secrets
       where name = 'service_role_key'
       limit 1;

      perform net.http_post(
        url     := 'https://faaqjemovtyulorpdgrd.supabase.co/functions/v1/notify-dispatch',
        body    := jsonb_build_object(
                     'type',   'INSERT',
                     'table',  'notifications',
                     'record', row_to_json(new)::jsonb
                   ),
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || coalesce(srv_key, '')
                   )
      );
    exception when others then
      -- email dispatch must never abort the parent transaction
      raise warning 'notify_dispatch_email failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create trigger on_notification_email
  after insert on public.notifications
  for each row execute procedure public.notify_dispatch_email();
