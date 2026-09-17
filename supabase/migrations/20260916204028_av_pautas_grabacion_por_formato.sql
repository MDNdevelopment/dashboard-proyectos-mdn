-- Reparto de la GRABACIÓN por formato y por persona.
--
-- Hasta ahora av_pautas.recurso_ids (text[]) decía QUIÉN fue a grabar, pero no cuánto ni
-- de qué formato. AvAnalytics le atribuía a cada recurso el TOTAL completo de la pauta
-- (ver aggregateByResource en utils/audiovisual.js): dos recursos en una pauta de 10
-- piezas producían 20 piezas "grabadas" en el panel. Esta columna guarda el reparto real:
--
--   {"V": {"<user_id>": 3}, "F": {"<user_id>": 40, "ext:<uuid>": 10}}
--
-- Las claves de formato son las mismas de av_pautas.formats (V/R/F, FORMAT_KEYS en
-- utils/audiovisual.js); las claves internas son ids de recurso en el mismo espacio que
-- recurso_ids y av_pauta_piezas.editor_user_id (user_id de empleado, o 'ext:<uuid>' de
-- external_resources — ver externalAsUser).
--
-- RELACIÓN CON "salieron" (piezas_por_formato[code].salieron): "salieron" SIGUE siendo el
-- dato maestro y manual. No se deriva de esta columna a propósito: piezas_totales (y con
-- él el indicador «6. Nº Piezas vs Piezas editadas» de Reportes → Operaciones, vía
-- avPautasApi.countPiezasForLine) se calcula sumando "salieron"; si "salieron" pasara a
-- derivarse del reparto, toda pauta con reparto incompleto haría CAER el número ya
-- reportado. El reparto se concilia en la UI (tope compartido en los steppers + aviso
-- cuando no cuadra), nunca en BD.
--
-- recurso_ids NO se reemplaza ni se deriva: lo consumen la RLS de av_pauta_piezas
-- (20260910000000_av_piezas_restrict_recurso.sql), resourceConflicts, el generador de
-- agenda de WhatsApp y avWorkloadSeed/MAPPI. Sigue siendo la lista autoritativa de quién
-- fue; esta columna solo le agrega cuánto de qué. La UI mantiene la invariante: toda clave
-- de esta columna está también en recurso_ids (ver syncRecursoIds en utils/audiovisual.js).
--
-- Sin backfill: no existe información histórica de cómo se repartió la grabación de las
-- pautas ya realizadas. Repartir el total a ciegas inventaría datos que nunca se
-- capturaron; esas pautas quedan con grabacion_por_formato = '{}' y el panel las marca
-- como estimadas (atribuye el total completo, igual que hacía antes de este cambio) hasta
-- que se completen a mano desde el detalle de cada pauta.
alter table public.av_pautas
  add column if not exists grabacion_por_formato jsonb not null default '{}'::jsonb;

-- Un check no puede usar subqueries; misma técnica que
-- av_pautas_valid_piezas_por_formato (20260909000000_av_pautas_piezas_por_formato.sql).
create or replace function public.av_pautas_valid_grabacion_por_formato(data jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    bool_and(
      e.key in ('V', 'R', 'F')
      and jsonb_typeof(e.value) = 'object'
      and coalesce(
        (
          select bool_and(
            jsonb_typeof(r.value) = 'number'
            and (r.value #>> '{}')::numeric >= 0
          )
          from jsonb_each(e.value) as r(key, value)
        ),
        true
      )
    ),
    true
  )
  from jsonb_each(data) as e(key, value)
$$;

alter table public.av_pautas
  add constraint av_pautas_grabacion_por_formato_check
  check (public.av_pautas_valid_grabacion_por_formato(grabacion_por_formato));

-- Ningún trigger existente se toca: av_pautas_sync_formato_counters (BEFORE INSERT/UPDATE
-- en av_pautas) solo lee/reescribe piezas_por_formato/piezas_totales/piezas_editadas — un
-- UPDATE de grabacion_por_formato lo dispara igual, pero su recálculo es idempotente sobre
-- columnas que esta migración no toca. Los dos caminos legacy/formato de piezas_editadas y
-- countPiezasForLine (avPautasApi.js) quedan intactos.
