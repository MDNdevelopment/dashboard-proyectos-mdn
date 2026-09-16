import {
  getWriterPool,
  assertNonEmptyString,
  requiredCompanyId,
  buildSet,
  ValidationError,
} from './mcpWrite.js'
import { runInternalQuery } from './db.js'

const MODALITIES = ['presencial', 'videollamada']
const STATUSES = ['programada', 'realizada', 'cancelada']

const MEETING_UPDATE_COLUMNS = [
  'title',
  'starts_at',
  'ends_at',
  'notes',
  'attendee_ids',
  'status',
  'minuta_url',
  'minuta_text',
  'modality',
  'location',
  'meeting_url',
  'client_id',
  'client_name',
  'client_ids',
  'client_names',
  'line_id',
  'line_ids',
  'updated_at',
]

const RETURNING = `id, title, starts_at, ends_at, modality, location, meeting_url, status,
  attendee_ids, client_names, created_at, updated_at`

function assertValidModality(modality) {
  if (modality !== undefined && !MODALITIES.includes(modality)) {
    throw new ValidationError(`modality debe ser uno de: ${MODALITIES.join(', ')}`)
  }
}

function assertValidStatus(status) {
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new ValidationError(`status debe ser uno de: ${STATUSES.join(', ')}`)
  }
}

/**
 * Port de resolveClientsSnapshot (src/components/reuniones/meetingsApi.js): los
 * arreglos client_ids/client_names/line_ids son posicionales (índice i = misma
 * marca en los tres) y los escalares client_id/client_name/line_id son siempre
 * la posición 0 (compatibilidad hacia atrás con Uso, MAPPI y este mismo MCP).
 * El orden de un `= any($1)` no está garantizado — se reconstruye con un Map,
 * igual que la versión JS, en vez de confiar en el orden de retorno de la query.
 */
async function resolveClientsSnapshot(clientIds) {
  const ids = (clientIds ?? []).filter(Boolean)
  if (ids.length === 0) {
    return {
      client_ids: [],
      client_names: [],
      line_ids: [],
      client_id: null,
      client_name: null,
      line_id: null,
    }
  }
  const { rows } = await runInternalQuery(
    'select id, name, line_id from public.metric_clients where id = any($1)',
    [ids],
  )
  const byId = new Map(rows.map((c) => [c.id, c]))
  const client_names = ids.map((id) => byId.get(id)?.name ?? '')
  const line_ids = ids.map((id) => byId.get(id)?.line_id ?? null)
  return {
    client_ids: ids,
    client_names,
    line_ids,
    client_id: ids[0],
    client_name: client_names[0] || null,
    line_id: line_ids[0],
  }
}

/**
 * Crea una reunión desde el MCP de escritura. Replica
 * src/components/reuniones/meetingsApi.js#createMeeting: snapshot posicional de
 * clientes + exclusión mutua de modalidad (solo se persiste `location` o
 * `meeting_url`, según cuál corresponda). `status` nace en 'programada'.
 */
export async function createMeeting({
  title,
  starts_at: startsAt,
  ends_at: endsAt,
  modality = 'presencial',
  location,
  meeting_url: meetingUrl,
  notes,
  attendee_ids: attendeeIds,
  client_ids: clientIds,
  created_by: createdBy,
}) {
  assertNonEmptyString(title, 'title')
  assertNonEmptyString(startsAt, 'starts_at')
  assertValidModality(modality)

  const companyId = requiredCompanyId()
  const snapshot = await resolveClientsSnapshot(clientIds)

  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      `insert into public.meetings
         (company_id, title, starts_at, ends_at, modality, location, meeting_url, notes,
          attendee_ids, status, created_by,
          client_id, client_name, client_ids, client_names, line_id, line_ids)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'programada', $10, $11, $12, $13, $14, $15, $16)
       returning ${RETURNING}`,
      [
        companyId,
        title.trim(),
        startsAt,
        endsAt || null,
        modality,
        modality === 'presencial' ? location || null : null,
        modality === 'videollamada' ? meetingUrl || null : null,
        notes || null,
        Array.isArray(attendeeIds) ? attendeeIds : [],
        createdBy || null,
        snapshot.client_id,
        snapshot.client_name,
        snapshot.client_ids,
        snapshot.client_names,
        snapshot.line_id,
        snapshot.line_ids,
      ],
    )
    return result.rows[0]
  } finally {
    client.release()
  }
}

