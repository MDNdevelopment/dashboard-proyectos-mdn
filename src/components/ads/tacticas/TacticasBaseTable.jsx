import { useState } from 'react'
import ClientCell from '../ClientCell'
import StatusPill from '../../common/StatusPill'
import AvanceBar from './AvanceBar'
import { STATUS, STATUSES } from '../constants'
import { fmtDate } from '../campaignSpendApi'
import {
  checklistCounts,
  completionPct,
  daysLabel,
  daysLeft,
  isProgramada,
  isSinFecha,
  isVencidaSinCerrar,
  isVigente,
} from '../../../utils/tacticas'

/**
 * Tabla de la vista Base de Tácticas: una fila por táctica (vigentes e historial), con orden
 * por columna como la Base de Tareas. Por defecto, la más reciente primero.
 *
 * @param {object}   props
 * @param {Array}    props.campaigns     — tácticas a mostrar (ya filtradas)
 * @param {string}   props.today         — hoy en Caracas (YYYY-MM-DD)
 * @param {Map}      props.clientsById
 * @param {Map}      props.latestByBrand — client_id → última táctica (para avisar el link de Drive faltante)
 * @param {Function} props.leadOf        — (clientId) => nombre de la jefa | null
 * @param {boolean}  props.canManage
 * @param {Function} props.onSelect      — (campaign) => void, abre el detalle
 * @param {Function} props.onOpenBrand   — (clientId) => void, abre la ficha de la marca
 * @param {Function} props.onStatusChange — (campaign, status) => void
 * @param {Function} props.onEdit        — (campaign) => void
 * @param {Function} props.onDelete      — (campaign) => void, pide confirmación
 */
