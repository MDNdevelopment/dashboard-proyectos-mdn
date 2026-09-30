-- La jefa de una línea (`metric_line_members.is_lead`) puede gestionar los recursos
-- (`av_pautas.recurso_ids`, `grabacion_por_formato`) y las piezas (`av_pauta_piezas`,
-- incluido `editor_user_id`) de las pautas de SU línea — típicamente para completar
-- quién capturó y quién editó en una pauta ya realizada.
--
-- Antes solo podían quien coordina (`audiovisual.coordina`, un único usuario), quien
-- tenga `audiovisual.pautas.gestion` (capability GLOBAL: habilita cualquier pauta de
-- cualquier línea) y el recurso ya asignado a la pauta. Una jefa de línea quedaba en
-- solo lectura sobre sus propias pautas, y la única forma de habilitarla era darle poder
-- sobre las pautas de las demás líneas.
--
-- Se elige el liderazgo de línea (dato que ya existe y ya gobierna el alcance de Métricas,
-- Chequeo, CNP y el aviso de recursos archivados) en vez de una capability nueva porque el
-- permiso pedido es por ALCANCE, no por persona: cualquier jefa, presente o futura, sobre
-- las pautas de su línea y solo de su línea. Una capability no puede expresar ese "de su
-- línea" — el evaluador de `module_permissions` solo mira el perfil del usuario, nunca la
-- fila que se está tocando.
--
-- Fuera de alcance a propósito: las pautas con `line_id` nulo (cuentas sin línea, que la
-- UI agrupa bajo "Independientes") no pertenecen a ninguna jefa y siguen reservadas a
-- coordinación. Espejo en frontend: `canEditPiezasForPauta` en src/utils/audiovisual.js.

-- ─── Helpers ──────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER para poder leer `metric_line_members` sin depender de las policies de
-- esa tabla (mismo patrón que `user_can`). `metric_line_members.user_id` es text, de ahí
-- el cast de auth.uid().

create or replace function public.user_leads_line(p_line_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select p_line_id is not null
    and exists (
      select 1
      from public.metric_line_members m
      where m.line_id = p_line_id
        and m.user_id = auth.uid()::text
        and m.is_lead
    );
$function$;

create or replace function public.user_leads_av_pauta(p_pauta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.av_pautas p
    where p.id = p_pauta_id
      and public.user_leads_line(p.line_id)
  );
$function$;

-- ─── Piezas: sumar a la jefa de la línea de la pauta ──────────────────────────

drop policy "av_pauta_piezas_insert" on public.av_pauta_piezas;
drop policy "av_pauta_piezas_update" on public.av_pauta_piezas;
drop policy "av_pauta_piezas_delete" on public.av_pauta_piezas;

create policy "av_pauta_piezas_insert" on public.av_pauta_piezas
  for insert to authenticated
  with check (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.pautas.gestion')
    or user_leads_av_pauta(pauta_id)
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
    or user_leads_av_pauta(pauta_id)
    or auth.uid()::text = editor_user_id
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  )
  with check (
    user_can('audiovisual.coordina')
    or user_can('audiovisual.pautas.gestion')
    or user_leads_av_pauta(pauta_id)
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
    or user_leads_av_pauta(pauta_id)
    or exists (
      select 1 from public.av_pautas p
      where p.id = pauta_id and auth.uid()::text = any(p.recurso_ids)
    )
  );

-- ─── Recursos: sumar a la jefa en el trigger de columna ───────────────────────
--
-- `recurso_ids` no está protegido por RLS sino por un trigger de columna
-- (20260929000001_audiovisual_pautas_gestion_capability.sql): `av_pautas_update` es una
-- policy de FILA y no puede distinguir qué columna cambió.
--
-- Se evalúa `old.line_id` (no `new`): contra `new` cualquiera podría mover la pauta a su
-- propia línea en el mismo UPDATE y pasar el check — mismo motivo por el que ya se compara
-- contra `old.recurso_ids`.
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
      or user_leads_line(old.line_id)
      or auth.uid()::text = any(old.recurso_ids)
    )
  then
    raise exception 'No autorizado para modificar los recursos de esta pauta';
  end if;
  return new;
end;
$function$;
