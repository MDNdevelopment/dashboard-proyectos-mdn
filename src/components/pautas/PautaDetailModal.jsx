import { useState } from 'react'
import {
  LIFECYCLE_LABELS,
  GRILLA_STATUS_LABELS,
  PIEZA_STATUS_META,
  PIEZA_STATUS_ORDER,
  FORMAT_KEYS,
  FORMAT_LABELS,
  FOTO_FORMAT,
  formatCodes,
  formatTime12,
  formatDayShort,
  resourceNames,
  grillaStatus,
  piezasProgress,
  piezasByEditor,
  piezaUnidades,
  piezasPorFormato,
  setPiezaFormatoCount,
  defaultPiezaName,
  planPiezaRemoval,
  distributePiezas,
  pautaErrorMessage,
} from '../../utils/audiovisual'
import { createPiezas, createLotePieza, deletePiezas, updatePieza } from './avPautasApi'
import Avatar from '../Avatar'
import AttendeePicker from '../reuniones/AttendeePicker'
import ExtraBadge from './ExtraBadge'
import StatusPill from '../common/StatusPill'
import Stepper from '../common/Stepper'

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
 * edición: piezas totales, editores asignados (AttendeePicker, igual que
 * recursos/asistentes en AvPhaseTable) y, debajo de cada uno, su checklist de piezas —
 * nombre editable + selector de estado (StatusPill). Editable por `canEditPiezas`,
 * ya resuelto por pauta antes de llegar aquí (canEditPiezasForPauta en
 * utils/audiovisual.js: quien coordina, o el recurso asignado a esta pauta).
 *
 * Piezas totales/editadas tiene dos caminos según si la pauta marcó formatos (V/R/F):
 * - Con formatos: "salieron" por formato es manual (input); "editadas" por formato es
 *   SOLO LECTURA — la deriva un trigger en BD contando, por cada pieza del checklist de
 *   abajo, las que están en 'listo' de ese mismo formato (`av_pauta_piezas.formato`),
 *   clampeada a "salieron" para que nunca la supere. `piezas_totales`/`piezas_editadas`
 *   de la pauta se recalculan sumando ese desglose — ver PiezasSection.
 * - Sin formatos (o pautas anteriores a esta función, con piezas_por_formato vacío):
 *   camino legacy — piezas_totales es un input manual y piezas_editadas la deriva otro
 *   trigger a partir de cuántas piezas del checklist de abajo quedan en 'listo', sin
 *   distinguir formato.
 */
