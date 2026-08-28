import { useState } from 'react'
import {
  LIFECYCLE_LABELS,
  GRILLA_STATUS_LABELS,
  PIEZA_STATUS_META,
  PIEZA_STATUS_ORDER,
  formatCodes,
  formatTime12,
  formatDayShort,
  resourceNames,
  grillaStatus,
  piezasProgress,
  piezasByEditor,
  defaultPiezaName,
  pautaErrorMessage,
} from '../../utils/audiovisual'
import { createPiezas, deletePiezas, updatePieza } from './avPautasApi'
import Avatar from '../Avatar'
import AttendeePicker from '../reuniones/AttendeePicker'
import StatusPill from '../common/StatusPill'

// Misma paleta de status que los puntos del calendario (AvCalendar.jsx → DOT_COLOR),
// pero como pill de texto+fondo para el header del modal.
const STATUS_BADGE = {
  solicitada: { bg: '#fdf4de', text: '#9a7400' },
  programada: { bg: '#e6f0ff', text: '#2563eb' },
  realizada: { bg: '#e9f7ec', text: '#1f8a43' },
  declinada: { bg: '#f2f0ea', text: '#888' },
}

/**
 * Modal de detalle de una pauta — se abre al hacer clic en el calendario o en una fila de
 * la tabla de seguimiento (mismo patrón que ProjectDetailModal.jsx: panel flex-col con
 * header/footer fijos y body scrolleable, ver src/test/modalLayout.test.jsx).
 *
 * Cuando la pauta está 'realizada', además de la info de siempre se muestra la sección de
 * edición: piezas totales (número manual), editores asignados (AttendeePicker, igual que
 * recursos/asistentes en AvPhaseTable) y, debajo de cada uno, su checklist de piezas —
 * nombre editable + selector de estado (StatusPill). `piezas_editadas` NO se edita acá: la
 * deriva un trigger en BD a partir de cuántas piezas quedan en 'listo'.
 */
