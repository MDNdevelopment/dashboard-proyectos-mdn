-- ─── metric_clients: hacer line_id nullable + FK SET NULL + nuevos campos de marca ────
-- Antes: line_id NOT NULL, ON DELETE CASCADE (borrar línea borraba sus clientes).
-- Ahora: line_id nullable, ON DELETE SET NULL (borrar línea deja clientes "sin línea").

alter table public.metric_clients drop constraint metric_clients_line_id_fkey;
alter table public.metric_clients alter column line_id drop not null;
alter table public.metric_clients add constraint metric_clients_line_id_fkey
  foreign key (line_id) references public.metric_lines(id) on delete set null;

-- Campos de configuración de marca (todos opcionales)
alter table public.metric_clients
  add column if not exists website      text,
  add column if not exists payment_day  int check (payment_day between 1 and 31),
  add column if not exists social_links jsonb not null default '[]'::jsonb;
  -- social_links: [{ red: string, link: string }]

-- ─── metric_lines: agregar miembros (empleados) como array jsonb ──────────────
-- Patrón idéntico a projects.phases — evita FK a la tabla users cuyo PK es incierto.
-- Mover un empleado = quitar su user_id del array de la línea A y añadirlo al de la línea B.

alter table public.metric_lines
  add column if not exists member_user_ids jsonb not null default '[]'::jsonb;
  -- member_user_ids: [user_id_string, ...]
