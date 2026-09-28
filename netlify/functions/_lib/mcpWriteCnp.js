import {
  getWriterPool,
  assertNonEmptyString,
  requiredCompanyId,
  buildSet,
  ValidationError,
} from './mcpWrite.js'
import { runInternalQuery } from './db.js'
import { closeBlockedReason } from '../../../src/components/cnp/constants.js'

const STATUSES = ['Pendiente', 'En proceso', 'Por revisar', 'Paralizado', 'Terminado']

// team_checked_*/print_approved_* quedan deliberadamente FUERA de este whitelist: la
// aprobación de impresión es una capability aparte (cnp.print.approve, restringida a
// dos personas concretas vía Empresa → Accesos), distinta de MCP_WRITERS — exponerla
// acá sería una puerta trasera. Se aprueba solo desde el dashboard (ver plan).
const CNP_UPDATE_COLUMNS = [
  'line_id',
  'client_id',
  'client_ids',
  'no_client_note',
  'title',
  'content',
  'assignee_id',
  'refs',
  'notes',
  'due_date',
  'is_print',
  'is_audiovisual',
  'status',
  'pieces',
  'updated_at',
]

const RETURNING = `id, line_id, client_id, client_ids, title, assignee_id, status, is_print,
  is_audiovisual, due_date, team_checked_at, print_approved_at, created_at, updated_at`

function assertValidStatus(status) {
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new ValidationError(`status debe ser uno de: ${STATUSES.join(', ')}`)
  }
}

/**
 * Crea un CNP desde el MCP de escritura. `status` nace en 'Pendiente' (igual
 * que create_task). No acepta las columnas del doble check de impresión — esos
 * checks se hacen siempre desde el dashboard.
 */
export async function createCnp({
  line_id: lineId,
  client_id: clientId,
  client_ids: clientIds,
  no_client_note: noClientNote,
  title,
  content,
  assignee_id: assigneeId,
  refs,
  notes,
  due_date: dueDate,
  is_print: isPrint = false,
  is_audiovisual: isAudiovisual = false,
  created_by: createdBy,
}) {
  assertNonEmptyString(title, 'title')
  // Cliente ya no es obligatorio (trabajo interno sin cliente) — client_ids acepta varias
  // marcas; client_id (compat) sigue aceptado como una sola. Sin ninguno de los dos, el
  // CNP queda sin cliente y no_client_note documenta para quién fue.
  const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : clientId ? [clientId] : []

  const companyId = requiredCompanyId()
  const cleanRefs = isAudiovisual
    ? []
    : Array.isArray(refs)
      ? refs.filter((r) => r?.url?.trim())
      : []

  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      `insert into public.cnp_requests
         (company_id, line_id, client_id, client_ids, no_client_note, title, content,
          assignee_id, refs, notes, due_date, is_print, is_audiovisual, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Pendiente', $14)
       returning ${RETURNING}`,
      [
        companyId,
        lineId || null,
        ids[0] ?? null,
        ids,
        ids.length === 0 ? noClientNote || null : null,
        title.trim(),
        content || null,
        assigneeId || null,
        JSON.stringify(cleanRefs),
        notes || null,
        dueDate || null,
        isAudiovisual ? false : Boolean(isPrint),
        Boolean(isAudiovisual),
        createdBy || null,
      ],
    )
    return result.rows[0]
  } finally {
    client.release()
  }
}

/**
 * Actualiza un CNP desde el MCP de escritura (patch parcial) — cubre editar y
 * cambiar de estado. Replica la regla de negocio de
 * src/components/cnp/constants.js#canCloseCnp: un CNP `is_print` no puede
 * pasar a 'Terminado' sin `team_checked_at` y `print_approved_at` (ninguno de
 * los dos es escribible por esta tool, así que solo pueden haberse marcado
 * desde el dashboard). `updated_at` se setea a mano — la tabla no tiene
 * trigger de auto-update (sí tiene trg_set_cnp_closed_date, que corre solo).
 */
