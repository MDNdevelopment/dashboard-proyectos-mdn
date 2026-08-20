/**
 * Capa de acceso a datos de la sub-sección Audiovisual (Tareas Fijas → Audiovisual).
 * Todas las funciones hacen queries a Supabase y retornan { data, error } (o el
 * resultado del insert/update/delete de supabase-js). Mismo patrón que
 * components/reuniones/meetingsApi.js.
 */
import { supabase } from '../../supabase'
import { sumPiezasForLine } from '../../utils/audiovisual'

// ─── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Carga todas las pautas de la empresa (sin filtrar por mes: las solicitudes y las
 * "por agendar" no tienen `pauta_date`, así que un filtro por rango de fecha las
 * ocultaría). El volumen esperado es bajo — mismo criterio de simplicidad que
 * `fixed_task_marks`/`meetings`; el filtrado por mes/línea se hace client-side.
 */
export async function loadPautas(companyId) {
  return supabase
    .from('av_pautas')
    .select('*')
    .eq('company_id', companyId)
    .order('pauta_date', { ascending: true, nullsFirst: false })
}

/**
 * Suma piezas totales/editadas de las pautas 'realizada' de una línea en un mes/año
 * dado — usado por Reportes → Operaciones para sembrar el indicador «6. Nº Piezas vs
 * Piezas editadas» desde AUDIOVISUAL_MODULE_START.
 */
export async function countPiezasForLine(companyId, lineId, { month, year }) {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 1)
  const toISODate = (d) => d.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('av_pautas')
    .select('piezas_totales, piezas_editadas, status')
    .eq('company_id', companyId)
    .eq('line_id', lineId)
    .eq('status', 'realizada')
    .gte('pauta_date', toISODate(monthStart))
    .lt('pauta_date', toISODate(monthEnd))

  if (error) return { piezas: 0, editadas: 0, error }
  return { ...sumPiezasForLine(data ?? []), error: null }
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Resuelve line_id/client_name a partir del client_id elegido (snapshot al momento
 * de crear/editar — si el cliente cambia de línea después, la pauta conserva la
 * línea de cuando se solicitó/agendó). Mismo patrón que meetingsApi.js.
 */
async function resolveClientSnapshot(clientId) {
  if (!clientId) return { client_name: null, line_id: null }
  const { data } = await supabase
    .from('metric_clients')
    .select('name, line_id')
    .eq('id', clientId)
    .maybeSingle()
  return { client_name: data?.name ?? null, line_id: data?.line_id ?? null }
}

export async function createPauta(companyId, fields, createdBy, defaultLineId = null) {
  const snapshot = fields.client_id
    ? await resolveClientSnapshot(fields.client_id)
    : { client_name: null, line_id: defaultLineId }
  return supabase
    .from('av_pautas')
    .insert({
      ...sanitizeFields(fields),
      company_id: companyId,
      client_name: snapshot.client_name,
      line_id: snapshot.line_id ?? defaultLineId,
      created_by: createdBy ?? null,
    })
    .select()
    .single()
}

export async function updatePauta(pautaId, fields) {
  const updates = { ...sanitizeFields(fields), updated_at: new Date().toISOString() }
  if ('client_id' in fields) {
    const snapshot = await resolveClientSnapshot(fields.client_id)
    updates.client_name = snapshot.client_name
    updates.line_id = snapshot.line_id
  }
  return supabase.from('av_pautas').update(updates).eq('id', pautaId).select().single()
}

/**
 * Soft delete (papelera): marca `deleted_at` en vez de borrar físicamente, para poder
 * restaurar la pauta después desde cualquiera de las 3 fases (solicitada/programada/
 * realizada) — mismo patrón que `deleteClient`/`restoreClient` en `metricsApi.js`. Devuelve
 * la fila actualizada (como `updatePauta`), no un simple `{error}`: el llamador la trata
 * como un cambio normal (`onChanged`), no como una desaparición (`onDeleted`).
 */
