-- Migración: logo de cliente + vínculo relacional cliente ↔ tarea
--
-- 1. Agrega logo_url (URL de Cloudinary) a metric_clients.
-- 2. Agrega client_id (FK a metric_clients) a tasks, análogo a cómo
--    users.avatar_url guarda la URL de una imagen de perfil.
-- 3. Backfill: re-vincula tareas existentes cruzando por nombre
--    dentro de la misma empresa y la misma línea (line_id = team_id).
--    Las que no coincidan quedan con client_id null pero conservan tasks.client (texto).

-- Logo del cliente
alter table public.metric_clients
  add column if not exists logo_url text;

-- Vínculo relacional cliente ↔ tarea
alter table public.tasks
  add column if not exists client_id uuid
    references public.metric_clients(id) on delete set null;

-- Backfill por nombre (idempotente: solo actúa donde client_id es null)
update public.tasks t
set client_id = mc.id
from public.metric_clients mc
where t.client_id is null
  and t.client is not null
  and mc.company_id = t.company_id
  and mc.line_id    = t.team_id
  and lower(trim(mc.name)) = lower(trim(t.client));
