-- Migration: create notifications table with RLS and realtime
-- Stores in-app notifications for all users. Email dispatch is handled
-- by a Supabase Database Webhook on INSERT (configure via Supabase dashboard:
--   Table: notifications, Event: INSERT, URL: .../functions/v1/notify-dispatch)

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null default '',  -- empty string for entities without company scoping (e.g. projects)
  user_id      text not null,         -- destinatario (auth.uid() as text)
  type         text not null,         -- task_assigned | project_added | client_anniversary |
                                      -- client_mdn_anniversary | client_contact_birthday |
                                      -- employee_birthday | employee_mdn_anniversary
  title        text not null,
  body         text not null default '',
  entity_type  text,                  -- task | project | client | employee
  entity_id    text,                  -- uuid of the related entity
  email        boolean not null default false,
  read         boolean not null default false,
  dedupe_key   text,                  -- idempotency key (null for assignment notifications)
  created_at   timestamptz not null default now()
);

-- Unique partial index for idempotent date notifications
create unique index if not exists notifications_dedupe_key_idx
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

-- Performance index for the notification feed (most recent unread first)
create index if not exists notifications_user_feed_idx
  on public.notifications (user_id, read, created_at desc);

-- RLS: each user can only see and update their own notifications
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid()::text = user_id);

create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid()::text = user_id);

-- INSERT is done by SECURITY DEFINER triggers and functions, not by the client directly.
-- No INSERT policy needed for the client.

-- Expose to Supabase Realtime so the bell subscribes in real time
alter publication supabase_realtime add table public.notifications;
