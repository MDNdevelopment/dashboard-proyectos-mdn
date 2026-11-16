import { Fragment } from 'react'
import { Avatar } from '../../tareas/UserPickerSingle'
import { effectiveLineId } from '../../../utils/chequeo'
import { indexPieces, piecesFor } from '../../../utils/temporada'
import TemporadaCell from './TemporadaCell'

function PersonCell({ user }) {
  if (!user) return <span className="text-[13px] text-[#ccc]">—</span>
  return (
    <span className="flex items-center gap-1.5 text-[13.5px] text-[#333]">
      <Avatar user={user} size={20} />
      {user.first_name}
    </span>
  )
}

/**
 * Grilla de la temporada: una fila por cliente, una columna por slot. JEFE y SM no se
 * capturan: salen de `metric_line_members.is_lead` y `metric_clients.social_manager_id`.
 * Las cuentas de «Independientes» no tienen jefe, así que esa celda queda vacía.
 */
export default function TemporadaGrid({
  lines,
  clients,
  pieces,
  slots,
  usersById,
  generalLineId,
  groupByLine,
  canManage,
  onAdd,
  onStatusChange,
  onRemove,
}) {
  const index = indexPieces(pieces)
  const lineById = new Map(lines.map((l) => [l.id, l]))
  const colSpan = 3 + slots.length

  const groups = groupByLine
    ? lines
        .map((line) => ({
          line,
          clients: clients.filter((c) => effectiveLineId(c, generalLineId) === line.id),
        }))
        .filter((g) => g.clients.length > 0)
    : [{ line: null, clients }]

  if (clients.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[17px] font-semibold text-[#888]">No hay cuentas para mostrar</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#faf9f5] border-b border-[#e0ddd4]">
            {['Cliente', 'Jefe', 'SM'].map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]"
              >
                {h}
              </th>
            ))}
            {slots.map((slot) => (
              <th
                key={slot.key}
                className="px-3 py-2.5 text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]"
              >
                {slot.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ line, clients: groupClients }) => (
            <Fragment key={line?.id ?? 'all'}>
              {line && (
                <tr className="bg-[#f2f0e8]">
                  <td
                    colSpan={colSpan}
                    className="px-3 py-1.5 text-[13px] font-semibold text-[#444]"
                  >
                    {line.name}
                  </td>
                </tr>
              )}
              {groupClients.map((client) => {
                const clientLine = lineById.get(effectiveLineId(client, generalLineId))
                const lead = clientLine?.lead_user_id
                  ? usersById.get(clientLine.lead_user_id)
                  : null
                return (
                  <tr key={client.id} className="border-b border-[#f0ede3] align-top">
                    <td className="px-3 py-2.5 text-[14.5px] font-semibold text-[#111]">
                      {client.name}
                    </td>
                    <td className="px-3 py-2.5">
                      <PersonCell user={lead} />
                    </td>
                    <td className="px-3 py-2.5">
                      <PersonCell user={usersById.get(client.social_manager_id)} />
                    </td>
                    {slots.map((slot) => (
                      <td key={slot.key} className="px-3 py-2.5">
                        <TemporadaCell
                          slot={slot}
                          pieces={piecesFor(index, client.id, slot.key)}
                          canManage={canManage}
                          onAdd={(type) => onAdd(client, slot, type)}
                          onStatusChange={onStatusChange}
                          onRemove={onRemove}
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
