import { useEffect, useMemo, useState } from 'react'
import UserPickerSingle from './tareas/UserPickerSingle'
import UserPickerMulti from './tareas/UserPickerMulti'
import { assignableUsers, flattenAssignable } from '../utils/lineFilters'
import { resolvedValue, staleResourceCount } from '../utils/staleClientResources'

/** Segundos que el botón de cerrar permanece bloqueado. */
export const CLOSE_DELAY_SECONDS = 5

function personName(user) {
  if (!user) return 'Desconocido'
  const full = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
  return full || 'Empleado archivado'
}

/**
 * Una fila: un recurso de una cuenta que apunta a alguien que ya no está.
 * Guarda en cuanto se elige en el picker (sin botón "Guardar"): con hasta ~17
 * filas posibles, un formulario único con un submit al final sería más lento de
 * usar y más frágil.
 */
function StaleRow({ item, entry, candidates, employees, saving, onReassign }) {
  const archivedNames = entry.archived.map(personName).join(', ')

  // Los ids que se conservan (multi) pueden pertenecer a alguien que no está en
  // el pool asignable de esta línea. Si no los agregamos, el picker no pinta su
  // chip y parecería que nadie está asignado (el valor sí se conserva, porque
  // UserPickerMulti construye el array nuevo a partir de selectedIds).
  const pickerUsers = useMemo(() => {
    if (!entry.multi) return candidates
    const known = new Set(candidates.map((u) => u.user_id))
    const extra = entry.keepIds
      .filter((id) => !known.has(id))
      .map((id) => employees.find((u) => u.user_id === id))
      .filter(Boolean)
    return extra.length > 0 ? [...candidates, ...extra] : candidates
  }, [candidates, employees, entry.multi, entry.keepIds])

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="sm:w-[190px] sm:flex-shrink-0">
        <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide">{entry.label}</p>
        <p className="text-[16px] leading-tight line-through text-[#999]">{archivedNames}</p>
      </div>
      <div className="flex-1 min-w-0 pickers-compact">
        {entry.multi ? (
          <UserPickerMulti
            users={pickerUsers}
            selectedIds={entry.keepIds}
            onChange={(ids) => onReassign(item.client.id, entry.field, resolvedValue(entry, ids))}
            placeholder={`Reasignar ${entry.label.toLowerCase()}...`}
          />
        ) : (
          <UserPickerSingle
            users={candidates}
            selectedId={null}
            onChange={(id) => onReassign(item.client.id, entry.field, resolvedValue(entry, id))}
            placeholder={`Reasignar ${entry.label.toLowerCase()}...`}
            clearable
          />
        )}
        {saving && <p className="text-[11.5px] font-mono text-[#aaa] mt-1">Guardando...</p>}
      </div>
    </div>
  )
}

/**
 * Aviso BLOQUEANTE para las jefas de línea: cuentas suyas con empleados
 * archivados todavía asignados como social / diseñador / audiovisual / apoyo.
 * Mientras no se reasignen, reaparece en cada entrada a la herramienta (el
 * descarte vive en memoria, ver hooks/useStaleClientResources.js).
 *
 * A diferencia de WhatsNewModal y ReportCloseReminderModal, este modal NO se
 * cierra con Escape ni haciendo clic fuera, y su botón está deshabilitado los
 * primeros CLOSE_DELAY_SECONDS segundos: es deliberadamente molesto porque la
 * hoja de clientes en PDF sale mal mientras esto no se arregle.
 *
 * Presentacional puro: recibe los datos y los callbacks del hook.
 */
export default function StaleClientResourcesModal({
  show,
  items = [],
  employees = [],
  lines = [],
  savingKey = null,
  error = null,
  onReassign,
  onClose,
}) {
  const [countdown, setCountdown] = useState(CLOSE_DELAY_SECONDS)

  useEffect(() => {
    if (!show) {
      setCountdown(CLOSE_DELAY_SECONDS)
      return
    }
    setCountdown(CLOSE_DELAY_SECONDS)
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [show])

  // Candidatos por (línea, departamento): mismos que ofrece ClientModal —
  // miembros de la línea + pool "Independientes", ya sin archivados
  // (crossLineUserIds filtra deleted_at), acotados al departamento del campo.
  const candidatesFor = useMemo(() => {
    const cache = new Map()
    return (line, departmentId) => {
      const key = `${line?.id ?? 'none'}:${departmentId ?? 'all'}`
      if (!cache.has(key)) {
        const pool = flattenAssignable(assignableUsers(employees, line, lines))
        cache.set(key, departmentId ? pool.filter((u) => u.department_id === departmentId) : pool)
      }
      return cache.get(key)
    }
  }, [employees, lines])

  if (!show) return null

  const total = staleResourceCount(items)
  const accountsLabel = `${items.length} ${items.length === 1 ? 'cuenta' : 'cuentas'}`

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[3px] flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recursos asignados que ya no están en la empresa"
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-5 bg-[#B91C1C] text-white">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
            Tienes {accountsLabel} con gente que ya no trabaja aquí
          </h2>
          <p className="text-[13.5px] text-white/80 mt-1">
            {total === 1 ? 'Hay 1 asignación' : `Hay ${total} asignaciones`} a empleados archivados.
            Mientras no las reasignes, la hoja de clientes en PDF sale con datos incorrectos.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <p className="text-[13px] text-[#991B1B] bg-[#FEE2E2] rounded-lg px-3 py-2">{error}</p>
          )}

          {items.map((item) => (
            <div key={item.client.id} className="border border-[#e0ddd4] rounded-xl px-4 py-3.5">
              <div className="flex items-center gap-2 mb-3">
                {/* Logo de la marca — mismo patrón que la tabla Base de Tareas. */}
                {item.client.logo_url ? (
                  <img
                    src={item.client.logo_url}
                    alt={item.client.name}
                    className="w-7 h-7 rounded-full object-cover border border-[#e0ddd4] flex-shrink-0"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-[#f0ede3] flex items-center justify-center text-[12px] font-bold text-[#aaa] uppercase flex-shrink-0">
                    {item.client.name?.[0]}
                  </span>
                )}
                <span className="text-[14.5px] font-semibold text-[#222]">{item.client.name}</span>
                <span className="ml-auto text-[12px] font-mono text-[#bbb]">
                  {item.line?.name ?? 'Sin línea'}
                </span>
              </div>
              <div className="space-y-3">
                {item.stale.map((entry) => (
                  <StaleRow
                    key={entry.field}
                    item={item}
                    entry={entry}
                    candidates={candidatesFor(item.line, entry.departmentId)}
                    employees={employees}
                    saving={savingKey === `${item.client.id}:${entry.field}`}
                    onReassign={onReassign}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-[#eeebe0]">
          <button
            onClick={onClose}
            disabled={countdown > 0}
            className="w-full px-4 py-2.5 bg-[#0d0d0d] text-white rounded-xl text-[15px] font-bold hover:bg-[#222] transition-colors disabled:bg-[#e0ddd4] disabled:text-[#999] disabled:cursor-not-allowed"
          >
            {countdown > 0 ? `Entendido (${countdown})` : 'Entendido'}
          </button>
          <p className="text-[11.5px] font-mono text-[#bbb] text-center mt-2">
            Este aviso volverá a aparecer hasta que reasignes todo.
          </p>
        </div>
      </div>
    </div>
  )
}
