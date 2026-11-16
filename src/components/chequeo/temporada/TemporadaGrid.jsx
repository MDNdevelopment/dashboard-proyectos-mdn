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

// Columnas angostas para que quepa más información sin scroll horizontal: el cliente y el
// personal ocupan poco; el ancho se lo llevan las fechas, que son la información principal.
const TH = 'px-2 py-2.5 text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]'
const CLIENT_COL = 'w-[118px] min-w-[96px] max-w-[118px]'
const PERSON_COL = 'w-[112px] min-w-[96px] max-w-[112px]'
// Solo líneas verticales entre columnas (sin horizontales: la fila se resalta con hover). La columna de Cliente está fija (sticky) y en una tabla
// con bordes colapsados el borde de una celda fija no se mueve con ella al hacer scroll, por
// eso esa usa una sombra interior en vez de borde.
const VLINE = 'border-r border-[#e8e4d8] last:border-r-0'
const STICKY_LINE = 'shadow-[inset_-1px_0_0_#e8e4d8]'

/**
 * Grilla de la temporada: una fila por cliente, una columna por slot. El personal (jefe y SM,
 * las dos casillas con nombre de la hoja) arranca con lo de MAPPI (líder de la línea y SM del
 * cliente) y se puede cambiar a mano solo para esta temporada. Las cuentas de «Independientes»
 * no tienen jefe, así que esa casilla arranca vacía.
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
          <tr className="bg-[#faf9f5]">
            <th className={`${TH} ${CLIENT_COL} sticky left-0 z-[2] bg-[#faf9f5] ${STICKY_LINE}`}>
              Cliente
            </th>
            {ASSIGNMENT_ROLES.map((r) => (
              <th key={r} className={`${TH} ${PERSON_COL} ${VLINE}`}>
                {ASSIGNMENT_LABELS[r]}
              </th>
            ))}
            {slots.map((slot) => (
              <th key={slot.key} className={`${TH} ${VLINE}`}>
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
                  <tr
                    key={client.id}
                    className="group align-top transition-colors hover:bg-[#faf9f5]"
                  >
                    <td
                      className={`px-2 py-2 text-[14px] font-semibold leading-tight text-[#111] break-words sticky left-0 z-[1] bg-white transition-colors group-hover:bg-[#faf9f5] ${STICKY_LINE} ${CLIENT_COL}`}
                    >
                      {client.name}
                    </td>
                    {ASSIGNMENT_ROLES.map((role) => (
                      <td key={role} className={`px-1.5 py-2 ${PERSON_COL} ${VLINE}`}>
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
                      <td key={slot.key} className={`px-2 py-2 ${VLINE}`}>
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
