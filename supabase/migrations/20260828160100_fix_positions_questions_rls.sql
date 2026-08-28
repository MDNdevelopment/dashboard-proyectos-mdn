-- Bloque 1.2: positions y questions tenían DELETE (ambas) y UPDATE (positions)
-- abiertos al rol "public" (sin login). Ninguna de las dos pantallas que
-- escriben estas tablas (DepartmentsView/PositionModal, QuestionsView/
-- QuestionModal) valida capability en el frontend, así que la protección
-- tiene que salir de RLS. Se alinea con el nivel de entrada de la pestaña
-- de Empresa desde donde se gestiona cada una:
--   - positions se gestiona desde Departamentos (empresa.departamentos, min_level 2).
--   - questions se gestiona desde Preguntas (empresa.preguntas, min_level 4,
--     con la excepción de Sofía Lauretta ya vigente en esa capability).

drop policy if exists "User can delete" on public.positions;
drop policy if exists "Enable update for users based on email" on public.positions;
drop policy if exists "Enable insert for authenticated users only" on public.positions;

create policy "positions_insert_dept_manage"
on public.positions
for insert
to authenticated
with check (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 2
);

create policy "positions_update_dept_manage"
on public.positions
for update
to authenticated
using (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 2
)
with check (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 2
);

create policy "positions_delete_dept_manage"
on public.positions
for delete
to authenticated
using (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 2
);

drop policy if exists "authenticated can delete" on public.questions;
drop policy if exists "Enable update for users based on email" on public.questions;
drop policy if exists "Enable insert for authenticated users only" on public.questions;

create policy "questions_insert_preguntas_manage"
on public.questions
for insert
to authenticated
with check (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 4
  or auth.uid() = '457bad92-e853-4c0a-ac46-11fb1fdc4d3c'
);

create policy "questions_update_preguntas_manage"
on public.questions
for update
to authenticated
using (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 4
  or auth.uid() = '457bad92-e853-4c0a-ac46-11fb1fdc4d3c'
)
with check (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 4
  or auth.uid() = '457bad92-e853-4c0a-ac46-11fb1fdc4d3c'
);

create policy "questions_delete_preguntas_manage"
on public.questions
for delete
to authenticated
using (
  coalesce((select admin from public.users where user_id = auth.uid()), false)
  or coalesce((select access_level from public.users where user_id = auth.uid()), 1) >= 4
  or auth.uid() = '457bad92-e853-4c0a-ac46-11fb1fdc4d3c'
);
