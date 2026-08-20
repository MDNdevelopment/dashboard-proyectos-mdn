import { useState, useRef } from 'react'
import AttendeePicker from '../reuniones/AttendeePicker'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import {
  createPauta,
  updatePauta,
  deletePauta,
  restorePauta,
  permanentlyDeletePauta,
} from './avPautasApi'
import { fmtDate } from '../../utils/formatDate'
import {
  FORMAT_KEYS,
  FORMAT_LABELS,
  GRILLA_STATUS_LABELS,
  LIFECYCLE_LABELS,
  formatCodes,
  formatDayShort,
  resourceNames,
  requesterName,
  briefComplete,
  visibleSolicitudes,
  grillaStatus,
  piezasProgress,
} from '../../utils/audiovisual'

const PHASES = [
  { key: 'solicitudes', label: 'Solicitudes' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'realizadas', label: 'Realizadas' },
  { key: 'papelera', label: 'Papelera' },
]

/**
 * Tabla de seguimiento de pautas por fase del flujo (Solicitudes → Agenda → Realizadas),
 * con edición inline. `editMode` decide qué columnas son editables:
 *  - 'coordina' → agenda/declina/aprueba, edita fecha-recurso-asistentes, marca realizada
 *  - 'solicita' → arma y envía el brief de sus propias solicitudes
 *  - 'lectura'  → solo ve
 */