/**
 * Actualiza una reunión desde el MCP de escritura (patch parcial) — cubre
 * editar, reagendar, marcar realizada/cancelar/desmarcar, todo vía `status`, en
 * vez de una tool por acción. Replica tres reglas de meetingsApi.js: la
 * exclusión mutua de modalidad; el snapshot de clientes SOLO si `client_ids`
 * viene en el patch (omitir la clave deja los clientes intactos, `[]` los
 * vacía); y la red de seguridad de MeetingModal.jsx — reagendar (`starts_at`)
 * una reunión `realizada` sin pedir `status` explícito la vuelve `programada`.
 * `updated_at` se setea a mano: la tabla no tiene trigger de auto-update.
 */
export async function updateMeeting({ id, created_by: _createdBy, ...fields }) {
  assertNonEmptyString(id, 'id')
  assertValidModality(fields.modality)
  assertValidStatus(fields.status)

  const companyId = requiredCompanyId()
  const patch = {}

  if (fields.title !== undefined) patch.title = assertNonEmptyString(fields.title, 'title')
  if (fields.starts_at !== undefined) patch.starts_at = fields.starts_at
  if (fields.ends_at !== undefined) patch.ends_at = fields.ends_at || null
  if (fields.notes !== undefined) patch.notes = fields.notes || null
  if (fields.attendee_ids !== undefined) patch.attendee_ids = fields.attendee_ids
  if (fields.status !== undefined) patch.status = fields.status
  if (fields.minuta_url !== undefined) patch.minuta_url = fields.minuta_url || null
  if (fields.minuta_text !== undefined) patch.minuta_text = fields.minuta_text?.trim() || null
  if (fields.modality !== undefined) {
    patch.modality = fields.modality
    patch.location = fields.modality === 'presencial' ? fields.location || null : null
    patch.meeting_url = fields.modality === 'videollamada' ? fields.meeting_url || null : null
  }
  if (fields.client_ids !== undefined) {
    Object.assign(patch, await resolveClientsSnapshot(fields.client_ids))
  }

  if (patch.starts_at !== undefined && patch.status === undefined) {
    const { rows } = await runInternalQuery(
      'select status from public.meetings where id = $1 and company_id = $2',
      [id, companyId],
    )
    if (rows[0]?.status === 'realizada') patch.status = 'programada'
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError('No se indicó ningún campo para actualizar')
  }
  patch.updated_at = new Date().toISOString()

  const { clauses, values } = buildSet(patch, MEETING_UPDATE_COLUMNS, 1)
  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      `update public.meetings set ${clauses.join(', ')}
       where id = $${values.length + 1} and company_id = $${values.length + 2}
       returning ${RETURNING}`,
      [...values, id, companyId],
    )
    if (result.rowCount === 0) throw new ValidationError('Reunión no encontrada')
    return result.rows[0]
  } finally {
    client.release()
  }
}

/** Elimina una reunión — borrado duro, igual que meetingsApi.js#deleteMeeting (meetings no tiene soft-delete). */
export async function deleteMeeting({ id }) {
  assertNonEmptyString(id, 'id')
  const companyId = requiredCompanyId()
  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      'delete from public.meetings where id = $1 and company_id = $2 returning id',
      [id, companyId],
    )
    if (result.rowCount === 0) throw new ValidationError('Reunión no encontrada')
    return result.rows[0]
  } finally {
    client.release()
  }
}
