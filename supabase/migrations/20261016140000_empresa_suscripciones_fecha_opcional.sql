-- Suscripciones: la fecha de cobro puede quedar pendiente de confirmar. Se registra el
-- servicio sin `billing_day` y se completa cuando alguien lo consulte. Sin día no hay
-- próximo cobro (el cliente lo trata como "fecha por confirmar").
--
-- `billing_month` solo es obligatorio cuando hay día de cobro y la frecuencia no es mensual.
alter table public.company_subscriptions
  alter column billing_day drop not null;

alter table public.company_subscriptions
  drop constraint company_subscriptions_month_required_check;

alter table public.company_subscriptions
  add constraint company_subscriptions_month_required_check
  check (frequency = 'mensual' or billing_day is null or billing_month is not null);
