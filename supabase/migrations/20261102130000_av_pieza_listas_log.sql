-- Registro de avances de edición: cuántas unidades de cada lote de `av_pauta_piezas` estaban
-- listas en cada momento.
--
-- Hasta ahora un lote solo guarda el contador `listas` ACTUAL, sin fecha, así que el score de
-- edición (ver docs/arquitectura/evaluaciones.md) no podía saber si una pieza se entregó a
-- tiempo: un video de septiembre editado en octubre contaba como bien editado. Esta tabla es
-- append-only y guarda el valor ABSOLUTO de `listas` (no la diferencia) cada vez que cambia,
-- para responder "¿cuántas estaban listas el día X?" aunque haya correcciones (botón −).
--
-- No depende de la regla de plazo (fecha de entrega, fin de mes, N días): solo acumula
-- historia desde que se aplica; lo anterior no se puede reconstruir, por eso va primero.
create table if not exists public.av_pieza_listas_log (
  id             bigint generated always as identity primary key,
  company_id     text not null,
  pieza_id       uuid not null references public.av_pauta_piezas(id) on delete cascade,
  pauta_id       uuid not null references public.av_pautas(id) on delete cascade,
  formato        text,
  editor_user_id text,
  listas         int not null check (listas >= 0),
  -- 'trigger': cambio real registrado. 'seed': foto inicial de un lote que ya existía antes
  -- de esta tabla — `at` es su último updated_at, NO el momento real en que alcanzó ese valor.
  origen         text not null default 'trigger' check (origen in ('trigger', 'seed')),
  at             timestamptz not null default now()
);

create index if not exists av_pieza_listas_log_pieza_at_idx
  on public.av_pieza_listas_log (pieza_id, at desc);
create index if not exists av_pieza_listas_log_company_at_idx
  on public.av_pieza_listas_log (company_id, at);

alter table public.av_pieza_listas_log enable row level security;

-- Lectura: solo la propia empresa. La escritura NO tiene policy: únicamente el trigger
-- (security definer) inserta, nadie puede falsear la historia desde el cliente.
create policy "av_pieza_listas_log_select" on public.av_pieza_listas_log
  for select to authenticated
  using (
    company_id = (select u.company_id::text from public.users u where u.user_id = auth.uid())
  );

revoke insert, update, delete on public.av_pieza_listas_log from anon, authenticated;

-- ── Trigger: registra el valor nuevo cuando cambia `listas` o el editor ──────────────────
create or replace function public.av_pauta_piezas_log_listas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.listas is distinct from old.listas
     or new.editor_user_id is distinct from old.editor_user_id then
    insert into public.av_pieza_listas_log
      (company_id, pieza_id, pauta_id, formato, editor_user_id, listas)
    values
      (new.company_id, new.id, new.pauta_id, new.formato, new.editor_user_id, new.listas);
  end if;
  return null;
end;
$$;

-- AFTER: se dispara cuando `av_pauta_piezas_sync_lote_trigger` (BEFORE) ya normalizó `listas`.
create trigger av_pauta_piezas_log_listas_trigger
after insert or update of listas, editor_user_id on public.av_pauta_piezas
for each row execute function public.av_pauta_piezas_log_listas();

-- ── Foto inicial de los lotes que ya existen ─────────────────────────────────────────────
-- Sin esto, un lote anterior no tendría ninguna fila y no se distinguiría "0 listas" de
-- "no sé": el cálculo debe tratar lo anterior a la primera fila como desconocido.
insert into public.av_pieza_listas_log
  (company_id, pieza_id, pauta_id, formato, editor_user_id, listas, origen, at)
select p.company_id, p.id, p.pauta_id, p.formato, p.editor_user_id, p.listas, 'seed', p.updated_at
from public.av_pauta_piezas p
where not exists (select 1 from public.av_pieza_listas_log l where l.pieza_id = p.id);