export default function PautaDetailModal({
  pauta,
  usersById,
  audiovisualUsers,
  piezas,
  canEditPiezas,
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
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-[#111] tracking-[-0.01em]">
              {pauta.client_name ?? '—'}
              <ExtraBadge pauta={pauta} />
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
              canEditPiezas={canEditPiezas}
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
  canEditPiezas,
  companyId,
  onFields,
  onPiezaChanged,
  onPiezaDeleted,
}) {
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  // El picker de editores arranca cerrado — con la pauta ya repartida, mostrarlo siempre
  // desplegado es ruido; se abre con el botón "+ Agregar editor" cuando hace falta.
  const [pickerOpen, setPickerOpen] = useState(false)
  // Editores agregados en esta sesión que todavía no tienen ninguna pieza — no se
  // persisten en BD (no hay tabla de "editores de la pauta"): un editor sin piezas no es
  // información que valga la pena guardar. Se muestran igual para que el coordinador les
  // reparta cantidad con el stepper de su bloque sin tener que recordarlos.
  const [extraEditorIds, setExtraEditorIds] = useState([])
  const grouped = piezasByEditor(piezas)
  const editorIds = [...new Set([...grouped.keys(), ...extraEditorIds])].filter(Boolean)
  const sinAsignar = grouped.get(null) ?? []
  // Las fotos no cuentan una fila por unidad (van en lote): sumar piezaUnidades en vez de
  // piezas.length es lo que hace que "50 fotos repartidas" no dependa de 50 filas.
  const asignadas = piezas.reduce((sum, pz) => sum + piezaUnidades(pz), 0)
  // Formatos marcados en la pauta -> se captura el desglose por formato; si no hay
  // formatos (pautas anteriores a FormatToggle) se conserva el input único de siempre.
  const activeFormats = FORMAT_KEYS.filter((code) => (pauta.formats ?? []).includes(code))
  const usaFormatos = activeFormats.length > 0
  // Con un solo formato marcado no hace falta elegirlo pieza por pieza: toda pieza nueva
  // se etiqueta con ese formato automáticamente.
  const singleFormat = activeFormats.length === 1 ? activeFormats[0] : null
  const tieneFoto = activeFormats.includes(FOTO_FORMAT)
  // El stepper genérico (checklist pieza por pieza) es para video/reel; si Foto es el
  // único formato activo, todo el trabajo vive en el lote y el genérico no pinta nada.
  const tieneTrabajoPorPieza = !usaFormatos || activeFormats.some((c) => c !== FOTO_FORMAT)
  const breakdown = piezasPorFormato(pauta)
  // El total SIEMPRE se lee de las columnas ya sincronizadas por el trigger de BD (en
  // vez de sumar `breakdown` en cliente): así una pauta que ya tenía piezas_totales
  // cargado antes de este desglose no "pierde" su número mientras el desglose siga
  // vacío — solo cambia cuando el coordinador realmente carga los conteos por formato.
  const totales = Number(pauta.piezas_totales) || 0
  const totalEditadas = Number(pauta.piezas_editadas) || 0
  const faltantes = Math.max(0, totales - asignadas)
  const pct = totales ? Math.min(100, Math.round((asignadas / totales) * 100)) : 0

  async function handleSalieronChange(code, delta) {
    setError(null)
    const next = setPiezaFormatoCount(pauta, code, 'salieron', breakdown[code].salieron + delta)
    const { error: err } = (await onFields(pauta, { piezas_por_formato: next })) ?? {}
    if (err) setError(pautaErrorMessage(err))
  }

  async function handleEditorsChange(nextIds) {
    setError(null)
    setWarning(null)
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
    // Editor agregado: no crea ninguna pieza — solo entra a la lista visible, con un
    // bloque vacío, hasta que el coordinador le reparta cantidad con el stepper.
    const added = nextIds.filter((id) => !editorIds.includes(id))
    setExtraEditorIds((prev) => [...prev.filter((id) => !removed.includes(id)), ...added])
  }

  async function createForEditor(editorId, count) {
    const startIndex = piezas.length
    const nombres = Array.from({ length: count }, (_, i) => defaultPiezaName(startIndex + i))
    return createPiezas(companyId, pauta.id, editorId, nombres, startIndex, singleFormat)
  }

  function loteOf(editorId) {
    return (grouped.get(editorId) ?? []).find((pz) => pz.es_lote) ?? null
  }

  /** Sube/crece la cantidad del lote de fotos de un editor, consumiendo el pool `faltantes`
   * compartido — igual criterio que handleAssignedChange, pero nunca borra la fila: solo
   * ajusta `cantidad`, y nunca por debajo de `listas` (fotos ya entregadas). */
  async function handleLoteAssignedChange(editorId, delta) {
    setError(null)
    setWarning(null)
    const lote = loteOf(editorId)
    if (delta > 0) {
      const allowed = Math.min(delta, faltantes)
      if (allowed <= 0) return
      if (!lote) {
        const { data, error: err } = await createLotePieza(
          companyId,
          pauta.id,
          editorId,
          allowed,
          piezas.length,
        )
        if (err) {
          setError(`No se pudo crear el lote de fotos. ${pautaErrorMessage(err)}`)
          return
        }
        if (data) onPiezaChanged(data)
      } else {
        const { data, error: err } = await updatePieza(lote.id, {
          cantidad: lote.cantidad + allowed,
        })
        if (err) {
          setError(`No se pudo actualizar el lote de fotos. ${pautaErrorMessage(err)}`)
          return
        }
        if (data) onPiezaChanged(data)
      }
    } else if (delta < 0 && lote) {
      const next = Math.max(lote.listas, lote.cantidad + delta)
      if (next === lote.cantidad) {
        setWarning('No se puede bajar de las fotos ya marcadas como listas en este lote.')
        return
      }
      const { data, error: err } = await updatePieza(lote.id, { cantidad: next })
      if (err) {
        setError(`No se pudo actualizar el lote de fotos. ${pautaErrorMessage(err)}`)
        return
      }
      if (data) onPiezaChanged(data)
    }
  }

  /** Avanza/retrocede cuántas fotos del lote de un editor ya están listas. */
  async function handleLoteListasChange(editorId, delta) {
    setError(null)
    const lote = loteOf(editorId)
    if (!lote) return
    const next = Math.min(lote.cantidad, Math.max(0, lote.listas + delta))
    if (next === lote.listas) return
    const { data, error: err } = await updatePieza(lote.id, { listas: next })
    if (err) {
      setError(`No se pudo actualizar el lote de fotos. ${pautaErrorMessage(err)}`)
      return
    }
    if (data) onPiezaChanged(data)
  }

  async function handleLoteComplete(editorId) {
    setError(null)
    const lote = loteOf(editorId)
    if (!lote || lote.listas === lote.cantidad) return
    const { data, error: err } = await updatePieza(lote.id, { listas: lote.cantidad })
    if (err) {
      setError(`No se pudo actualizar el lote de fotos. ${pautaErrorMessage(err)}`)
      return
    }
    if (data) onPiezaChanged(data)
  }

  async function handleLoteDelete(editorId) {
    setError(null)
    setWarning(null)
    const lote = loteOf(editorId)
    if (!lote) return
    if (lote.listas > 0) {
      setWarning(
        'El lote de fotos tiene entregas marcadas como listas — bájalas a 0 antes de quitarlo.',
      )
      return
    }
    const { error: err } = await deletePiezas([lote.id])
    if (err) {
      setError(`No se pudo quitar el lote de fotos. ${pautaErrorMessage(err)}`)
      return
    }
    onPiezaDeleted(lote.id)
  }

  async function handleAssignedChange(editorId, delta) {
    setError(null)
    setWarning(null)
    const current = (grouped.get(editorId) ?? []).filter((pz) => !pz.es_lote)
    if (delta > 0) {
      // Nunca se reparten más piezas de las que "salieron" — el stepper ya llega
      // deshabilitado a este límite, esto es el resguardo si igual se dispara.
      const allowed = Math.min(delta, faltantes)
      if (allowed <= 0) return
      const { data, error: err } = await createForEditor(editorId, allowed)
      if (err) {
        setError(`No se pudieron crear las piezas. ${pautaErrorMessage(err)}`)
        return
      }
      ;(data ?? []).forEach((pz) => onPiezaChanged(pz))
    } else if (delta < 0) {
      const { toDelete, blocked } = planPiezaRemoval(current, -delta)
      if (toDelete.length) {
        const { error: err } = await deletePiezas(toDelete)
        if (err) {
          setError(`No se pudieron quitar las piezas. ${pautaErrorMessage(err)}`)
          return
        }
        toDelete.forEach((id) => onPiezaDeleted(id))
      }
      if (blocked.length) {
        setWarning(
          `Quedan ${blocked.length} pieza${blocked.length === 1 ? '' : 's'} con avance en este bloque — quítala${blocked.length === 1 ? '' : 's'} con la ✕ si de verdad quieres eliminarla${blocked.length === 1 ? '' : 's'}.`,
        )
      }
    }
  }

  async function handleAutoDistribute() {
    setError(null)
    setWarning(null)
    const plan = distributePiezas(faltantes, editorIds, grouped)
    // Pauta 100% Foto: reparte creciendo el lote de cada editor en vez de crear N filas.
    if (tieneFoto && !tieneTrabajoPorPieza) {
      for (const { editorId, count } of plan) {
        const lote = loteOf(editorId)
        const result = lote
          ? await updatePieza(lote.id, { cantidad: lote.cantidad + count })
          : await createLotePieza(companyId, pauta.id, editorId, count, piezas.length)
        if (result.error) {
          setError(`No se pudo repartir el lote de fotos. ${pautaErrorMessage(result.error)}`)
          return
        }
        if (result.data) onPiezaChanged(result.data)
      }
      return
    }
    for (const { editorId, count } of plan) {
      const { data, error: err } = await createForEditor(editorId, count)
      if (err) {
        setError(`No se pudieron repartir las piezas. ${pautaErrorMessage(err)}`)
        return
      }
      data?.forEach((pz) => onPiezaChanged(pz))
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
      {warning && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#fdf4de] text-[#9a7400] text-[12.5px]">
          {warning}
        </div>
      )}

      {usaFormatos ? (
        <div className="mb-3">
          <p className="text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1.5">
            Piezas por formato
          </p>
          <div className="space-y-2">
            {activeFormats.map((code) => (
              <div key={code} className="flex items-center gap-3">
                <span className="text-[13px] text-[#333] flex-1">{FORMAT_LABELS[code]}</span>
                {canEditPiezas ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#999]">Salieron</span>
                    <Stepper
                      value={breakdown[code].salieron}
                      onChange={(delta) => handleSalieronChange(code, delta)}
                      label={`salieron de ${FORMAT_LABELS[code]}`}
                    />
                  </span>
                ) : (
                  <span className="text-[12px] text-[#999]">
                    Salieron <strong className="text-[#333]">{breakdown[code].salieron}</strong>
                  </span>
                )}
                {/* Editadas es de solo lectura: la deriva el checklist de abajo (piezas de
                    este formato en 'Listo'), clampeada a "Salieron" por el trigger de BD. */}
                <span
                  className="text-[12px] text-[#999]"
                  title="Se calcula solo — piezas de este formato marcadas 'Listo' en el checklist"
                >
                  Editadas <strong className="text-[#333]">{breakdown[code].editadas}</strong>
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1 border-t border-[#eeebe0]">
              <span className="text-[12px] font-semibold text-[#666] flex-1">Total</span>
              <span className="font-mono text-[13px] font-semibold">
                {totales}/{totalEditadas}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1">
            Piezas totales
          </p>
          {canEditPiezas ? (
            <Stepper
              value={totales}
              onChange={async (delta) => {
                setError(null)
                const { error: err } =
                  (await onFields(pauta, { piezas_totales: Math.max(0, totales + delta) })) ?? {}
                if (err) setError(pautaErrorMessage(err))
              }}
              label="piezas totales"
            />
          ) : (
            <span className="font-mono text-[14px] font-semibold">{totales}</span>
          )}
        </div>
      )}

      {totales > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] text-[#666]">
              {asignadas} de {totales} piezas repartidas{faltantes > 0 && ` · faltan ${faltantes}`}
            </span>
            {canEditPiezas && faltantes > 0 && editorIds.length > 0 && (
              <button
                type="button"
                onClick={handleAutoDistribute}
                className="text-[11.5px] font-semibold text-[#2563eb] hover:underline"
              >
                Repartir automáticamente
              </button>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-[#f0eee5] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1f8a43] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {canEditPiezas && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[13px] font-mono font-bold uppercase tracking-wide text-[#444]">
              Editores
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-label={pickerOpen ? 'Cerrar selector de editores' : 'Agregar editor'}
              className="text-[11.5px] font-semibold text-[#2563eb] hover:underline"
            >
              {pickerOpen ? 'Cerrar' : '+ Agregar editor'}
            </button>
          </div>
          {pickerOpen ? (
            <AttendeePicker
              employees={audiovisualUsers}
              selectedIds={editorIds}
              onChange={handleEditorsChange}
              hideQuickGroups
            />
          ) : (
            editorIds.length === 0 && (
              <p className="text-[13px] text-[#bbb]">Aún no se han agregado editores.</p>
            )
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Solo lectura: el bloque "Editores" de arriba (con su propio mensaje vacío) no se
            renderiza sin canEditPiezas, así que este es el único aviso que vería ese lector. */}
        {!canEditPiezas && editorIds.length === 0 && sinAsignar.length === 0 && (
          <p className="text-[13px] text-[#bbb]">Sin editores asignados todavía.</p>
        )}
        {editorIds.map((editorId) => (
          <EditorChecklist
            key={editorId}
            editor={usersById.get(editorId)}
            piezas={grouped.get(editorId) ?? []}
            canEditPiezas={canEditPiezas}
            formatOptions={activeFormats}
            tieneFoto={tieneFoto}
            tieneTrabajoPorPieza={tieneTrabajoPorPieza}
            maxAssigned={
              (grouped.get(editorId) ?? []).filter((pz) => !pz.es_lote).length + faltantes
            }
            maxLoteAssigned={(loteOf(editorId)?.cantidad ?? 0) + faltantes}
            onAssignedChange={(delta) => handleAssignedChange(editorId, delta)}
            onLoteAssignedChange={(delta) => handleLoteAssignedChange(editorId, delta)}
            onLoteListasChange={(delta) => handleLoteListasChange(editorId, delta)}
            onLoteComplete={() => handleLoteComplete(editorId)}
            onLoteDelete={() => handleLoteDelete(editorId)}
            onPiezaChanged={onPiezaChanged}
            onPiezaDeleted={onPiezaDeleted}
            onError={setError}
          />
        ))}
        {sinAsignar.length > 0 && (
          <EditorChecklist
            editor={null}
            piezas={sinAsignar}
            canEditPiezas={canEditPiezas}
            formatOptions={activeFormats}
            tieneFoto={tieneFoto}
            tieneTrabajoPorPieza={tieneTrabajoPorPieza}
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
  canEditPiezas,
  formatOptions,
  tieneFoto,
  tieneTrabajoPorPieza,
  maxAssigned,
  maxLoteAssigned,
  onAssignedChange,
  onLoteAssignedChange,
  onLoteListasChange,
  onLoteComplete,
  onLoteDelete,
  onPiezaChanged,
  onPiezaDeleted,
  onError,
}) {
  // Las fotos viven en una sola fila lote (`es_lote`); el resto del checklist (video/reel)
  // sigue siendo una fila por pieza. `piezasProgress` ya suma unidades, no filas.
  const normal = piezas.filter((pz) => !pz.es_lote)
  const lote = piezas.find((pz) => pz.es_lote) ?? null
  const { total, listas } = piezasProgress(piezas)
  // Un editor sin lote todavía puede recibir uno con el stepper de LoteRow — se muestra la
  // fila si la pauta tiene Foto activa Y hay un editor real a quien asignarle (para poder
  // repartirle), o si ya existe un lote huérfano que gestionar (p. ej. se quitó al editor
  // de la sección de arriba pero sus fotos siguen ahí).
  const showLoteRow = Boolean(lote) || (tieneFoto && Boolean(editor))
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
        {canEditPiezas && editor && onAssignedChange && tieneTrabajoPorPieza && (
          <Stepper
            value={normal.length}
            onChange={onAssignedChange}
            max={maxAssigned}
            label={`piezas de ${editor.first_name ?? 'este editor'}`}
          />
        )}
      </div>

      {normal.length === 0 && !showLoteRow ? (
        <p className="text-[12.5px] text-[#bbb]">Sin piezas asignadas.</p>
      ) : (
        <ul className="space-y-1.5">
          {normal.map((pz) => (
            <PiezaRow
              key={pz.id}
              pieza={pz}
              canEditPiezas={canEditPiezas}
              formatOptions={formatOptions}
              onChanged={onPiezaChanged}
              onDeleted={onPiezaDeleted}
              onError={onError}
            />
          ))}
          {showLoteRow && (
            <LoteRow
              lote={lote}
              editorName={editor?.first_name ?? 'este editor'}
              canEditPiezas={canEditPiezas && Boolean(editor) && Boolean(onLoteAssignedChange)}
              maxAssigned={maxLoteAssigned}
              onAssignedChange={onLoteAssignedChange}
              onListasChange={onLoteListasChange}
              onComplete={onLoteComplete}
              onDelete={onLoteDelete}
            />
          )}
        </ul>
      )}
    </div>
  )
}

/** Fila de lote (hoy solo Fotos): en vez de nombre + estado por unidad, dos contadores —
 * cuántas se asignaron y cuántas de esas ya están listas. */
function LoteRow({
  lote,
  editorName,
  canEditPiezas,
  maxAssigned,
  onAssignedChange,
  onListasChange,
  onComplete,
  onDelete,
}) {
  const cantidad = lote?.cantidad ?? 0
  const listasCount = lote?.listas ?? 0
  return (
    <li className="flex items-center gap-2 flex-wrap">
      <span className="text-[13px] text-[#333] flex-1 min-w-[70px]">📷 Fotos</span>
      {canEditPiezas ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#999]">Asignadas</span>
            <Stepper
              value={cantidad}
              onChange={onAssignedChange}
              max={maxAssigned}
              label={`fotos asignadas a ${editorName}`}
            />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#999]">Listas</span>
            <Stepper
              value={listasCount}
              onChange={onListasChange}
              max={cantidad}
              disabled={cantidad === 0}
              label={`fotos listas de ${editorName}`}
            />
          </span>
          {cantidad > 0 && listasCount < cantidad && (
            <button
              type="button"
              onClick={onComplete}
              className="text-[11px] font-semibold text-[#2563eb] hover:underline"
            >
              ✓ completar todas
            </button>
          )}
          {cantidad > 0 && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Quitar lote de fotos de ${editorName}`}
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
        </>
      ) : (
        <span className="text-[12px] text-[#999]">
          <strong className="text-[#333]">{listasCount}</strong>/{cantidad} listas
        </span>
      )}
    </li>
  )
}

function PiezaRow({ pieza, canEditPiezas, formatOptions, onChanged, onDeleted, onError }) {
  async function handleStatusChange(next) {
    onError?.(null)
    const { data, error: err } = await updatePieza(pieza.id, { status: next })
    if (err) {
      onError?.(`No se pudo cambiar el estado. ${pautaErrorMessage(err)}`)
      return
    }
    if (data) onChanged(data)
  }

  async function handleFormatoChange(e) {
    onError?.(null)
    const { data, error: err } = await updatePieza(pieza.id, { formato: e.target.value || null })
    if (err) {
      onError?.(`No se pudo guardar el formato. ${pautaErrorMessage(err)}`)
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
      {canEditPiezas ? (
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
      {formatOptions?.length > 1 &&
        (canEditPiezas ? (
          <select
            aria-label={`Formato de ${pieza.nombre}`}
            className="input-base input-compact text-[12px] flex-shrink-0"
            style={{ width: '5.5rem' }}
            value={pieza.formato ?? ''}
            onChange={handleFormatoChange}
          >
            <option value="">Sin formato</option>
            {formatOptions.map((code) => (
              <option key={code} value={code}>
                {FORMAT_LABELS[code]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[11px] text-[#999] flex-shrink-0">
            {pieza.formato ? FORMAT_LABELS[pieza.formato] : 'Sin formato'}
          </span>
        ))}
      <StatusPill
        value={pieza.status}
        meta={PIEZA_STATUS_META}
        options={PIEZA_STATUS_ORDER}
        editable={canEditPiezas}
        onChange={handleStatusChange}
        size="sm"
      />
      {canEditPiezas && (
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
