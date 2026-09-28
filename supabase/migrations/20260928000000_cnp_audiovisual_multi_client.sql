-- CNP audiovisual + trabajo interno sin cliente + varias marcas por CNP.
--
-- is_audiovisual: un CNP de audiovisual nunca se imprime ni usa referencias visuales —
-- el formulario oculta esos campos cuando está marcado (CnpModal.jsx).
--
-- client_id pasa a ser NULLABLE: hoy una diseñadora hace a veces favores internos (p. ej.
-- para el jefe) que no corresponden a ningún cliente de la línea. no_client_note guarda
-- para quién fue el trabajo, en texto libre.
--
-- client_ids uuid[]: mismo patrón que meetings.client_ids (20260915000000_meetings_multi_
-- client.sql) — un CNP puede cubrir varias marcas sin duplicar la fila. El escalar
-- client_id se conserva y siempre refleja la posición 0, para no romper a quien todavía lo
-- lee (countCnpSolicitudesForLine no lo usa, pero el MCP de solo lectura y consultas SQL
-- externas sí podrían).
alter table public.cnp_requests
  add column if not exists is_audiovisual boolean not null default false,
  add column if not exists no_client_note text,
  add column if not exists client_ids uuid[] not null default '{}';

alter table public.cnp_requests alter column client_id drop not null;

update public.cnp_requests
   set client_ids = array[client_id]
 where client_id is not null and cardinality(client_ids) = 0;

create index if not exists cnp_requests_client_ids_idx
  on public.cnp_requests using gin (client_ids);
