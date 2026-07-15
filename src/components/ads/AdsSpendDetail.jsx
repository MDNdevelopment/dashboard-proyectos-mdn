import { useMemo } from 'react'
import { STATUS, STATUSES, RESULT_FIELDS } from './constants'
import { durationDays, spentByClientInPeriod } from './campaignSpendApi'
import { fmtUSD } from '../../utils/metricsFinance'
import StatusPill from '../common/StatusPill'

/**
 * Modal de vista de un Ad (pauta pagada). Solo lectura salvo el estado,
 * que se puede cambiar directamente desde aquí sin entrar a modo edición
 * (mismo patrón que AdsDetail.jsx para Tácticas). Muestra además el aviso
 * de sobrepaso de presupuesto (mismo cálculo y texto que AdsSpendForm.jsx)
 * cuando el cliente ya excedió su presupuesto mensual ese mes.
 *
 * Props nuevas respecto a la versión anterior:
 *   ads          — array completo de ads ya cargado por el padre (para el cálculo de sobrepaso)
 *   client       — objeto metric_clients resuelto (para leer campaign_budget)
 *   responsables — lista acotada de responsables (Katherine, Paola, jefas de línea) para resolver el nombre
 *   onStatusChange — cambio de estado delegado al padre (AdsSpendView.requestStatusChange), que
 *                    decide si persiste directo o exige resultados primero (finalizar)
 */
export default function AdsSpendDetail({ ad, ads = [], client, responsables = [], onClose, onStatusChange, canManage, onEdit, onRequestDelete }) {
  const responsableName = (() => {
    const r = responsables.find(r => r.user_id === ad.responsable_id)
    return r ? `${r.first_name} ${r.last_name}` : '—'
  })()
  const duration = durationDays(ad.start_date, ad.end_date)

  const fmt = (d) =>
    d
      ? new Date(d + 'T00:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—'

  // Aviso de sobrepaso: el ad ya está incluido en `ads`, así que no se excluye por id.
  const overspend = useMemo(() => {
    if (!client?.campaign_budget || !ad.start_date) return null
    const [year, month] = ad.start_date.split('-').map(Number)
    const spent = spentByClientInPeriod(ads, ad.client_id, { month, year })
    const budget = Number(client.campaign_budget)
    if (spent <= budget) return null
    return { spent, budget }
  }, [ads, client, ad.client_id, ad.start_date])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-[#ece9df] flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-[19px] font-bold text-[#111] leading-snug mb-2">{ad.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill
                value={ad.status}
                meta={STATUS}
                options={STATUSES}
                editable={canManage}
                onChange={onStatusChange}
              />
            </div>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[14px]">
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">Cliente</p>
              <p className="text-[#333] font-medium">{ad.client}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">Responsable</p>
              <p className="text-[#333] font-medium">{responsableName}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">Monto</p>
              <p className="text-[#333] font-medium">{fmtUSD(ad.amount)}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">Fecha inicio</p>
              <p className="text-[#333]">{fmt(ad.start_date)}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">Fecha fin</p>
              <p className="text-[#333]">{fmt(ad.end_date)}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">Duración</p>
              <p className="text-[#333]">{duration != null ? `${duration} día${duration !== 1 ? 's' : ''}` : '—'}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">Pieza</p>
              {ad.piece_url ? (
                <a href={ad.piece_url} target="_blank" rel="noopener noreferrer" className="text-[#3B6FE0] hover:underline">
                  Ver pieza
                </a>
              ) : (
                <p className="text-[#333]">—</p>
              )}
            </div>
          </div>

          {ad.objective && (
            <div className="mb-4">
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-1.5">Objetivo</p>
              <p className="text-[15px] text-[#444] whitespace-pre-wrap leading-relaxed bg-[#f5f3eb] rounded-xl p-3">
                {ad.objective}
              </p>
            </div>
          )}

          {/* Resultados — solo visibles una vez finalizado el ad; nunca como columnas de la tabla */}
          {ad.status === 'Finalizado' && (
            <div className="mb-4">
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-1.5">Resultados</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f5f3eb] rounded-xl p-3">
                {RESULT_FIELDS.map(f => (
                  <div key={f.key}>
                    <p className="text-[11px] font-mono uppercase tracking-widest text-[#888] mb-0.5">{f.label}</p>
                    <p className="text-[15px] font-semibold text-[#111]">
                      {ad[f.key] != null ? Number(ad[f.key]).toLocaleString('es-VE') : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aviso de sobrepaso de presupuesto — solo si este cliente ya lo excede este mes */}
          {overspend && (
            <div className="mb-4 bg-[#fff3e0] border border-[#f0871f]/40 text-[#8a4a0a] text-[14px] rounded-xl px-4 py-3">
              Te estás pasando del presupuesto aprobado para este cliente
              ({fmtUSD(overspend.spent)} de {fmtUSD(overspend.budget)} este mes).
            </div>
          )}

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
              onClick={onRequestDelete}
              className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-bold text-[#555] hover:bg-[#f5f3eb] transition-colors"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
