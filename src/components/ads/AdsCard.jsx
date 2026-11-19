import { STATUS, STATUSES } from './constants'
import StatusPill from '../common/StatusPill'
import ClientCell from './ClientCell'
import { fmtDate, dateColor } from './campaignSpendApi'
import { checklistCounts, completionPct } from '../../utils/tacticas'

export default function AdsCard({
  campaign,
  canManage,
  usersMap,
  clientsById,
  onSelect,
  onStatusChange,
  onEdit,
  onDelete,
  inlineEditId,
  inlineEditValue,
  onInlineEditStart,
  onInlineEditChange,
  onInlineEditSave,
}) {
  const isInlineEditing = inlineEditId === campaign.id
  const { done: checkDone, total: checkTotal } = checklistCounts(campaign.checklist)
  const pct = completionPct(campaign.checklist)

  return (
    <tr
      onClick={() => onSelect(campaign)}
      className="border-b border-[#f0ede3] hover:bg-[#fafaf7] transition-colors group cursor-pointer"
    >
      {/* Client */}
      <td className="px-3 py-2.5 text-[14px] text-[#444] whitespace-nowrap">
        <ClientCell
          name={campaign.client}
          logoUrl={campaign.client_id ? clientsById?.get(campaign.client_id)?.logo_url : null}
        />
      </td>

      {/* Name — inline editable */}
      <td className="px-3 py-2.5 max-w-[180px]">
        {isInlineEditing ? (
          <input
            autoFocus
            className="input-base text-[14px] py-1 w-full"
            value={inlineEditValue}
            onChange={(e) => onInlineEditChange(e.target.value)}
            onBlur={() => onInlineEditSave(campaign.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onInlineEditSave(campaign.id)
              if (e.key === 'Escape') onInlineEditStart(null, '')
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            onClick={
              canManage
                ? (e) => {
                    e.stopPropagation()
                    onInlineEditStart(campaign.id, campaign.name)
                  }
                : undefined
            }
            className={`text-[15px] font-semibold text-[#111] leading-snug ${canManage ? 'cursor-text' : ''}`}
            title={campaign.notes || undefined}
          >
            {campaign.name}
            {campaign.notes && (
              <p className="text-[13px] font-normal text-[#999] truncate mt-0.5">
                {campaign.notes}
              </p>
            )}
            {checkTotal > 0 && (
              <span
                className="inline-flex items-center gap-1 mt-1 text-[11px] font-mono font-semibold text-[#888]"
                title={`${checkDone} de ${checkTotal} acciones completadas`}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {checkDone}/{checkTotal}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Assignee */}
      <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
        {usersMap?.get(campaign.assignee) ?? campaign.assignee ?? '—'}
      </td>

      {/* Start date */}
      <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
        {fmtDate(campaign.start_date)}
      </td>

      {/* End date */}
      <td className={`px-3 py-2.5 text-[14px] whitespace-nowrap ${dateColor(campaign.end_date)}`}>
        {fmtDate(campaign.end_date)}
      </td>

      {/* Cumplimiento: % de acciones hechas (— si no hay checklist) */}
      <td className="px-3 py-2.5 text-[13px] font-mono font-semibold text-[#555] whitespace-nowrap">
        {pct == null ? <span className="text-[#bbb]">—</span> : `${pct}%`}
      </td>

      {/* Drive */}
      <td className="px-3 py-2.5 text-[14px] whitespace-nowrap">
        {campaign.drive_url ? (
          <a
            href={campaign.drive_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-[#111] underline decoration-[#FFB800] underline-offset-2"
          >
            Carpeta
          </a>
        ) : (
          <span className="text-[#bbb]">—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <StatusPill
          value={campaign.status}
          meta={STATUS}
          options={STATUSES}
          editable={canManage}
          onChange={(next) => onStatusChange(campaign.id, next)}
          size="sm"
        />
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSelect(campaign)
            }}
            className="p-1.5 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-all"
            title="Ver detalle"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="8" cy="8" r="6.5" />
              <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {canManage && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(campaign)
                }}
                className="p-1.5 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-all"
                title="Editar"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M11 2l3 3-8 8H3v-3l8-8z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(campaign)
                }}
                className="p-1.5 rounded-lg text-[#999] hover:text-red-600 hover:bg-red-50 transition-all"
                title="Eliminar"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M3 4h10M6 4V2.5h4V4M5 4v8.5h6V4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
