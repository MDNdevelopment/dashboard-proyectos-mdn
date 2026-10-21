-- `sesion_id`: varias pautas que son UNA MISMA SALIDA física.
--
-- Contexto: `av_pautas` tiene un solo `client_id` escalar, así que una grabación que cubre
-- varias cuentas de un grupo (p. ej. "Grupo San Lucas") se registra como una fila por cuenta,
-- todas el mismo día, a la misma hora y con los mismos `recurso_ids`. Toda la disponibilidad
-- de recursos contaba FILAS, nunca salidas, con dos consecuencias: el recurso aparecía
-- sobrecargado (5 pautas en un día) y, peor, `resourceConflicts` BLOQUEABA asignarlo a la
-- segunda cuenta del grupo porque las horas idénticas se solapan.
--
-- Dos pautas con el mismo `sesion_id` son la misma salida: para la carga de la persona cuentan
-- como una, y entre ellas no hay choque de horario. Se eligió esto en vez de `client_ids
-- uuid[]` (el patrón de meetings/tasks/cnp_requests) porque en Pautas la fila ES la unidad de
-- trabajo: piezas, lotes por formato, ranking de Datos y atribución por línea cuelgan de una
-- pauta de UN cliente. Ver `sesionKey`/`mismaSesion`/`contarSalidas` en utils/audiovisual.js.
--
-- No hace falta tocar RLS: `av_pautas_update` (20260824000000_av_pautas_open_manage_rls.sql)
-- ya cubre cualquier columna para audiovisual.coordina/manage.

alter table public.av_pautas
  add column if not exists sesion_id uuid;

create index if not exists av_pautas_sesion_id_idx
  on public.av_pautas (sesion_id)
  where sesion_id is not null;

-- Backfill del histórico. Las sesiones de aquí en adelante se afirman desde la UI ("es la
-- misma salida"), pero las pautas de grupo ya registradas no tienen ese dato, así que se
-- deducen del único indicio disponible: misma fecha, misma hora de salida y mismo lugar. Es
-- un heurístico y por eso se aplica UNA sola vez, solo a pautas activas con hora conocida.
-- Para deshacerlo: update public.av_pautas set sesion_id = null;
with grupos as (
  select pauta_date,
         salida,
         lugar_tipo,
         coalesce(place, '') as place_key,
         gen_random_uuid()   as sesion
    from public.av_pautas
   where deleted_at is null
     and status in ('programada', 'realizada')
     and salida is not null
   group by pauta_date, salida, lugar_tipo, coalesce(place, '')
  having count(*) > 1
)
update public.av_pautas p
   set sesion_id = g.sesion
  from grupos g
 where p.sesion_id is null
   and p.deleted_at is null
   and p.status in ('programada', 'realizada')
   and p.salida is not null
   and p.pauta_date = g.pauta_date
   and p.salida = g.salida
   and p.lugar_tipo = g.lugar_tipo
   and coalesce(p.place, '') = g.place_key;
