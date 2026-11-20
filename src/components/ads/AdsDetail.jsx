import { useState } from 'react'
import { supabase } from '../../supabase'
import { STATUS, STATUSES } from './constants'
import StatusPill from '../common/StatusPill'
import CampaignChecklist from './CampaignChecklist'
import { completionPct, durationLabel, periodProgress } from '../../utils/tacticas'

/**
 * Detalle de una táctica (solo lectura; el estado y las acciones se tildan aquí).
 * No hay responsable que se elija: se muestra la jefa del team de la marca (`jefaName`).
 * Una táctica sin fechas se rotula "Sin fecha" y ofrece "Agregar fecha" (abre el formulario).
 */
export default function AdsDetail({
  campaign,
  jefaName = null,
  onClose,
  onUpdated,
  onDeleted,
  canManage,
  onEdit,
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const pct = completionPct(campaign.checklist)
  const progress = periodProgress(campaign)
  const sinFecha = !campaign.start_date || !campaign.end_date

  async function handleStatusChange(nextStatus) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', campaign.id)
      .select()
      .single()
    if (!error && data) onUpdated(data)
  }

  // Persiste el checklist al tildar/destildar una acción (una escritura por cambio).
  // La edición de texto/agregar/eliminar se hace en el formulario (AdsForm).
  async function handleChecklistChange(nextChecklist) {
    onUpdated({ ...campaign, checklist: nextChecklist }) // optimista
    const { data, error } = await supabase
      .from('campaigns')
      .update({ checklist: nextChecklist, updated_at: new Date().toISOString() })
      .eq('id', campaign.id)
      .select()
      .single()
    if (!error && data) onUpdated(data)
  }

  const fmt = (d) =>
    d
      ? new Date(d + 'T00:00:00').toLocaleDateString('es-VE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—'

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setDeleting(true)
    const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id)
    setDeleting(false)
    if (!error) {
      onDeleted(campaign.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-[#ece9df] flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-[19px] font-bold text-[#111] leading-snug mb-2">{campaign.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill
                value={campaign.status}
                meta={STATUS}
                options={STATUSES}
                editable={canManage}
                onChange={handleStatusChange}
              />
              {pct != null && (
                <span className="text-[13px] font-mono font-semibold text-[#555]">
                  Cumplimiento {pct}%
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[14px]">
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                Cliente
              </p>
              <p className="text-[#333] font-medium">{campaign.client}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                Jefa del team
              </p>
              <p className="text-[#333] font-medium">{jefaName ?? '—'}</p>
            </div>
            {sinFecha ? (
              <div className="col-span-1 sm:col-span-2 flex flex-wrap items-center gap-3 rounded-xl bg-[#f5f3eb] px-3 py-2.5">
                <span className="text-[12px] font-mono font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-white border border-[#e0ddd4] text-[#666]">
                  Sin fecha
                </span>
                <span className="text-[14px] text-[#666]">Todavía no tiene inicio ni fin.</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="ml-auto text-[13.5px] font-bold px-3 py-1.5 rounded-lg bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
                  >
                    Agregar fecha
                  </button>
                )}
              </div>
            ) : (
              <>
                <div>
                  <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                    Fecha inicio
                  </p>
                  <p className="text-[#333]">{fmt(campaign.start_date)}</p>
                </div>
                <div>
                  <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                    Fecha fin
                  </p>
                  <p className="text-[#333]">{fmt(campaign.end_date)}</p>
                </div>
              </>
            )}
            {durationLabel(campaign) && (
              <div>
                <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                  Duración
                </p>
                <p className="text-[#333]">{durationLabel(campaign)}</p>
              </div>
            )}
          </div>

          {campaign.objective && (
            <div className="mb-4">
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-1.5">
                Objetivo general
              </p>
              <p className="text-[15px] text-[#444] whitespace-pre-wrap leading-relaxed">
                {campaign.objective}
              </p>
            </div>
          )}

          {!sinFecha && (
            <div className="mb-4">
              <div
                role="img"
                aria-label={`Avance del período: ${progress}%`}
                className="h-1.5 bg-[#f0ede3] rounded-full overflow-hidden"
              >
                <div className="h-full bg-[#111]" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[12.5px] text-[#999] mt-1">Avance del período: {progress}%</p>
            </div>
          )}

          {(campaign.drive_url || campaign.drive_folder_url) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {campaign.drive_url && (
                <a
                  href={campaign.drive_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] font-semibold px-3 py-1.5 rounded-lg bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
                >
                  Abrir documento
                </a>
              )}
              {campaign.drive_folder_url && (
                <a
                  href={campaign.drive_folder_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] font-semibold px-3 py-1.5 rounded-lg border border-[#e0ddd4] bg-white text-[#111] hover:border-[#FFB800] transition-colors"
                >
                  Carpeta de la marca
                </a>
              )}
            </div>
          )}

          {campaign.notes && (
            <div className="mb-4">
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-1.5">
                Notas
              </p>
              <p className="text-[15px] text-[#444] whitespace-pre-wrap leading-relaxed bg-[#f5f3eb] rounded-xl p-3">
                {campaign.notes}
              </p>
            </div>
          )}

          {/* Checklist de acciones: se tildan aquí (avanza el %); el texto se edita en el form. */}
          <div className="mb-2">
            <CampaignChecklist
              value={campaign.checklist ?? []}
              onChange={handleChecklistChange}
              canManage={canManage}
              editable={false}
            />
          </div>
        </div>

        {canManage && (
          <div className="flex-shrink-0 flex gap-2 px-6 py-4 border-t border-[#ece9df]">
            <button
              onClick={onEdit}
              className="flex-1 py-2.5 rounded-xl bg-[#FFB800] text-[#111] text-[15px] font-bold hover:bg-[#e6a600] transition-colors"
            >
              Editar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`flex-1 py-2.5 rounded-xl text-[15px] font-bold transition-colors disabled:opacity-50 ${
                confirming
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-[#e0ddd4] text-[#555] hover:bg-[#f5f3eb]'
              }`}
            >
              {deleting ? 'Eliminando...' : confirming ? '¿Confirmar?' : 'Eliminar'}
            </button>
            {confirming && (
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
              >
                No
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
