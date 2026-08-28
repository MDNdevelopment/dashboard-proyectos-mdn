-- Primera migración de `vacations` en el repo (hasta ahora era tabla externa, ver
-- ARQUITECTURA.md §3.2). Normaliza el vocabulario de `status` (5 valores legado conviviendo
-- con los 2 que la app escribe hoy), cierra el vocabulario con un CHECK, rellena `company_id`
-- (100% NULL hasta ahora) y cierra las policies de RLS que estaban abiertas a `public`.

-- 1) Normalizar `status` a solo 'tentative' | 'confirmed' | 'rejected'.
--    'completed' no se pierde: `resolveVacationStatus` (src/utils/employeeCalendar.js) lo
--    deriva de `end_date` vs hoy, así que colapsarlo en 'confirmed' no cambia lo que ve el
--    usuario — una vacación 'confirmed' con `end_date` pasado se sigue mostrando "Completada".
update vacations
set status = 'tentative'
where status in ('pending', 'programmed', 'programado');

update vacations
set status = 'confirmed'
where status in ('approved', 'fulfilled', 'completed');

-- 2) Cerrar el vocabulario hacia adelante.
alter table vacations
  alter column status set default 'tentative',
  alter column status set not null;

alter table vacations
  add constraint vacations_status_check
  check (status in ('tentative', 'confirmed', 'rejected'));

-- 3) Backfill de `company_id` desde `users.company_id` (scoping real hoy es por `user_id`,
--    ver src/lib/vacations.js).
update vacations v
set company_id = u.company_id
from users u
where v.user_id = u.user_id
  and v.company_id is null;

-- 4) Índice de acceso habitual: por empleado, ordenado por fecha de inicio.
create index if not exists vacations_user_id_start_date_idx
  on vacations (user_id, start_date);

-- 5) RLS: las 4 policies actuales están abiertas a `public` con `USING (true)` (incluido
--    DELETE) — cualquiera con la anon key puede leer/escribir/borrar vacaciones de cualquier
--    empleado. Se reemplazan por las mismas operaciones, restringidas a `authenticated`
--    (mismo criterio que el resto del dashboard: todo usuario autenticado puede operar sobre
--    cualquier fila, sin scoping adicional — ver convención de RLS en ARQUITECTURA.md §5).
drop policy if exists "Enable delete for users based on user_id" on vacations;
drop policy if exists "Enable insert for authenticated users only" on vacations;
drop policy if exists "Enable read access for all users" on vacations;
drop policy if exists "Enable update for users based on email" on vacations;

create policy "Authenticated users can read vacations"
  on vacations for select
  to authenticated
  using (true);

create policy "Authenticated users can insert vacations"
  on vacations for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update vacations"
  on vacations for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete vacations"
  on vacations for delete
  to authenticated
  using (true);
