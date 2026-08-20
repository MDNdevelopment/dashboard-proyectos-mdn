-- Tabla "av_pautas": calendario de pautas audiovisuales (grabaciones/sesiones) por cliente
-- (módulo Gestión de Tareas → Tareas Fijas, sub-sección Audiovisual — Fase 2).
--
-- Flujo de aprobación (status): la jefa de línea SOLICITA la pauta ('solicitada', con
-- `submitted` en false mientras arma el brief); la coordinadora de audiovisual la AGENDA
-- (pasa a 'programada', fija fecha/recurso/asistentes) o la DECLINA ('declinada', no se
-- agenda). Al ejecutarse se marca 'realizada' y se capturan piezas totales/editadas.
-- Solo 'programada'/'realizada' con fecha aparecen en el calendario.
--
-- client_name/line_id se denormalizan desde metric_clients al crear/editar (snapshot,
-- mismo patrón que meetings.line_id / fixed_task_marks.line_id): si el cliente cambia de
-- línea después, la pauta conserva la línea de cuando se solicitó/agendó.
--
-- graba_user_id / edita_user_id referencian empleados del depto Audiovisual (department_id
-- = 2); *_other es texto libre para un tercero. El agregado de piezas_totales/editadas de
-- las pautas 'realizada' alimenta el indicador «6. Nº Piezas vs Piezas editadas» del
-- reporte mensual desde AUDIOVISUAL_MODULE_START (ver constants.js / OperacionesView.jsx).
create table if not exists public.av_pautas (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null,
  client_id           uuid references public.metric_clients(id) on delete set null,
  client_name         text,                                   -- snapshot del nombre
  line_id             uuid references public.metric_lines(id) on delete set null,
  tema                text,
  place               text,
  requirements        text,
  has_model           boolean not null default false,
  pauta_date          date,                                    -- null = por agendar
  salida              time,
  llegada             time,
  formats             text[] not null default '{}',            -- subconjunto de 'V','R','F'
  graba_user_id       uuid references public.users(user_id) on delete set null,
  graba_other         text,
  edita_user_id       uuid references public.users(user_id) on delete set null,
  edita_other         text,
  attendee_ids        text[] not null default '{}',            -- user_id[] (convención de meetings.attendee_ids)
  link                text,                                    -- URL de la grilla (Drive)
  grilla_delivered_at date,                                    -- fecha de entrega de la grilla
  piezas_desc         text,                                    -- descripción de piezas (alternativa al link en el brief)
  status              text not null default 'solicitada',
  submitted           boolean not null default false,          -- true = brief enviado a la coordinadora
  piezas_totales      int not null default 0,
  piezas_editadas     int not null default 0,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint av_pautas_status_check check (
    status in ('solicitada', 'programada', 'realizada', 'declinada')
  ),
  constraint av_pautas_formats_check check (
    formats <@ array['V', 'R', 'F']::text[]
  )
);

alter table public.av_pautas enable row level security;

-- Lectura: cualquier autenticado (scope por línea se filtra client-side, mismo criterio
-- que fixed_task_marks/meetings).
create policy "av_pautas_select" on public.av_pautas
  for select to authenticated
  using (true);

-- Escritura: la coordinadora de audiovisual (o dirección) gestiona cualquier línea;
-- una jefa de línea (audiovisual.manage) solo la suya. Reusa los helpers security-definer
-- de 20260709000000_tasks_line_scoped_rls.sql.
create policy "av_pautas_insert" on public.av_pautas
  for insert to authenticated
  with check (
    user_can('audiovisual.coordina')
    or (
      user_can('audiovisual.manage')
      and (task_user_view_all() or task_user_in_line(line_id::text))
    )
  );

create policy "av_pautas_update" on public.av_pautas
  for update to authenticated
  using (
    user_can('audiovisual.coordina')
    or (
      user_can('audiovisual.manage')
      and (task_user_view_all() or task_user_in_line(line_id::text))
    )
  )
  with check (
    user_can('audiovisual.coordina')
    or (
      user_can('audiovisual.manage')
      and (task_user_view_all() or task_user_in_line(line_id::text))
    )
  );

create policy "av_pautas_delete" on public.av_pautas
  for delete to authenticated
  using (
    user_can('audiovisual.coordina')
    or (
      user_can('audiovisual.manage')
      and (task_user_view_all() or task_user_in_line(line_id::text))
    )
  );

-- Realtime: calendario/tabla en vivo entre usuarios (patrón meetings/fixed_task_marks).
alter publication supabase_realtime add table public.av_pautas;

create index if not exists av_pautas_company_date_idx on public.av_pautas (company_id, pauta_date);
create index if not exists av_pautas_line_date_idx on public.av_pautas (line_id, pauta_date);

-- ── Seed de capacidades por defecto ──────────────────────────────────────────
-- audiovisual.manage    → nivel 2+ (jefes/coordinadores solicitan y editan su línea)
-- audiovisual.coordina  → depto Audiovisual (department_id=2) nivel 2+, o dirección
--                          (nivel 4/admin) — agenda/aprueba cualquier línea.
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'audiovisual.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'audiovisual.coordina',
       '{"rules":[
          {"all":[{"type":"department","value":null,"ids":[2]},{"type":"min_level","value":2,"ids":[]}]},
          {"all":[{"type":"min_level","value":4,"ids":[]}]}
        ]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
