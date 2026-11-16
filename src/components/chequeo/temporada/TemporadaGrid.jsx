import { Fragment } from 'react'
import { effectiveLineId } from '../../../utils/chequeo'
import {
  ASSIGNMENT_LABELS,
  ASSIGNMENT_ROLES,
  indexAssignments,
  indexPieces,
  piecesFor,
  resolveAssignee,
} from '../../../utils/temporada'
import TemporadaCell from './TemporadaCell'
import PersonSelect from './PersonSelect'

/**
 * Grilla de la temporada: una fila por cliente, una columna por slot. El personal (jefe, SM,
 * diseño y audiovisual) arranca con lo de MAPPI (líder de la línea y recursos del cliente) y
 * se puede cambiar a mano solo para esta temporada. Las cuentas de «Independientes» no
 * tienen jefe, así que esa casilla arranca vacía.
 */
export default function TemporadaGrid({
  lines,
  clients,
  pieces,
  assignments,
  slots,
  users,
  usersById,
  generalLineId,
  groupByLine,
  canManage,
  onAdd,
  onStatusChange,
  onRemove,
  onAssign,
}) {
  const index = indexPieces(pieces)
  const assignmentIndex = indexAssignments(assignments ?? [])
  const lineById = new Map(lines.map((l) => [l.id, l]))
  const colSpan = 1 + ASSIGNMENT_ROLES.length + slots.length

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
            {['Cliente', ...ASSIGNMENT_ROLES.map((r) => ASSIGNMENT_LABELS[r])].map((h) => (
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
                return (
                  <tr key={client.id} className="border-b border-[#f0ede3] align-top">
                    <td className="px-3 py-2.5 text-[14.5px] font-semibold text-[#111]">
                      {client.name}
                    </td>
                    {ASSIGNMENT_ROLES.map((role) => (
                      <td key={role} className="px-3 py-2.5">
                        <PersonSelect
                          role={role}
                          client={client}
                          resolved={resolveAssignee(assignmentIndex, role, client, clientLine)}
                          users={users}
                          usersById={usersById}
                          canManage={canManage}
                          onChange={(value) => onAssign(client, role, value)}
                        />
                      </td>
                    ))}
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
