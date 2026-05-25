alter table public.projects
  add column members text[] not null default '{}';