export async function deletePauta(pautaId) {
  return supabase
    .from('av_pautas')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', pautaId)
    .select()
    .single()
}

export async function restorePauta(pautaId) {
  return supabase.from('av_pautas').update({ deleted_at: null }).eq('id', pautaId).select().single()
}

/**
 * Elimina físicamente una pauta ya en la papelera (irreversible) — solo desde ahí, nunca
 * como acción directa sobre una pauta activa. `av_pauta_piezas.pauta_id` tiene
 * `on delete cascade`, así que su checklist se borra junto con la pauta. Sigue cubierta por
 * la policy RLS `av_pautas_delete` (nunca se removió al introducir el soft delete).
 */
export async function permanentlyDeletePauta(pautaId) {
  return supabase.from('av_pautas').delete().eq('id', pautaId)
}

// ─── Piezas (checklist por editor de una pauta 'realizada') ───────────────────

/**
 * Carga todas las piezas de la empresa (igual criterio de volumen bajo que loadPautas:
 * el filtrado por pauta se hace client-side, agrupando por pauta_id).
 */
export async function loadPiezas(companyId) {
  return supabase
    .from('av_pauta_piezas')
    .select('*')
    .eq('company_id', companyId)
    .order('position', { ascending: true })
}

/** Inserta un lote de piezas nuevas para un editor, continuando `position` desde `startPosition`. */
export async function createPiezas(companyId, pautaId, editorUserId, nombres, startPosition = 0) {
  const rows = nombres.map((nombre, i) => ({
    company_id: companyId,
    pauta_id: pautaId,
    editor_user_id: editorUserId,
    nombre,
    position: startPosition + i,
  }))
  return supabase.from('av_pauta_piezas').insert(rows).select()
}

export async function updatePieza(piezaId, fields) {
  const updates = { ...sanitizePiezaFields(fields), updated_at: new Date().toISOString() }
  return supabase.from('av_pauta_piezas').update(updates).eq('id', piezaId).select().single()
}

export async function deletePiezas(ids) {
  if (!ids?.length) return { data: null, error: null }
  return supabase.from('av_pauta_piezas').delete().in('id', ids)
}

function sanitizePiezaFields(fields) {
  const allowed = ['editor_user_id', 'nombre', 'status', 'position']
  const out = {}
  for (const key of allowed) {
    if (key in fields) out[key] = fields[key] === '' ? null : fields[key]
  }
  // 'nombre' vacío es válido (input en blanco mientras se escribe), no debe pisarse a null.
  if ('nombre' in fields) out.nombre = fields.nombre ?? ''
  return out
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Solo persiste los campos explícitamente presentes en `fields` (updates parciales). */
function sanitizeFields(fields) {
  const allowed = [
    'client_id',
    'tema',
    'place',
    'requirements',
    'has_model',
    'pauta_date',
    'salida',
    'llegada',
    'formats',
    'graba_user_id',
    'graba_other',
    'edita_user_id',
    'edita_other',
    'recurso_ids',
    'attendee_ids',
    'link',
    'grilla_delivered_at',
    'piezas_desc',
    'status',
    'submitted',
    'piezas_totales',
    'piezas_editadas',
  ]
  const out = {}
  for (const key of allowed) {
    if (key in fields) out[key] = fields[key] === '' ? null : fields[key]
  }
  // Los booleanos/arrays/números no deben pisarse por el `=== ''` de arriba.
  if ('has_model' in fields) out.has_model = Boolean(fields.has_model)
  if ('submitted' in fields) out.submitted = Boolean(fields.submitted)
  if ('formats' in fields) out.formats = fields.formats ?? []
  if ('attendee_ids' in fields) out.attendee_ids = fields.attendee_ids ?? []
  if ('recurso_ids' in fields) out.recurso_ids = fields.recurso_ids ?? []
  if ('piezas_totales' in fields) out.piezas_totales = Number(fields.piezas_totales) || 0
  if ('piezas_editadas' in fields) out.piezas_editadas = Number(fields.piezas_editadas) || 0
  return out
}
