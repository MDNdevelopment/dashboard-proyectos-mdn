-- Bloque 1.3: evaluation_sessions, evaluation_responses y evaluation_comments
-- tenían SELECT/INSERT (y DELETE en sessions y comments) abiertos a
-- using(true) para cualquier authenticated. El módulo está oculto en la UI
-- para todos menos Juan Lauretta, pero cualquiera con acceso a la API podía
-- leer/borrar evaluaciones de desempeño ajenas.
--
-- Regla: evaluado (employee_id), evaluador (manager_id) o quien tenga la
-- capability 'evaluaciones.empleados' (hoy min_level 2 + admin, configurable
-- desde Empresa → Permisos).
--
-- evaluation_responses y evaluation_comments tienen
-- evaluation_id → evaluation_sessions(id) ON DELETE CASCADE: al borrar la
-- sesión, Postgres limpia sus hijos automáticamente sin pasar por el RLS de
-- las tablas hijas, así que no hace falta (ni conviene) una policy de DELETE
-- separada en esas dos tablas.

drop policy if exists "Enable read access for all users" on public.evaluation_sessions;
drop policy if exists "Enable insert for authenticated users only" on public.evaluation_sessions;
drop policy if exists "Enable delete for users based on user_id" on public.evaluation_sessions;

create policy "evaluation_sessions_select"
on public.evaluation_sessions
for select
to authenticated
using (
  employee_id = auth.uid()
  or manager_id = auth.uid()
  or public.user_can('evaluaciones.empleados')
);

create policy "evaluation_sessions_insert"
on public.evaluation_sessions
for insert
to authenticated
with check (
  manager_id = auth.uid()
  or public.user_can('evaluaciones.empleados')
);

create policy "evaluation_sessions_delete"
on public.evaluation_sessions
for delete
to authenticated
using (
  manager_id = auth.uid()
  or public.user_can('evaluaciones.empleados')
);

drop policy if exists "Enable read access for all users" on public.evaluation_responses;
drop policy if exists "Enable insert for authenticated users only" on public.evaluation_responses;

create policy "evaluation_responses_select"
on public.evaluation_responses
for select
to authenticated
using (
  exists (
    select 1 from public.evaluation_sessions es
    where es.id = evaluation_responses.evaluation_id
      and (
        es.employee_id = auth.uid()
        or es.manager_id = auth.uid()
        or public.user_can('evaluaciones.empleados')
      )
  )
);

create policy "evaluation_responses_insert"
on public.evaluation_responses
for insert
to authenticated
with check (
  exists (
    select 1 from public.evaluation_sessions es
    where es.id = evaluation_responses.evaluation_id
      and (
        es.manager_id = auth.uid()
        or public.user_can('evaluaciones.empleados')
      )
  )
);

drop policy if exists "Enable read access for authneticated" on public.evaluation_comments;
drop policy if exists "Enable insert for authenticated users only" on public.evaluation_comments;
drop policy if exists "Enable delete for users based on user_id" on public.evaluation_comments;

create policy "evaluation_comments_select"
on public.evaluation_comments
for select
to authenticated
using (
  exists (
    select 1 from public.evaluation_sessions es
    where es.id = evaluation_comments.evaluation_id
      and (
        es.employee_id = auth.uid()
        or es.manager_id = auth.uid()
        or public.user_can('evaluaciones.empleados')
      )
  )
);

create policy "evaluation_comments_insert"
on public.evaluation_comments
for insert
to authenticated
with check (
  exists (
    select 1 from public.evaluation_sessions es
    where es.id = evaluation_comments.evaluation_id
      and (
        es.manager_id = auth.uid()
        or public.user_can('evaluaciones.empleados')
      )
  )
);