export default function PautaDetailModal({
  pauta,
  usersById,
  audiovisualUsers,
  piezas,
  canCoordinate,
  companyId,
  onFields,
  onPiezaChanged,
  onPiezaDeleted,
  onClose,
}) {
  if (!pauta) return null
  const codes = formatCodes(pauta) || '—'
  const recs = resourceNames(pauta, usersById)
  const rec = recs.length ? recs.join(', ') : 'sin asignar'
  const status = grillaStatus(pauta)
  const badge = STATUS_BADGE[pauta.status] ?? STATUS_BADGE.declinada
  const attendees = (pauta.attendee_ids ?? [])
    .map((id) => usersById.get(id))
    .filter(Boolean)
    .map((u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#eeebe0] flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-[18px] font-semibold text-[#111] tracking-[-0.01em]">
              {pauta.client_name ?? '—'}
            </h2>
            <span
              className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wide"
              style={{ background: badge.bg, color: badge.text }}
            >
              {LIFECYCLE_LABELS[pauta.status]}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div className="space-y-2.5">
            <DetailRow
              icon={<IconCamera />}
              text={`(${codes}: ${rec.toUpperCase()})${pauta.tema ? ` · ${pauta.tema}` : ''}`}
            />
            <DetailRow
              icon={<IconCalendar />}
              text={pauta.pauta_date ? formatDayShort(pauta.pauta_date) : 'Por agendar'}
            />
            {(pauta.salida || pauta.llegada) && (
              <DetailRow
                icon={<IconClock />}
                text={`Salida ${formatTime12(pauta.salida) || '—'} · Llegada ${formatTime12(pauta.llegada) || '—'}`}
              />
            )}
            <DetailRow icon={<IconMapPin />} text={pauta.place || 'Por definir'} />
            {attendees.length > 0 && (
              <DetailRow icon={<IconUsers />} text={`Asiste: ${attendees.join(', ')}`} />
            )}
            <DetailRow
              icon={<IconClipboardCheck />}
              text={`Grilla: ${GRILLA_STATUS_LABELS[status]}`}
            />
          </div>

          {pauta.status === 'realizada' && (
            <PiezasSection
              pauta={pauta}
              piezas={piezas}
              audiovisualUsers={audiovisualUsers}
              usersById={usersById}
              canCoordinate={canCoordinate}
              companyId={companyId}
              onFields={onFields}
              onPiezaChanged={onPiezaChanged}
              onPiezaDeleted={onPiezaDeleted}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0] flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e0ddd4] text-[#666] rounded-xl text-[15px] font-semibold hover:bg-[#f5f3eb] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon, text }) {
  return (
    <div className="flex items-center gap-2.5 text-[13.5px] text-[#333]">
      <span className="w-7 h-7 rounded-full bg-[#f5f3eb] text-[#777] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="leading-snug">{text}</span>
    </div>
  )
}

// ─── Edición de piezas (solo pautas 'realizada') ────────────────────────────

function PiezasSection({
  pauta,
  piezas,
  audiovisualUsers,
  usersById,
  canCoordinate,
  companyId,
  onFields,
  onPiezaChanged,
  onPiezaDeleted,
}) {
  const [error, setError] = useState(null)
  const grouped = piezasByEditor(piezas)
  const editorIds = [...grouped.keys()].filter(Boolean)
  const sinAsignar = grouped.get(null) ?? []
  const asignadas = piezas.length
  const totales = Number(pauta.piezas_totales) || 0
  const desalineado = asignadas !== totales

  async function handleEditorsChange(nextIds) {
    setError(null)
    // Editor quitado del picker: sus piezas quedan sin editor (nunca se borran solas).
    const removed = editorIds.filter((id) => !nextIds.includes(id))
    if (removed.length) {
      const toOrphan = piezas.filter((pz) => removed.includes(pz.editor_user_id))
      const results = await Promise.all(
        toOrphan.map((pz) => updatePieza(pz.id, { editor_user_id: null })),
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        setError(`No se pudo actualizar la pieza. ${pautaErrorMessage(failed.error)}`)
        return
      }
      results.forEach((r) => r.data && onPiezaChanged(r.data))
    }
    // Editor agregado: se le crea 1 pieza de entrada (si no, el bloque del editor no tendría
    // nada que agrupar — la lista de editores visibles se deriva de las piezas mismas — y el
    // picker lo "olvidaría" en el próximo render). El coordinador ajusta la cantidad después
    // con el input "piezas asignadas" de su bloque.
    const added = nextIds.filter((id) => !editorIds.includes(id))
    if (added.length) {
      const startIndex = piezas.length
      const results = await Promise.all(
        added.map((editorId, i) =>
          createPiezas(
            companyId,
            pauta.id,
            editorId,
            [defaultPiezaName(startIndex + i)],
            startIndex + i,
          ),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        setError(`No se pudo asignar el editor. ${pautaErrorMessage(failed.error)}`)
        return
      }
      results.forEach((r) => (r.data ?? []).forEach((pz) => onPiezaChanged(pz)))
    }
  }

  async function handleAssignedChange(editorId, nextCount) {
    setError(null)
    const current = grouped.get(editorId) ?? []
    const diff = nextCount - current.length
    if (diff > 0) {
      const startIndex = piezas.length
      const nombres = Array.from({ length: diff }, (_, i) => defaultPiezaName(startIndex + i))
      const { data, error: err } = await createPiezas(
        companyId,
        pauta.id,
        editorId,
        nombres,
        startIndex,
      )
      if (err) {
        setError(`No se pudieron crear las piezas. ${pautaErrorMessage(err)}`)
        return
      }
      ;(data ?? []).forEach((pz) => onPiezaChanged(pz))
    } else if (diff < 0) {
      // Solo se borran piezas 'pendiente', empezando por el final del grupo — nunca se
      // pierde trabajo ya iniciado en silencio.
      const removable = current.filter((pz) => pz.status === 'pendiente')
      const toRemove = removable.slice(removable.length + diff)
      if (toRemove.length < -diff) {
        window.alert(
          'Algunas piezas de este editor ya tienen avance — quítalas manualmente antes de reducir la cantidad.',
        )
        return
      }
      const ids = toRemove.map((pz) => pz.id)
      const { error: err } = await deletePiezas(ids)
      if (err) {
        setError(`No se pudieron quitar las piezas. ${pautaErrorMessage(err)}`)
        return
      }
      ids.forEach((id) => onPiezaDeleted(id))
    }
  }

  return (
    <div className="border-t border-[#eeebe0] pt-4">
      <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#777] mb-3">
        Edición de piezas
      </p>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]">
          {error}
        </div>
      )}

      <div className="mb-3">
        <label className="block text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1">
          Piezas totales
        </label>
        {canCoordinate ? (
          <input
            type="number"
            min="0"
            className="input-base input-compact text-center"
            style={{ width: '5rem' }}
            defaultValue={totales}
            onBlur={async (e) => {
              setError(null)
              const { error: err } =
                (await onFields(pauta, { piezas_totales: Number(e.target.value) || 0 })) ?? {}
              if (err) setError(pautaErrorMessage(err))
            }}
          />
        ) : (
          <span className="font-mono text-[14px] font-semibold">{totales}</span>
        )}
      </div>

      {desalineado && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#fdf4de] text-[12.5px] text-[#9a7400] font-medium">
          {asignadas} de {totales} piezas repartidas — ajusta la cantidad por editor para que
          cuadre.
        </div>
      )}

      {canCoordinate && (
        <div className="mb-4">
          <label className="block text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1">
            Editores
          </label>
          <AttendeePicker
            employees={audiovisualUsers}
            selectedIds={editorIds}
            onChange={handleEditorsChange}
            hideQuickGroups
          />
        </div>
      )}

      <div className="space-y-4">
        {editorIds.length === 0 && sinAsignar.length === 0 && (
          <p className="text-[13px] text-[#bbb]">Sin editores asignados todavía.</p>
        )}
        {editorIds.map((editorId) => (
          <EditorChecklist
            key={editorId}
            editor={usersById.get(editorId)}
            piezas={grouped.get(editorId) ?? []}
            canCoordinate={canCoordinate}
            onAssignedChange={(n) => handleAssignedChange(editorId, n)}
            onPiezaChanged={onPiezaChanged}
            onPiezaDeleted={onPiezaDeleted}
            onError={setError}
          />
        ))}
        {sinAsignar.length > 0 && (
          <EditorChecklist
            editor={null}
            piezas={sinAsignar}
            canCoordinate={canCoordinate}
            onPiezaChanged={onPiezaChanged}
            onPiezaDeleted={onPiezaDeleted}
            onError={setError}
          />
        )}
      </div>
    </div>
  )
}

