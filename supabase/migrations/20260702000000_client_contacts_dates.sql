-- Migration: add contacts list and key dates to metric_clients
-- contacts: jsonb array [{ name, birth_date, role }] for future birthday notifications
-- anniversary_date: the client company's founding/anniversary date
-- mdn_since: date the client started working with MDN

alter table public.metric_clients
  add column if not exists contacts        jsonb not null default '[]'::jsonb,
  add column if not exists anniversary_date date,
  add column if not exists mdn_since        date;

comment on column public.metric_clients.contacts         is 'List of contact persons: [{name, birth_date, role}]';
comment on column public.metric_clients.anniversary_date is 'Client company anniversary date (for future notifications)';
comment on column public.metric_clients.mdn_since        is 'Date the client started working with MDN (for future notifications)';
