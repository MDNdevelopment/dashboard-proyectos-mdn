import { useState } from 'react'
import ExtraBadge from './ExtraBadge'
import StatusBadge from './StatusBadge'
import PautaDatos from './PautaDatos'
import PautaAcciones from './PautaAcciones'
import AgendarDialog from './AgendarDialog'
import CapturaSection from './CapturaSection'
import EdicionSection from './EdicionSection'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import { deletePauta, restorePauta, permanentlyDeletePauta } from './avPautasApi'
import { pautaErrorMessage } from '../../utils/audiovisual'

/**
 * Detalle de una pauta: cabecera, datos, acciones por estado, y — desde que está agendada —
 * las secciones de Captura y Edición. Todas las escrituras sobre `av_pautas` pasan por
 * `onFields(pauta, fields) → {error}`; las de piezas por los handlers `onPieza*`.
 */
export default function PautaDetail({
  pauta,
  piezas,
  pautas,
  lines,
  usersById,
  recursoUsers,
  editorUsers,
  allEmployees,
  perms,
  userId,
  companyId,
  onFields,
  onChanged,
  onDeleted,
  onPiezaChanged,
  onPiezaDeleted,
  onEdit,
  onClose,
}) {
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!pauta) return null

  const line = (lines ?? []).find((l) => l.id === pauta.line_id)
  const showWork = ['programada', 'realizada'].includes(pauta.status) && !pauta.deleted_at

  async function write(fields) {
    setError(null)
    const { error: err } = (await onFields(pauta, fields)) ?? {}
    if (err) setError(pautaErrorMessage(err))
    return { error: err }
  }

  async function run(fn, after) {
    setBusy(true)
    setError(null)
    const { data, error: err } = await fn()
    setBusy(false)
    if (err) {
      setError(pautaErrorMessage(err))
      return
    }
    after?.(data)
  }

  function handleAction(key) {
    if (key === 'agendar' || key === 'reagendar') setDialog(key)
    else if (key === 'realizada') write({ status: 'realizada' })
    else if (key === 'declinar') write({ status: 'declinada' })
    else if (key === 'solicitada') write({ status: 'solicitada' })
    else if (key === 'editar') onEdit(pauta)
    else if (key === 'borrar') run(() => deletePauta(pauta.id), onChanged)
    else if (key === 'restaurar') run(() => restorePauta(pauta.id), onChanged)
    else if (key === 'eliminar') setDialog('eliminar')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-[#eeebe0] flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-semibold text-[#111] tracking-[-0.01em] truncate">
                {pauta.client_name ?? 'Sin cliente'}
              </h2>
              <ExtraBadge pauta={pauta} />
              <StatusBadge pauta={pauta} />
            </div>
            <p className="text-[12.5px] text-[#888] mt-0.5">
              {line?.name ?? 'Independientes'}
              {pauta.tema ? ` · ${pauta.tema}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 text-[13px] px-3 py-2 rounded-lg" role="alert">
              {error}
            </div>
          )}
          <PautaAcciones pauta={pauta} perms={perms} onAction={busy ? () => {} : handleAction} />
          <PautaDatos pauta={pauta} usersById={usersById} />
          {showWork && (
            <>
              <CapturaSection
                pauta={pauta}
                recursoUsers={recursoUsers}
                usersById={usersById}
                canEdit={perms.canEditPiezas}
                onFields={onFields}
              />
              <EdicionSection
                pauta={pauta}
                piezas={piezas}
                editorUsers={editorUsers}
                usersById={usersById}
                canEdit={perms.canEditPiezas}
                userId={userId}
                companyId={companyId}
                onPiezaChanged={onPiezaChanged}
                onPiezaDeleted={onPiezaDeleted}
              />
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 py-3 border-t border-[#eeebe0] flex-shrink-0">
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 border border-[#e0ddd4] text-[#666] rounded-xl text-[14px] font-semibold hover:bg-[#f5f3eb] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

      {(dialog === 'agendar' || dialog === 'reagendar') && (
        <AgendarDialog
          mode={dialog}
          pauta={pauta}
          pautas={pautas}
          usersById={usersById}
          recursoUsers={recursoUsers}
          allEmployees={allEmployees}
          onConfirm={(fields) => onFields(pauta, fields)}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'eliminar' && (
        <ConfirmDeleteDialog
          itemName={pauta.client_name ?? 'esta pauta'}
          itemLabel="pauta"
          message="Se eliminará definitivamente, junto con sus registros de captura y edición. Esta acción no se puede deshacer."
          confirming={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            run(
              () => permanentlyDeletePauta(pauta.id),
              () => {
                setDialog(null)
                onDeleted(pauta.id)
                onClose()
              },
            )
          }
        />
      )}
    </div>
  )
}
