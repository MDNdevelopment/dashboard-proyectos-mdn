-- Nueva capability configurable `audiovisual.pautas.gestion`: gestionar recursos
-- (av_pautas.recurso_ids) y piezas (av_pauta_piezas) de CUALQUIER pauta, sin ser
-- audiovisual.coordina. Antes solo se podía dar ese poder volviendo a alguien
-- coordinador (audiovisual.coordina, hoy un único usuario) — no había forma de
-- delegarlo desde Empresa > Accesos.
--
-- No se reutiliza `audiovisual.piezas`: esa key está sembrada a todo el depto
-- Audiovisual y hoy solo alimenta "ver todas las líneas" (canViewAll). Devolverle
-- el poder de edición recrearía el escenario revertido el 2026-09-10 (todo el
-- depto escribiendo piezas de cualquier pauta, ver 20260910000000_av_piezas_
-- restrict_recurso.sql). La capability nueva se siembra copiando las reglas de
-- audiovisual.coordina, así que el día del deploy nadie gana ni pierde acceso.
--
-- El acceso por asignación (recurso_ids / editor_user_id) NO se toca: sigue
-- siendo la base para que grabadores/editores trabajen su propia pauta sin
-- depender de esta capability. Espejo en frontend: canEditPiezasForPauta en
-- src/utils/audiovisual.js.

insert into public.module_permissions (company_id, module_key, rules)
select company_id, 'audiovisual.pautas.gestion', rules
from public.module_permissions
where module_key = 'audiovisual.coordina'
on conflict (company_id, module_key) do update set rules = excluded.rules;

-- ─── Piezas: sumar la capability nueva a las policies existentes ──────────────

drop policy "av_pauta_piezas_insert" on public.av_pauta_piezas;
drop policy "av_pauta_piezas_update" on public.av_pauta_piezas;
drop policy "av_pauta_piezas_delete" on public.av_pauta_piezas;

create policy "av_pauta_piezas_insert" on public.av_pauta_piezas
  for insert to authenticated
  with check (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.pautas.gestion')
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );

create policy "av_pauta_piezas_update" on public.av_pauta_piezas
  for update to authenticated
  using (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.pautas.gestion')
    or auth.uid()::text = editor_user_id
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  )
  with check (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.pautas.gestion')
    or auth.uid()::text = editor_user_id
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );

create policy "av_pauta_piezas_delete" on public.av_pauta_piezas
  for delete to authenticated
  using (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.pautas.gestion')
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );

-- ─── Recursos: cerrar el hueco de av_pautas_update ────────────────────────────
--
-- av_pautas_update es una policy de FILA: exige audiovisual.coordina o
-- audiovisual.manage (hoy abierto a propósito, cualquier empleado) o ser parte
-- de recurso_ids. No puede distinguir "cambió recurso_ids" de "cambió
-- grabacion_por_formato/piezas_por_formato", así que no se puede endurecer sin
-- romper al recurso asignado, que sí debe poder escribir esas otras columnas.
-- Se protege recurso_ids específicamente con un trigger de columna, mismo
-- patrón que prevent_users_privilege_escalation
-- (20260828160000_fix_users_rls_privilege_escalation.sql): RLS no puede acotar
-- columnas individuales de una fila que el usuario sí puede tocar.
--
-- Se compara contra OLD.recurso_ids (no NEW): contra NEW cualquiera podría
-- autoasignarse en el mismo UPDATE y pasar el check.
--
-- Cambio de comportamiento intencional: hoy cualquier empleado con
-- audiovisual.manage puede reasignar recurso_ids. Tras esto solo pueden
-- coordinación, quien tenga audiovisual.pautas.gestion, y los recursos ya
-- asignados a esa pauta.
create or replace function public.prevent_av_pautas_recurso_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.recurso_ids is distinct from old.recurso_ids
    and not (
      user_can('audiovisual.coordina')
      or user_can('audiovisual.pautas.gestion')
      or auth.uid()::text = any(old.recurso_ids)
    )
  then
    raise exception 'No autorizado para modificar los recursos de esta pauta';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_prevent_av_pautas_recurso_escalation on public.av_pautas;

create trigger trg_prevent_av_pautas_recurso_escalation
before update on public.av_pautas
for each row execute function public.prevent_av_pautas_recurso_escalation();