export default function TacticasBaseTable({
  campaigns,
  today,
  clientsById,
  latestByBrand,
  leadOf,
  canManage,
  onSelect,
  onOpenBrand,
  onStatusChange,
  onEdit,
  onDelete,
}) {
  const [sortKey, setSortKey] = useState('start_date')
  const [sortAsc, setSortAsc] = useState(false)

  function sortValue(c) {
    switch (sortKey) {
      case 'client':
        return (c.client ?? '').toLowerCase()
      case 'name':
        return (c.name ?? '').toLowerCase()
      case 'jefa':
        return (leadOf(c.client_id) ?? '').toLowerCase()
      case 'avance':
        // Sin checklist (null) no es lo mismo que 0 %: va al final al ordenar de mayor a menor.
        return completionPct(c.checklist) ?? -1
      default:
        return c[sortKey] ?? ''
    }
  }

  const rows = [...campaigns].sort((a, b) => {
    const va = sortValue(a)
    const vb = sortValue(b)
    if (va < vb) return sortAsc ? -1 : 1
    if (va > vb) return sortAsc ? 1 : -1
    return 0
  })

  function handleSort(key) {
    if (sortKey === key) setSortAsc((v) => !v)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const th = (key, label) => (
    <th
      key={key}
      onClick={() => handleSort(key)}
      aria-sort={sortKey === key ? (sortAsc ? 'ascending' : 'descending') : undefined}
      className="px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] whitespace-nowrap cursor-pointer select-none hover:text-[#555] transition-colors"
    >
      {label}
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
        className={`inline ml-1 ${sortKey === key ? 'opacity-100' : 'opacity-30'}`}
      >
        {sortAsc && sortKey === key ? (
          <path d="M4 1L7 6H1L4 1Z" fill="currentColor" />
        ) : (
          <path d="M4 7L1 2H7L4 7Z" fill="currentColor" />
        )}
      </svg>
    </th>
  )
  const plainTh =
    'px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] whitespace-nowrap'

  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
      {/* `relative`: los `sr-only` (absolute) de la tabla se anclan aquí; sin esto escapan del
          scroll interno y le agregan un scroll horizontal a toda la página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-left text-[15px] min-w-[960px]">
          <thead>
            <tr className="border-b border-[#ece9df] bg-[#faf9f5]">
              {th('client', 'Marca')}
              {th('name', 'Táctica')}
              {th('jefa', 'Jefa')}
              {th('start_date', 'Inicio')}
              {th('end_date', 'Vence')}
              <th className={plainTh}>Días</th>
              {th('avance', 'Avance')}
              <th className={plainTh}>Drive</th>
              {th('status', 'Estado')}
              <th className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const { done, total } = checklistCounts(c.checklist)
              const programada = isProgramada(c, today)
              const vencida = isVencidaSinCerrar(c, today)
              const enMarcha = isVigente(c, today) || vencida
              const isLatest = latestByBrand.get(c.client_id)?.id === c.id
              const client = clientsById?.get(c.client_id)
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className={`border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5] cursor-pointer transition-colors group ${
                    vencida ? 'bg-red-50/50' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-[#111] whitespace-nowrap">
                    {c.client_id ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenBrand(c.client_id)
                        }}
                        className="hover:underline text-left"
                        aria-label={`Ver ficha de ${c.client}`}
                      >
                        <ClientCell name={c.client} logoUrl={client?.logo_url} />
                      </button>
                    ) : (
                      <ClientCell name={c.client} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#333] max-w-[240px]">
                    <span className="font-medium line-clamp-2">{c.name}</span>
                    {programada && (
                      // La fecha ya está en la columna Inicio: aquí solo la etiqueta.
                      <span className="inline-block text-[11px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#e3f2fd] text-[#1565c0] mt-1">
                        Programada
                      </span>
                    )}
                    {vencida && (
                      <span className="block text-[13px] text-[#E14848] font-semibold mt-0.5">
                        vencida sin cerrar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-[#555] whitespace-nowrap">
                    {leadOf(c.client_id) ?? '—'}
                  </td>
                  {isSinFecha(c) ? (
                    <td colSpan={2} className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block text-[11.5px] font-mono font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-[#f5f3eb] border border-[#e0ddd4] text-[#666]">
                        Sin fecha
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(c)
                          }}
                          aria-label={`Agregar fecha a ${c.name}`}
                          className="ml-2 text-[13px] font-semibold text-[#111] underline decoration-[#FFB800] underline-offset-2"
                        >
                          Agregar fecha
                        </button>
                      )}
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-[14px] font-mono text-[#666] whitespace-nowrap">
                        {fmtDate(c.start_date)}
                      </td>
                      <td className="px-4 py-3 text-[14px] font-mono text-[#666] whitespace-nowrap">
                        {fmtDate(c.end_date)}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-[14px] font-mono text-[#555] whitespace-nowrap">
                    {enMarcha ? (
                      daysLabel(daysLeft(c, today))
                    ) : (
                      <span className="text-[#bbb]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AvanceBar done={done} total={total} />
                  </td>
                  <td className="px-4 py-3 text-[14px] whitespace-nowrap">
                    {c.presentation_url && (
                      <a
                        href={c.presentation_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block font-semibold text-[#111] underline decoration-[#FFB800] underline-offset-2 mb-1"
                      >
                        Táctica presentación
                      </a>
                    )}
                    {c.drive_url ? (
                      <a
                        href={c.drive_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-[#111] underline decoration-[#FFB800] underline-offset-2"
                      >
                        Carpeta
                      </a>
                    ) : isLatest && canManage ? (
                      <span className="text-[12.5px] font-semibold text-[#c77700]">
                        Falta el link
                      </span>
                    ) : (
                      <span className="text-[#bbb]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <StatusPill
                      value={c.status}
                      meta={STATUS}
                      options={STATUSES}
                      editable={canManage}
                      onChange={(next) => onStatusChange(c, next)}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(c)
                          }}
                          className="p-1.5 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-all"
                          title="Editar"
                          aria-label={`Editar ${c.name}`}
                        >
                          <svg
                            width="14"
                            height="14"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(c)
                          }}
                          className="p-1.5 rounded-lg text-[#999] hover:text-red-600 hover:bg-red-50 transition-all"
                          title="Eliminar"
                          aria-label={`Eliminar ${c.name}`}
                        >
                          <svg
                            width="14"
                            height="14"
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
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
