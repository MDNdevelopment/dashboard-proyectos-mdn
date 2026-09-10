-- Buzón anónimo de sugerencias y reportes de error, para que cualquiera pueda avisar
-- sin necesidad de abrir un ticket firmado (Soporte Técnico queda oculto por ahora,
-- ver src/config/modules.js). Panel de administración en /feedback (solo admins).
--
-- Anonimato real: a propósito NO existe columna de autor (user_id, email, etc). No es
-- un campo que se omite al insertar, es un campo que no existe — así ningún cambio
-- futuro de código puede empezar a llenarlo por accidente. Ver src/lib/feedback.js
-- (buildFeedbackRow) para el único punto de escritura desde el cliente.
--
-- Mismo patrón de RLS que mappi_chat_logs (20260920000000): cualquier autenticado puede
-- insertar, solo admins de la misma empresa pueden leer/actualizar.

create table public.anonymous_feedback (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null,
  type        text not null check (type in ('recomendacion', 'error')),
  area        text,
  message     text not null check (char_length(message) between 10 and 2000),
  status      text not null default 'nuevo'
              check (status in ('nuevo', 'en_revision', 'resuelto', 'descartado')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index anonymous_feedback_company_status_idx
  on public.anonymous_feedback (company_id, status, created_at desc);

alter table public.anonymous_feedback enable row level security;

-- Cualquier usuario autenticado de la empresa puede enviar feedback. No hay forma de
-- que la fila lo identifique (no hay columna para eso), así que abrir el insert a todos
-- los authenticated no compromete el anonimato.
create policy "Cualquier autenticado puede enviar feedback anónimo"
  on public.anonymous_feedback
  for insert
  to authenticated
  with check (true);

-- Solo admins de la misma empresa pueden leer el buzón.
create policy "Admins leen el feedback anónimo de su empresa"
  on public.anonymous_feedback
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()
        and u.admin = true
        and u.company_id::text = anonymous_feedback.company_id
    )
  );

-- Solo admins pueden cambiar status / admin_note (gestión del buzón). Sin policy de
-- delete: los mensajes se descartan cambiando el status, nunca se borran.
create policy "Admins actualizan el feedback anónimo de su empresa"
  on public.anonymous_feedback
  for update
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()
        and u.admin = true
        and u.company_id::text = anonymous_feedback.company_id
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.user_id = auth.uid()
        and u.admin = true
        and u.company_id::text = anonymous_feedback.company_id
    )
  );