export default function AvPhaseTable({
  pautas,
  piezas,
  clients,
  audiovisualUsers,
  allEmployees,
  companyId,
  userId,
  defaultLineId,
  editMode,
  phase,
  onPhaseChange,
  onChanged,
  onDeleted,
  onPautaClick,
}) {
  const [error, setError] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  // Pauta pendiente de borrado DEFINITIVO (irreversible) — distinto de `confirmingId`, que es
  // el doble-clic del soft delete normal. Solo se llega acá desde la Papelera.
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null)
  const [permanentDeleting, setPermanentDeleting] = useState(false)
  const [expandedAttendeesId, setExpandedAttendeesId] = useState(null)
  const [expandedRecursosId, setExpandedRecursosId] = useState(null)
  const tableScrollRef = useRef(null)
  // Los pickers de Recursos y Asistentes son mutuamente excluyentes en una misma fila: abrir
  // uno cierra el otro (evita dos buscadores abiertos a la vez apilados en la misma fila).
  // Al abrir uno, volvemos el scroll horizontal al inicio: esas columnas están al final de la
  // tabla y el panel que se despliega arranca en el borde izquierdo, fuera de vista si el
  // usuario tenía la tabla desplazada a la derecha.
  function scrollTableToStart() {
    const el = tableScrollRef.current
    if (el?.scrollTo) el.scrollTo({ left: 0, behavior: 'smooth' })
    else if (el) el.scrollLeft = 0
  }
  function toggleAttendees(id) {
    setExpandedAttendeesId(id)
    setExpandedRecursosId(null)
    if (id) scrollTableToStart()
  }
  function toggleRecursos(id) {
    setExpandedRecursosId(id)
    setExpandedAttendeesId(null)
    if (id) scrollTableToStart()
  }
  // Borradores 100% locales del rol "solicita" (jefe de línea): no tocan la base de datos
  // hasta el guardado final — ver DraftSolicitudRow. `editMode === 'coordina'` sigue creando
  // de inmediato con `handleCreate` (sin cambios), así que esto siempre queda vacío para ese rol.
  const [drafts, setDrafts] = useState([])
  const [savingDraftId, setSavingDraftId] = useState(null)

  const canCoordinate = editMode === 'coordina'
  const canEdit = editMode !== 'lectura'
  // Empresa entera (no solo Audiovisual): quien solicita una pauta puede ser de cualquier
  // depto — ver requesterName más abajo.
  const employeesById = usersById(allEmployees)

  // La papelera guarda las pautas borradas de cualquiera de las 3 fases (deleted_at seteado
  // por un soft delete, ver avPautasApi.deletePauta) — el resto de las tablas trabaja siempre
  // sobre `activePautas` para que una pauta borrada desaparezca de su fase original.
  const activePautas = pautas.filter((p) => !p.deleted_at)
  const papelera = [...pautas.filter((p) => p.deleted_at)].sort((a, b) =>
    a.deleted_at < b.deleted_at ? 1 : -1,
  )

  const solicitudes = visibleSolicitudes(activePautas, { canCoordinate })
  const declinadas = activePautas.filter((p) => p.status === 'declinada')
  const agenda = [...activePautas.filter((p) => p.status === 'programada')].sort((a, b) =>
    (a.pauta_date || '9999') + (a.salida || '') < (b.pauta_date || '9999') + (b.salida || '')
      ? -1
      : 1,
  )
  const realizadas = activePautas.filter((p) => p.status === 'realizada')

  const counts = {
    solicitudes: solicitudes.length + drafts.length,
    agenda: agenda.length,
    realizadas: realizadas.length,
    papelera: papelera.length,
  }

  async function handleFields(pauta, fields) {
    setError(null)
    const { data, error: err } = await updatePauta(pauta.id, fields)
    if (err) {
      setError(err.message)
      return
    }
    onChanged(data)
  }

  // "+ Solicitar pauta" (rol solicita) agrega un borrador solo en memoria; "+ Agregar pauta"
  // (coordina) sigue creando de inmediato en la base de datos, sin cambios.
  function handleCreate() {
    if (editMode === 'solicita') {
      setDrafts((prev) => [...prev, makeDraft()])
      onPhaseChange('solicitudes')
      return
    }
    handleCreateImmediate()
  }

  async function handleCreateImmediate() {
    setError(null)
    const { data, error: err } = await createPauta(
      companyId,
      { status: 'solicitada', submitted: canCoordinate },
      userId,
      defaultLineId,
    )
    if (err) {
      setError(err.message)
      return
    }
    onChanged(data)
    onPhaseChange('solicitudes')
  }

  function handleDraftField(draftId, field, value) {
    setDrafts((prev) => prev.map((d) => (d._draftId === draftId ? { ...d, [field]: value } : d)))
  }

  function handleRemoveDraft(draftId) {
    setDrafts((prev) => prev.filter((d) => d._draftId !== draftId))
  }

  // Único punto donde un borrador toca la base de datos: se inserta ya completo y ya
  // enviado a la coordinadora (submitted:true) en un solo paso — no existe, para este flujo,
  // el estado intermedio "guardado pero no enviado" que sí tenía el borrador persistido.
  async function handleSaveDraft(draft) {
    if (!briefComplete(draft)) return
    setError(null)
    setSavingDraftId(draft._draftId)
    const { _draftId, ...fields } = draft
    const { data, error: err } = await createPauta(
      companyId,
      { ...fields, status: 'solicitada', submitted: true },
      userId,
      defaultLineId,
    )
    setSavingDraftId(null)
    if (err) {
      setError(err.message)
      return
    }
    setDrafts((prev) => prev.filter((d) => d._draftId !== _draftId))
    onChanged(data)
    onPhaseChange('solicitudes')
  }

  // "Borrar" es un soft delete (deletePauta marca deleted_at) — la pauta pasa a la Papelera
  // en vez de desaparecer, así que se propaga como cualquier otro cambio de campo (onChanged),
  // no como una desaparición.
  async function handleDelete(id) {
    if (confirmingId !== id) {
      setConfirmingId(id)
      return
    }
    setError(null)
    const { data, error: err } = await deletePauta(id)
    if (err) {
      setError(err.message)
      return
    }
    onChanged(data)
    setConfirmingId(null)
  }

  async function handleRestore(id) {
    setError(null)
    const { data, error: err } = await restorePauta(id)
    if (err) {
      setError(err.message)
      return
    }
    onChanged(data)
  }

  // Borrado definitivo: solo alcanzable desde la Papelera (permanentDeleteTarget siempre es
  // una pauta ya con deleted_at seteado). A diferencia del soft delete, acá sí desaparece de
  // verdad — se propaga como `onDeleted`, no `onChanged`.
  async function handlePermanentDelete() {
    if (!permanentDeleteTarget) return
    setPermanentDeleting(true)
    const { error: err } = await permanentlyDeletePauta(permanentDeleteTarget.id)
    setPermanentDeleting(false)
    if (err) {
      setError(err.message)
      setPermanentDeleteTarget(null)
      return
    }
    onDeleted(permanentDeleteTarget.id)
    setPermanentDeleteTarget(null)
  }

  if (!canEdit && pautas.length === 0) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-6 text-center text-[13px] text-[#a29b8c] mb-4">
        Sin pautas registradas en este alcance.
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl mb-4">
      {/* overflow-hidden acotado a esta franja superior (para las esquinas redondeadas del
          card) — NO envuelve la tabla de abajo, para no recortar el dropdown de sugerencias
          del AttendeePicker (position:absolute) que se abre en la fila de Agenda. */}
      <div className="overflow-hidden rounded-t-xl">
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-[13px] px-4 py-2.5">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#ece9df]">
          <h2 className="text-[15px] font-bold text-[#111]">
            Seguimiento de pautas{' '}
            <span className="font-normal text-[#888] text-[13px]">— por fase del flujo</span>
          </h2>
          {canEdit && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-[#111] bg-[#FFB800] px-3 py-1.5 rounded-lg hover:brightness-95"
            >
              + {editMode === 'solicita' ? 'Solicitar pauta' : 'Agregar pauta'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
          {PHASES.map((p) => (
            <button
              key={p.key}
              onClick={() => onPhaseChange(p.key)}
              className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold transition-all ${
                phase === p.key
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800]'
              }`}
            >
              {p.label} <span className="font-mono text-[12px] opacity-70">{counts[p.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={tableScrollRef} className="overflow-x-auto overflow-y-visible min-h-[420px]">
        {phase === 'solicitudes' && (
          <SolicitudesTable
            drafts={drafts}
            savingDraftId={savingDraftId}
            onDraftField={handleDraftField}
            onSaveDraft={handleSaveDraft}
            onRemoveDraft={handleRemoveDraft}
            solicitudes={solicitudes}
            declinadas={declinadas}
            clients={clients}
            employeesById={employeesById}
            canCoordinate={canCoordinate}
            canEdit={canEdit}
            confirmingId={confirmingId}
            onFields={handleFields}
            onDelete={handleDelete}
          />
        )}
        {phase === 'agenda' && (
          <AgendaTable
            agenda={agenda}
            audiovisualUsers={audiovisualUsers}
            allEmployees={allEmployees}
            employeesById={employeesById}
            canCoordinate={canCoordinate}
            confirmingId={confirmingId}
            expandedAttendeesId={expandedAttendeesId}
            onToggleAttendees={toggleAttendees}
            expandedRecursosId={expandedRecursosId}
            onToggleRecursos={toggleRecursos}
            onFields={handleFields}
            onDelete={handleDelete}
          />
        )}
        {phase === 'realizadas' && (
          <RealizadasTable
            realizadas={realizadas}
            piezas={piezas}
            audiovisualUsers={audiovisualUsers}
            employeesById={employeesById}
            confirmingId={confirmingId}
            onDelete={handleDelete}
            onPautaClick={onPautaClick}
          />
        )}
        {phase === 'papelera' && (
          <PapeleraTable
            papelera={papelera}
            employeesById={employeesById}
            onRestore={handleRestore}
            onPermanentDelete={setPermanentDeleteTarget}
          />
        )}
      </div>

      {permanentDeleteTarget && (
        <ConfirmDeleteDialog
          itemName={permanentDeleteTarget.client_name || 'sin cliente'}
          itemLabel="pauta"
          message={
            <>
              Esta acción <strong>no se puede deshacer</strong>. Se eliminará la pauta y todo su
              checklist de piezas. Para confirmar, escribe el nombre exacto del cliente a
              continuación.
            </>
          }
          confirming={permanentDeleting}
          onConfirm={handlePermanentDelete}
          onCancel={() => setPermanentDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Solicitudes ────────────────────────────────────────────────────────────

function SolicitudesTable({
  drafts,
  savingDraftId,
  onDraftField,
  onSaveDraft,
  onRemoveDraft,
  solicitudes,
  declinadas,
  clients,
  employeesById,
  canCoordinate,
  canEdit,
  confirmingId,
  onFields,
  onDelete,
}) {
  return (
    <table className="w-full border-collapse min-w-[960px]">
      <Thead
        cols={[
          'Cliente',
          'Solicitado por',
          'De qué trata',
          'Fecha deseada',
          'Formato',
          'Requerimientos / Grilla',
          'Acción',
          '',
        ]}
      />
      <tbody>
        {drafts.length === 0 && solicitudes.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-[#a29b8c]">
              {canCoordinate
                ? 'No hay solicitudes por agendar en este alcance.'
                : 'Aún no has solicitado pautas.'}
            </td>
          </tr>
        )}
        {drafts.map((draft) => (
          <DraftSolicitudRow
            key={draft._draftId}
            draft={draft}
            clients={clients}
            saving={savingDraftId === draft._draftId}
            onChange={(field, value) => onDraftField(draft._draftId, field, value)}
            onSave={() => onSaveDraft(draft)}
            onRemove={() => onRemoveDraft(draft._draftId)}
          />
        ))}
        {solicitudes.map((p) => (
          <SolicitudRow
            key={p.id}
            pauta={p}
            clients={clients}
            employeesById={employeesById}
            canCoordinate={canCoordinate}
            canEdit={canEdit}
            confirming={confirmingId === p.id}
            onFields={onFields}
            onDelete={onDelete}
          />
        ))}
        {declinadas.length > 0 && (
          <>
            <tr>
              <td
                colSpan={8}
                className="px-3 pt-4 pb-1 text-[11px] font-mono uppercase tracking-wide text-[#b3ac9d]"
              >
                Declinadas
              </td>
            </tr>
            {declinadas.map((p) => (
              <tr key={p.id} className="border-b border-[#f2efe6] opacity-70">
                <td className="px-3 py-2.5 text-[13.5px] text-[#888] line-through">
                  {p.client_name || 'sin cliente'}
                </td>
                <td className="px-3 py-2.5 text-[12px] text-[#999]">
                  {requesterName(p, employeesById) || '—'}
                </td>
                <td className="px-3 py-2.5 text-[12.5px] text-[#999]">{p.tema}</td>
                <td className="px-3 py-2.5 text-[13px] text-[#999]">
                  {formatDayShort(p.pauta_date)}
                </td>
                <td className="px-3 py-2.5">{formatCodes(p) || '—'}</td>
                <td className="px-3 py-2.5 text-[12px] text-[#aaa]">
                  {p.link ? 'grilla adjunta' : p.piezas_desc ? 'piezas descritas' : 'sin grilla'}
                </td>
                <td className="px-3 py-2.5">
                  {canCoordinate && (
                    <button
                      onClick={() => onFields(p, { status: 'solicitada' })}
                      className="apbtn text-[11.5px] font-bold px-2 py-1 rounded-lg border border-[#e0ddd4] text-[#555]"
                    >
                      Reabrir
                    </button>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <DeleteButton id={p.id} confirming={confirmingId === p.id} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </>
        )}
      </tbody>
    </table>
  )
}

function SolicitudRow({
  pauta: p,
  clients,
  employeesById,
  canCoordinate,
  canEdit,
  confirming,
  onFields,
  onDelete,
}) {
  const editableBrief = canCoordinate || (canEdit && !p.submitted)
  const complete = briefComplete(p)

  return (
    <tr className="border-b border-[#f2efe6] align-top">
      <td className="px-2 py-1.5 min-w-[160px]">
        {editableBrief ? (
          <select
            className="input-base input-compact"
            value={p.client_id ?? ''}
            onChange={(e) => onFields(p, { client_id: e.target.value || null })}
          >
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-[14px] font-medium text-[#222]">
            {p.client_name || <span className="text-[#bbb]">sin cliente</span>}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 min-w-[110px]">
        <span className="text-[12px] text-[#888]">{requesterName(p, employeesById) || '—'}</span>
      </td>
      <td className="px-2 py-1.5 min-w-[150px]">
        {editableBrief ? (
          <input
            className="input-base input-compact"
            defaultValue={p.tema ?? ''}
            onBlur={(e) => onFields(p, { tema: e.target.value.trim() })}
            placeholder="Tema / concepto"
          />
        ) : (
          <span className="text-[13.5px] text-[#333]">
            {p.tema || <span className="text-[#bbb]">—</span>}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 min-w-[130px]">
        {editableBrief ? (
          <>
            <input
              type="date"
              className="input-base input-compact"
              defaultValue={p.pauta_date ?? ''}
              onBlur={(e) => onFields(p, { pauta_date: e.target.value || null })}
            />
            <input
              type="time"
              className="input-base input-compact mt-0.5"
              defaultValue={p.salida ?? ''}
              onBlur={(e) => onFields(p, { salida: e.target.value || null })}
            />
          </>
        ) : (
          <span className="text-[13px] text-[#333]">{formatDayShort(p.pauta_date)}</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <FormatToggle pauta={p} canEdit={editableBrief} onFields={onFields} />
      </td>
      <td className="px-2 py-1.5 min-w-[230px]">
        {editableBrief ? (
          <>
            <input
              className="input-base input-compact"
              defaultValue={p.requirements ?? ''}
              onBlur={(e) => onFields(p, { requirements: e.target.value.trim() })}
              placeholder="Requerimientos: herramientas, ropa…"
            />
            <input
              className="input-base input-compact mt-1"
              defaultValue={p.link ?? ''}
              onBlur={(e) => onFields(p, { link: e.target.value.trim() })}
              placeholder="Enlace de la grilla (Drive)"
            />
            <div className="text-[10px] font-mono uppercase tracking-wide text-[#a29b8c] mt-1 mb-0.5">
              — o describe las piezas —
            </div>
            <textarea
              className="input-base input-compact"
              rows={2}
              defaultValue={p.piezas_desc ?? ''}
              onBlur={(e) => onFields(p, { piezas_desc: e.target.value.trim() })}
              placeholder="Ej: 3 reels — promo, testimonio, producto"
            />
            <div className="text-[10.5px] text-[#b98900] mt-1">
              La grilla debe estar colocada al menos 2 días antes de la fecha de la pauta.
            </div>
            {!complete && (
              <div className="text-[11px] text-[#c0392b] mt-0.5">
                Obligatorio: deja el enlace <b>o</b> describe las piezas.
              </div>
            )}
          </>
        ) : (
          <div className="text-[12.5px] text-[#555] space-y-1">
            {p.requirements && <div>{p.requirements}</div>}
            {p.link ? (
              <a
                href={p.link}
                target="_blank"
                rel="noreferrer"
                className="text-[#3b6fd4] underline block"
              >
                ver grilla
              </a>
            ) : (
              <div>{p.piezas_desc || <span className="text-[#bbb]">—</span>}</div>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 min-w-[150px]">
        {canCoordinate ? (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => onFields(p, { status: 'programada', submitted: true })}
              className="text-[11.5px] font-bold px-2.5 py-1 rounded-lg text-white bg-[#1f8a43]"
            >
              Agendar
            </button>
            <button
              onClick={() => onFields(p, { status: 'declinada' })}
              className="text-[11.5px] font-bold px-2.5 py-1 rounded-lg text-[#c0392b] border border-[#f4c9c9] bg-[#fdecec]"
            >
              Declinar
            </button>
          </div>
        ) : p.submitted ? (
          <span className="estado-pill inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#e9f7ec] border border-[#bfe6c8] text-[#1f8a43]">
            ✓ Enviada · por agendar
          </span>
        ) : (
          canEdit && (
            <>
              <button
                disabled={!complete}
                onClick={() => onFields(p, { submitted: true })}
                className={`text-[11.5px] font-bold px-2.5 py-1 rounded-lg ${
                  complete
                    ? 'text-white bg-[#1f8a43] cursor-pointer'
                    : 'text-[#b3ac9d] bg-[#eee9dd] cursor-not-allowed'
                }`}
              >
                Solicitar pauta
              </button>
              {!complete && (
                <div className="text-[10.5px] text-[#a29b8c] mt-0.5">
                  Falta cliente y/o grilla-piezas
                </div>
              )}
            </>
          )
        )}
      </td>
      <td className="px-2 py-1.5">
        <DeleteButton id={p.id} confirming={confirming} onDelete={onDelete} />
      </td>
    </tr>
  )
}

/** Borrador nuevo en memoria — nunca toca la base de datos hasta `handleSaveDraft`. */
function makeDraft() {
  return {
    _draftId: `draft-${
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }`,
    client_id: null,
    tema: '',
    pauta_date: null,
    salida: null,
    formats: [],
    link: '',
    piezas_desc: '',
    requirements: '',
  }
}

/**
 * Fila de un borrador local (rol "solicita"): inputs controlados contra el objeto en
 * memoria — no tiene sentido autoguardar por campo (onBlur) algo que todavía no existe en
 * la base de datos. "Guardar solicitud" es el único punto de contacto con la API; "Cancelar"
 * solo descarta el borrador (nada que borrar del lado del servidor).
 */
function DraftSolicitudRow({ draft, clients, saving, onChange, onSave, onRemove }) {
  const complete = briefComplete(draft)
  return (
    <tr className="border-b border-[#f2efe6] align-top bg-[#fffdf5]">
      <td className="px-2 py-1.5 min-w-[160px]">
        <select
          className="input-base input-compact"
          value={draft.client_id ?? ''}
          onChange={(e) => onChange('client_id', e.target.value || null)}
        >
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="text-[10px] font-mono uppercase tracking-wide text-[#b98900] mt-0.5">
          Sin guardar
        </div>
      </td>
      <td className="px-2 py-1.5 min-w-[110px]">
        <span className="text-[12px] text-[#888]">Tú</span>
      </td>
      <td className="px-2 py-1.5 min-w-[150px]">
        <input
          className="input-base input-compact"
          value={draft.tema}
          onChange={(e) => onChange('tema', e.target.value)}
          placeholder="Tema / concepto"
        />
      </td>
      <td className="px-2 py-1.5 min-w-[130px]">
        <input
          type="date"
          className="input-base input-compact"
          value={draft.pauta_date ?? ''}
          onChange={(e) => onChange('pauta_date', e.target.value || null)}
        />
        <input
          type="time"
          className="input-base input-compact mt-0.5"
          value={draft.salida ?? ''}
          onChange={(e) => onChange('salida', e.target.value || null)}
        />
      </td>
      <td className="px-2 py-1.5">
        <FormatToggle
          pauta={draft}
          canEdit
          onFields={(_, fields) => onChange('formats', fields.formats)}
        />
      </td>
      <td className="px-2 py-1.5 min-w-[230px]">
        <input
          className="input-base input-compact"
          value={draft.requirements}
          onChange={(e) => onChange('requirements', e.target.value)}
          placeholder="Requerimientos: herramientas, ropa…"
        />
        <input
          className="input-base input-compact mt-1"
          value={draft.link}
          onChange={(e) => onChange('link', e.target.value)}
          placeholder="Enlace de la grilla (Drive)"
        />
        <div className="text-[10px] font-mono uppercase tracking-wide text-[#a29b8c] mt-1 mb-0.5">
          — o describe las piezas —
        </div>
        <textarea
          className="input-base input-compact"
          rows={2}
          value={draft.piezas_desc}
          onChange={(e) => onChange('piezas_desc', e.target.value)}
          placeholder="Ej: 3 reels — promo, testimonio, producto"
        />
        <div className="text-[10.5px] text-[#b98900] mt-1">
          La grilla debe estar colocada al menos 2 días antes de la fecha de la pauta.
        </div>
        {!complete && (
          <div className="text-[11px] text-[#c0392b] mt-0.5">
            Obligatorio: deja el enlace <b>o</b> describe las piezas.
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 min-w-[150px]">
        <button
          disabled={!complete || saving}
          onClick={onSave}
          className={`text-[11.5px] font-bold px-2.5 py-1 rounded-lg ${
            complete
              ? 'text-white bg-[#1f8a43] cursor-pointer'
              : 'text-[#b3ac9d] bg-[#eee9dd] cursor-not-allowed'
          }`}
        >
          {saving ? 'Guardando…' : 'Guardar solicitud'}
        </button>
        {!complete && (
          <div className="text-[10.5px] text-[#a29b8c] mt-0.5">Falta cliente y/o grilla-piezas</div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <button
          onClick={onRemove}
          disabled={saving}
          title="Descartar borrador"
          className="text-[12px] font-bold rounded-lg px-2 py-1 text-[#888] hover:bg-[#f2f0e8]"
        >
          Cancelar
        </button>
      </td>
    </tr>
  )
}

// ─── Agenda ─────────────────────────────────────────────────────────────────

function AgendaTable({
  agenda,
  audiovisualUsers,
  allEmployees,
  employeesById,
  canCoordinate,
  confirmingId,
  expandedAttendeesId,
  onToggleAttendees,
  expandedRecursosId,
  onToggleRecursos,
  onFields,
  onDelete,
}) {
  return (
    <table className="w-full border-collapse min-w-[980px]">
      <Thead
        cols={[
          'Cliente',
          'Solicitado por',
          'Fecha',
          'Salida · Llegada',
          'Formato',
          'Lugar',
          'Recursos',
          'Asistentes',
          'Acción',
          '',
        ]}
      />
      <tbody>
        {agenda.length === 0 && (
          <tr>
            <td colSpan={10} className="px-4 py-8 text-center text-[13px] text-[#a29b8c]">
              Nada agendado en este alcance.
            </td>
          </tr>
        )}
        {agenda.map((p) => (
          <AgendaRow
            key={p.id}
            pauta={p}
            audiovisualUsers={audiovisualUsers}
            allEmployees={allEmployees}
            employeesById={employeesById}
            canCoordinate={canCoordinate}
            confirming={confirmingId === p.id}
            expandedAttendees={expandedAttendeesId === p.id}
            onToggleAttendees={onToggleAttendees}
            expandedRecursos={expandedRecursosId === p.id}
            onToggleRecursos={onToggleRecursos}
            onFields={onFields}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  )
}

function AgendaRow({
  pauta: p,
  audiovisualUsers,
  allEmployees,
  employeesById,
  canCoordinate,
  confirming,
  expandedAttendees,
  onToggleAttendees,
  expandedRecursos,
  onToggleRecursos,
  onFields,
  onDelete,
}) {
  const gStatus = grillaStatus(p)
  const expanded = expandedAttendees || expandedRecursos
  return (
    <>
      <tr className="border-b border-[#f2efe6] align-top">
        <td className="px-2 py-1.5 min-w-[170px]">
          <div className="text-[14px] font-medium text-[#222]">{p.client_name || '—'}</div>
          <div className="text-[11.5px] text-[#a29b8c] mt-0.5">{p.tema}</div>
          {(p.link || p.piezas_desc) && (
            <div
              className="text-[10.5px] mt-0.5 font-semibold"
              style={{ color: gStatus === 'incumple' ? '#c0392b' : '#9a7400' }}
            >
              Grilla: {GRILLA_STATUS_LABELS[gStatus]}
            </div>
          )}
        </td>
        <td className="px-2 py-1.5 min-w-[110px]">
          <span className="text-[12px] text-[#888]">{requesterName(p, employeesById) || '—'}</span>
        </td>
        <td className="px-2 py-1.5 min-w-[120px]">
          {canCoordinate ? (
            <input
              type="date"
              className="input-base input-compact"
              defaultValue={p.pauta_date ?? ''}
              onBlur={(e) => onFields(p, { pauta_date: e.target.value || null })}
            />
          ) : (
            <span className="text-[13px]">
              {p.pauta_date ? formatDayShort(p.pauta_date) : 'por agendar'}
            </span>
          )}
        </td>
        <td className="px-2 py-1.5 min-w-[140px]">
          {canCoordinate ? (
            <>
              <input
                type="time"
                className="input-base input-compact"
                defaultValue={p.salida ?? ''}
                onBlur={(e) => onFields(p, { salida: e.target.value || null })}
              />
              <input
                type="time"
                className="input-base input-compact mt-0.5"
                defaultValue={p.llegada ?? ''}
                onBlur={(e) => onFields(p, { llegada: e.target.value || null })}
              />
            </>
          ) : (
            <span className="font-mono text-[12.5px] text-[#555]">
              {p.salida?.slice(0, 5) || '—'} / {p.llegada?.slice(0, 5) || '—'}
            </span>
          )}
        </td>
        <td className="px-2 py-1.5">
          <FormatToggle pauta={p} canEdit={canCoordinate} onFields={onFields} />
        </td>
        <td className="px-2 py-1.5 min-w-[120px]">
          {canCoordinate ? (
            <input
              className="input-base input-compact"
              defaultValue={p.place ?? ''}
              onBlur={(e) => onFields(p, { place: e.target.value.trim() })}
            />
          ) : (
            <span className="text-[13px] text-[#444]">{p.place || '—'}</span>
          )}
        </td>
        <td className="px-2 py-1.5">
          <button
            onClick={() => onToggleRecursos(expandedRecursos ? null : p.id)}
            className="input-base input-compact text-left leading-tight"
          >
            {(p.recurso_ids ?? []).length > 0
              ? `${p.recurso_ids.length} recurso(s)`
              : 'Seleccionar…'}
          </button>
        </td>
        <td className="px-2 py-1.5">
          <button
            onClick={() => onToggleAttendees(expandedAttendees ? null : p.id)}
            className="input-base input-compact text-left leading-tight"
          >
            {(p.attendee_ids ?? []).length > 0
              ? `${p.attendee_ids.length} asistente(s)`
              : 'Seleccionar…'}
          </button>
        </td>
        <td className="px-2 py-1.5">
          {canCoordinate ? (
            <button
              onClick={() =>
                onFields(p, { status: p.status === 'realizada' ? 'programada' : 'realizada' })
              }
              className="text-[11.5px] font-bold px-2.5 py-1 rounded-lg text-white bg-[#1f8a43] whitespace-nowrap"
            >
              Marcar realizada
            </button>
          ) : (
            <span className="text-[11.5px] text-[#a29b8c] italic">solo vista</span>
          )}
        </td>
        <td className="px-2 py-1.5">
          <DeleteButton id={p.id} confirming={confirming} onDelete={onDelete} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#f2efe6] bg-[#faf9f5]">
          <td colSpan={10} className="px-4 py-3">
            {expandedRecursos && (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa]">
                    Recursos (quién graba fotos/video)
                  </p>
                  <button
                    onClick={() => onToggleRecursos(null)}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[#888] hover:bg-[#ece9df] hover:text-[#111]"
                    aria-label="Cerrar selector de recursos"
                    title="Cerrar"
                  >
                    ✕
                  </button>
                </div>
                <AttendeePicker
                  employees={audiovisualUsers}
                  selectedIds={p.recurso_ids ?? []}
                  onChange={(ids) => onFields(p, { recurso_ids: ids })}
                  hideQuickGroups
                />
              </>
            )}
            {expandedAttendees && (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa]">
                    Asistentes
                  </p>
                  <button
                    onClick={() => onToggleAttendees(null)}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[#888] hover:bg-[#ece9df] hover:text-[#111]"
                    aria-label="Cerrar selector de asistentes"
                    title="Cerrar"
                  >
                    ✕
                  </button>
                </div>
                <AttendeePicker
                  employees={allEmployees}
                  selectedIds={p.attendee_ids ?? []}
                  onChange={(ids) => onFields(p, { attendee_ids: ids })}
                  hideQuickGroups
                />
              </>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Realizadas ─────────────────────────────────────────────────────────────

function RealizadasTable({
  realizadas,
  piezas,
  audiovisualUsers,
  employeesById,
  confirmingId,
  onDelete,
  onPautaClick,
}) {
  const audiovisualUsersById = usersById(audiovisualUsers)
  return (
    <table className="w-full border-collapse min-w-[860px]">
      <Thead cols={['Cliente', 'Solicitado por', 'Fecha', 'Recursos', 'Piezas', 'Grilla', '']} />
      <tbody>
        {realizadas.length === 0 && (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-[#a29b8c]">
              Aún no hay realizadas en este alcance.
            </td>
          </tr>
        )}
        {realizadas.map((p) => {
          const pautaPiezas = (piezas ?? []).filter((pz) => pz.pauta_id === p.id)
          const { total, listas, pct } = piezasProgress(pautaPiezas)
          return (
            <tr
              key={p.id}
              onClick={() => onPautaClick?.(p)}
              className="border-b border-[#f2efe6] align-top cursor-pointer hover:bg-[#faf9f5] transition-colors"
            >
              <td className="px-2 py-1.5 min-w-[170px]">
                <div className="text-[14px] font-medium text-[#222]">{p.client_name || '—'}</div>
                <div className="text-[11.5px] text-[#a29b8c] mt-0.5">
                  {p.tema} · {formatCodes(p)}
                </div>
              </td>
              <td className="px-2 py-1.5 min-w-[110px]">
                <span className="text-[12px] text-[#888]">
                  {requesterName(p, employeesById) || '—'}
                </span>
              </td>
              <td className="px-2 py-1.5 text-[13px]">{formatDayShort(p.pauta_date)}</td>
              <td className="px-2 py-1.5 min-w-[130px]">
                <span className="text-[13px] text-[#333]">
                  {resourceNames(p, audiovisualUsersById).join(', ') || '—'}
                </span>
              </td>
              <td className="px-2 py-1.5 min-w-[110px]">
                {total > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12.5px] text-[#555] whitespace-nowrap">
                      {listas}/{total}
                    </span>
                    <div className="w-14 h-1.5 bg-[#f0ede4] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1f8a43] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-[#bbb] text-[12px]">
                    {p.piezas_totales ? `0/${p.piezas_totales}` : 'sin piezas'}
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5">
                {p.link ? (
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] text-[#3b6fd4] underline"
                  >
                    ver grilla
                  </a>
                ) : (
                  <span className="text-[#bbb] text-[12px]">—</span>
                )}
              </td>
              <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <DeleteButton id={p.id} confirming={confirmingId === p.id} onDelete={onDelete} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Papelera ───────────────────────────────────────────────────────────────

function PapeleraTable({ papelera, employeesById, onRestore, onPermanentDelete }) {
  return (
    <table className="w-full border-collapse min-w-[860px]">
      <Thead cols={['Cliente', 'Solicitado por', 'Estado original', 'Eliminada el', '', '']} />
      <tbody>
        {papelera.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-[#a29b8c]">
              La papelera está vacía.
            </td>
          </tr>
        )}
        {papelera.map((p) => (
          <tr key={p.id} className="border-b border-[#f2efe6] align-top opacity-80">
            <td className="px-2 py-1.5 min-w-[170px]">
              <div className="text-[14px] font-medium text-[#222] line-through">
                {p.client_name || 'sin cliente'}
              </div>
              <div className="text-[11.5px] text-[#a29b8c] mt-0.5">
                {p.tema} · {formatCodes(p)}
              </div>
            </td>
            <td className="px-2 py-1.5 min-w-[110px]">
              <span className="text-[12px] text-[#888]">
                {requesterName(p, employeesById) || '—'}
              </span>
            </td>
            <td className="px-2 py-1.5">
              <span className="text-[12px] font-mono text-[#888]">
                {LIFECYCLE_LABELS[p.status] ?? p.status}
              </span>
            </td>
            <td className="px-2 py-1.5 text-[13px] text-[#888]">{fmtDate(p.deleted_at)}</td>
            <td className="px-2 py-1.5">
              <RestoreButton onRestore={() => onRestore(p.id)} />
            </td>
            <td className="px-2 py-1.5">
              <button
                type="button"
                onClick={() => onPermanentDelete(p)}
                title="Eliminar definitivamente"
                className="text-[12px] font-semibold rounded-lg px-2 py-1 text-[#c0392b] hover:bg-[#fdecec] transition-colors whitespace-nowrap"
              >
                Eliminar definitivamente
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RestoreButton({ onRestore }) {
  return (
    <button
      type="button"
      onClick={onRestore}
      title="Restaurar pauta"
      className="flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-2 py-1 text-[#1f8a43] hover:bg-[#e9f7ec] transition-colors"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 7a5 5 0 1 1 1.6 3.7" />
        <path d="M2 3v3.5h3.5" />
      </svg>
      Restaurar
    </button>
  )
}

// ─── Piezas compartidas ─────────────────────────────────────────────────────

function Thead({ cols }) {
  return (
    <thead>
      <tr className="bg-[#faf8f2] border-b border-[#eee9dd] text-[11px] font-mono uppercase tracking-wide text-[#a29b8c]">
        {cols.map((c, i) => (
          <th key={i} className="text-left px-3 py-2.5">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function FormatToggle({ pauta, canEdit, onFields }) {
  const formats = pauta.formats ?? []
  if (!canEdit) {
    return (
      <span className="text-[12px] text-[#555]">
        {formatCodes(pauta) || <span className="text-[#bbb]">—</span>}
      </span>
    )
  }
  return (
    <div className="flex gap-1">
      {FORMAT_KEYS.map((code) => {
        const on = formats.includes(code)
        return (
          <button
            key={code}
            type="button"
            title={FORMAT_LABELS[code]}
            onClick={() =>
              onFields(pauta, {
                formats: on ? formats.filter((c) => c !== code) : [...formats, code],
              })
            }
            className={`w-[26px] h-[26px] border rounded-md text-[12px] font-bold font-mono transition-colors ${
              on
                ? 'bg-[#111] border-[#111] text-[#FFB800]'
                : 'bg-white border-[#e0ddd4] text-[#a29b8c]'
            }`}
          >
            {code}
          </button>
        )
      })}
    </div>
  )
}

function DeleteButton({ id, confirming, onDelete }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onDelete(id)}
        title="Borrar pauta"
        className={`text-[12px] font-bold rounded-lg px-2 py-1 ${
          confirming ? 'text-white bg-[#c0392b]' : 'text-[#c0392b] hover:bg-[#fdecec]'
        }`}
      >
        {confirming ? 'Borrar' : '✕'}
      </button>
    </div>
  )
}

function usersById(users) {
  return new Map(users.map((u) => [u.user_id, u]))
}
