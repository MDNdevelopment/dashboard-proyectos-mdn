-- Tabla "av_pauta_piezas": checklist de piezas por pauta audiovisual, repartidas entre
-- varios editores (módulo Pautas → pestaña «Realizadas»).
--
-- Antes, la edición se resolvía con dos columnas sueltas en av_pautas: un único
-- edita_user_id/edita_other y dos contadores (piezas_totales/piezas_editadas). Eso no
-- alcanza cuando una pauta produce varias piezas repartidas entre distintos editores y
-- cada una avanza por su propio estado. `edita_user_id`/`edita_other` NO se eliminan de
-- av_pautas: quedan como legacy para el histórico anterior a esta tabla (aggregateByResource
-- sigue leyéndolos como fallback cuando una pauta no tiene piezas).
--
-- piezas_totales sigue siendo un número manual (lo carga el coordinador en el modal de
-- detalle) — es la meta a repartir entre editores, no se deriva de esta tabla. En cambio
-- piezas_editadas SÍ se deriva: el trigger de abajo la recalcula como el conteo de piezas
-- en status='listo', para no romper avPautasApi.countPiezasForLine ni el indicador «6. Nº
-- Piezas vs Piezas editadas» del reporte de Operaciones (constants.js/OperacionesView.jsx),
-- que siguen leyendo av_pautas.piezas_editadas sin cambios.
create table public.av_pauta_piezas (
  id             uuid primary key default gen_random_uuid(),
  pauta_id       uuid not null references public.av_pautas(id) on delete cascade,
  company_id     text not null,
  editor_user_id uuid references public.users(user_id) on delete set null,
  nombre         text not null default '',
  status         text not null default 'pendiente',
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint av_pauta_piezas_status_check check (
    status in ('pendiente', 'en_edicion', 'espera_aprobacion', 'listo', 'cancelado')
  )
);

alter table public.av_pauta_piezas enable row level security;

-- Lectura: cualquier autenticado (mismo criterio que av_pautas).
create policy "av_pauta_piezas_select" on public.av_pauta_piezas
  for select to authenticated
  using (true);

-- Escritura: mismo criterio abierto que av_pautas desde 20260824000000 — cualquier
-- empleado con audiovisual.coordina o audiovisual.manage administra piezas de cualquier
-- pauta de la empresa (no hay membresía de línea que chequear a este nivel).
create policy "av_pauta_piezas_insert" on public.av_pauta_piezas
  for insert to authenticated
  with check (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  );

create policy "av_pauta_piezas_update" on public.av_pauta_piezas
  for update to authenticated
  using (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  )
  with check (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  );

create policy "av_pauta_piezas_delete" on public.av_pauta_piezas
  for delete to authenticated
  using (
    user_can('audiovisual.coordina') or user_can('audiovisual.manage')
  );

-- Realtime: checklist en vivo entre usuarios (patrón av_pautas).
alter publication supabase_realtime add table public.av_pauta_piezas;

create index av_pauta_piezas_pauta_idx on public.av_pauta_piezas (pauta_id, position);
create index av_pauta_piezas_editor_idx on public.av_pauta_piezas (editor_user_id);

-- ── Trigger: deriva av_pautas.piezas_editadas del checklist ──────────────────────
-- Se dispara con cualquier insert/update/delete de piezas y recalcula, para la pauta
-- afectada, piezas_editadas = cantidad de piezas en status='listo'. piezas_totales no se
-- toca acá: sigue siendo el número manual que carga el coordinador.
create or replace function public.av_pauta_piezas_sync_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pauta_id uuid;
begin
  target_pauta_id := coalesce(new.pauta_id, old.pauta_id);
  update public.av_pautas
  set piezas_editadas = (
    select count(*) from public.av_pauta_piezas
    where pauta_id = target_pauta_id and status = 'listo'
  )
  where id = target_pauta_id;
  return null;
end;
$$;

create trigger av_pauta_piezas_sync_counters_trigger
after insert or update or delete on public.av_pauta_piezas
for each row execute function public.av_pauta_piezas_sync_counters();