function EditorChecklist({
  editor,
  piezas,
  canCoordinate,
  onAssignedChange,
  onPiezaChanged,
  onPiezaDeleted,
  onError,
}) {
  const { total, listas } = piezasProgress(piezas)
  return (
    <div className="border border-[#ece9df] rounded-xl px-3 py-3">
      <div className="flex items-center gap-2.5 mb-2.5">
        {editor ? (
          <>
            <Avatar user={editor} size={24} />
            <span className="text-[13.5px] font-semibold text-[#222] flex-1">
              {editor.first_name} {editor.last_name}
            </span>
          </>
        ) : (
          <span className="text-[13.5px] font-semibold text-[#999] flex-1">Sin asignar</span>
        )}
        <span className="text-[12px] font-mono text-[#888]">
          {listas}/{total} listas
        </span>
        {canCoordinate && editor && onAssignedChange && (
          <input
            type="number"
            min="0"
            title="Piezas asignadas a este editor"
            className="input-base input-compact text-center flex-shrink-0"
            style={{ width: '3.5rem' }}
            defaultValue={piezas.length}
            onBlur={(e) => onAssignedChange(Math.max(0, Number(e.target.value) || 0))}
          />
        )}
      </div>

      {piezas.length === 0 ? (
        <p className="text-[12.5px] text-[#bbb]">Sin piezas asignadas.</p>
      ) : (
        <ul className="space-y-1.5">
          {piezas.map((pz) => (
            <PiezaRow
              key={pz.id}
              pieza={pz}
              canCoordinate={canCoordinate}
              onChanged={onPiezaChanged}
              onDeleted={onPiezaDeleted}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function PiezaRow({ pieza, canCoordinate, onChanged, onDeleted, onError }) {
  async function handleStatusChange(next) {
    onError?.(null)
    const { data, error: err } = await updatePieza(pieza.id, { status: next })
    if (err) {
      onError?.(`No se pudo cambiar el estado. ${pautaErrorMessage(err)}`)
      return
    }
    if (data) onChanged(data)
  }

  async function handleDelete() {
    onError?.(null)
    const { error: err } = await deletePiezas([pieza.id])
    if (err) {
      onError?.(`No se pudo quitar la pieza. ${pautaErrorMessage(err)}`)
      return
    }
    onDeleted(pieza.id)
  }

  return (
    <li className="flex items-center gap-2">
      {canCoordinate ? (
        <input
          type="text"
          className="input-base input-compact flex-1"
          defaultValue={pieza.nombre}
          onBlur={async (e) => {
            const nombre = e.target.value.trim()
            if (nombre === pieza.nombre) return
            onError?.(null)
            const { data, error: err } = await updatePieza(pieza.id, { nombre })
            if (err) {
              onError?.(`No se pudo guardar el nombre. ${pautaErrorMessage(err)}`)
              return
            }
            if (data) onChanged(data)
          }}
        />
      ) : (
        <span className="text-[13px] text-[#333] flex-1">{pieza.nombre}</span>
      )}
      <StatusPill
        value={pieza.status}
        meta={PIEZA_STATUS_META}
        options={PIEZA_STATUS_ORDER}
        editable={canCoordinate}
        onChange={handleStatusChange}
        size="sm"
      />
      {canCoordinate && (
        <button
          type="button"
          onClick={handleDelete}
          aria-label={`Quitar ${pieza.nombre}`}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-[#bbb] hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M1 1l8 8M9 1L1 9" />
          </svg>
        </button>
      )}
    </li>
  )
}

// ─── Iconos (SVG inline, mismo estilo que las flechas de AvCalendar.jsx) ───────────────

function IconCamera() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M15 8l4.5-2.5A1 1 0 0 1 21 6.4v11.2a1 1 0 0 1-1.5.9L15 16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3"
        y="6"
        width="12"
        height="12"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconMapPin() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="8" r="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M16.5 5.5a3 3 0 0 1 0 5.9M20 20a5.7 5.7 0 0 0-4-5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconClipboardCheck() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="5"
        y="4"
        width="14"
        height="17"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