export async function updateCnp({ id, created_by: _createdBy, ...fields }) {
  assertNonEmptyString(id, 'id')
  assertValidStatus(fields.status)

  const companyId = requiredCompanyId()
  const patch = {}

  if (fields.line_id !== undefined) patch.line_id = fields.line_id || null
  // client_ids (varias marcas) manda sobre client_id (compat, una sola) cuando ambos
  // llegan en el mismo patch; cualquiera de los dos puede vaciar el cliente ([] o null).
  if (fields.client_ids !== undefined || fields.client_id !== undefined) {
    const ids =
      fields.client_ids !== undefined
        ? Array.isArray(fields.client_ids)
          ? fields.client_ids.filter(Boolean)
          : []
        : fields.client_id
          ? [fields.client_id]
          : []
    patch.client_ids = ids
    patch.client_id = ids[0] ?? null
    if (ids.length > 0) patch.no_client_note = null
  }
  if (fields.no_client_note !== undefined) patch.no_client_note = fields.no_client_note || null
  if (fields.title !== undefined) patch.title = assertNonEmptyString(fields.title, 'title')
  if (fields.content !== undefined) patch.content = fields.content || null
  if (fields.assignee_id !== undefined) patch.assignee_id = fields.assignee_id || null
  if (fields.refs !== undefined) {
    patch.refs = JSON.stringify(
      Array.isArray(fields.refs) ? fields.refs.filter((r) => r?.url?.trim()) : [],
    )
  }
  if (fields.notes !== undefined) patch.notes = fields.notes || null
  if (fields.due_date !== undefined) patch.due_date = fields.due_date || null
  if (fields.is_audiovisual !== undefined) patch.is_audiovisual = Boolean(fields.is_audiovisual)
  if (fields.is_print !== undefined) {
    patch.is_print = patch.is_audiovisual === true ? false : Boolean(fields.is_print)
  }
  if (fields.status !== undefined) patch.status = fields.status

  if (Object.keys(patch).length === 0) {
    throw new ValidationError('No se indicó ningún campo para actualizar')
  }

  // patch.is_print === false ya alcanza para saber que canCloseCnp da true (regla
  // pura, sin checks que mirar) — se evita la lectura extra en ese caso.
  if (patch.status === 'Terminado' && patch.is_print !== false) {
    const { rows } = await runInternalQuery(
      'select is_print, team_checked_at, print_approved_at from public.cnp_requests where id = $1 and company_id = $2 and deleted_at is null',
      [id, companyId],
    )
    if (rows.length === 0) throw new ValidationError('CNP no encontrado')
    const current = rows[0]
    const isPrint = patch.is_print !== undefined ? patch.is_print : current.is_print
    const blockedReason = closeBlockedReason({
      is_print: isPrint,
      team_checked_at: current.team_checked_at,
      print_approved_at: current.print_approved_at,
    })
    if (blockedReason) throw new ValidationError(blockedReason)
  }

  patch.updated_at = new Date().toISOString()

  const { clauses, values } = buildSet(patch, CNP_UPDATE_COLUMNS, 1)
  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      `update public.cnp_requests set ${clauses.join(', ')}
       where id = $${values.length + 1} and company_id = $${values.length + 2} and deleted_at is null
       returning ${RETURNING}`,
      [...values, id, companyId],
    )
    if (result.rowCount === 0) throw new ValidationError('CNP no encontrado')
    return result.rows[0]
  } finally {
    client.release()
  }
}

/** Elimina un CNP — soft delete (deleted_at), igual que cnpApi.js#softDeleteCnp. */
export async function softDeleteCnp({ id }) {
  assertNonEmptyString(id, 'id')
  const companyId = requiredCompanyId()
  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      `update public.cnp_requests set deleted_at = $1, updated_at = $1
       where id = $2 and company_id = $3 and deleted_at is null
       returning id`,
      [new Date().toISOString(), id, companyId],
    )
    if (result.rowCount === 0) throw new ValidationError('CNP no encontrado')
    return result.rows[0]
  } finally {
    client.release()
  }
}
