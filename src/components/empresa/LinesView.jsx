import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import {
  loadLines,
  updateLine,
  deleteLine,
  loadCompanyUsers,
} from '../metricas/metricsApi'
import { assignMemberToLine, removeMemberFromLine } from '../../utils/lineMembers'
import LineModal from './LineModal'
import LineMetasModal from './LineMetasModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

/**
 * Gestión de líneas operativas y sus miembros (empleados).
 * Permite:
 *   - Crear / renombrar / eliminar líneas (LineModal + ConfirmDeleteDialog)
 *   - Asignar empleados a una línea (selector por línea)
 *   - Mover un empleado de línea (assignMemberToLine lo quita de la anterior)
 *   - Quitar un empleado de su línea
 */
export default function LinesView({ companyId }) {
  const [lines, setLines]     = useState([])
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [lineModal, setLineModal]       = useState(undefined)   // undefined=cerrado, null=crear, obj=editar
  const [metasModal, setMetasModal]     = useState(null)        // null=cerrado, obj=línea a editar metas
  const [confirmDelete, setConfirmDelete] = useState(null)       // { id, name }
  const [deleting, setDeleting]         = useState(false)
  const [savingLine, setSavingLine]     = useState(null)         // lineId que está guardando miembros
  const [error, setError]               = useState(null)

  // ── Carga ─────────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!companyId) return
    const [linesRes, usersRes] = await Promise.all([
      loadLines(companyId),
      loadCompanyUsers(companyId),
    ])
    setLines(linesRes.data ?? [])
    setUsers(usersRes.data ?? [])
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
  }, [companyId, fetchAll])

  // ── Realtime ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('empresa-lineas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_lines' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId, fetchAll])

  // ── Guardar miembros en Supabase (una o varias líneas) ───────────────────────
  async function persistLines(changedIds, updatedLines) {
    for (const lineId of changedIds) {
      const line = updatedLines.find(l => l.id === lineId)
      if (!line) continue
      await updateLine(lineId, { member_user_ids: line.member_user_ids })
    }
  }

  // ── Asignar empleado a una línea ──────────────────────────────────────────────
  async function handleAssignMember(lineId, userId) {
    if (!userId) return
    setSavingLine(lineId)
    const { updated, changedIds } = assignMemberToLine(lines, lineId, userId)
    setLines(updated)
    await persistLines(changedIds, updated)
    setSavingLine(null)
  }

  // ── Quitar empleado de una línea ──────────────────────────────────────────────
  async function handleRemoveMember(lineId, userId) {
    setSavingLine(lineId)
    const { updated, changedIds } = removeMemberFromLine(lines, lineId, userId)
    setLines(updated)
    await persistLines(changedIds, updated)
    setSavingLine(null)
  }

  // ── Estado optimista: líneas guardadas desde LineModal ────────────────────────
  function handleLineSaved(row) {
    setLines(prev => {
      const idx = prev.findIndex(l => l.id === row.id)
      if (idx >= 0) return prev.map(l => l.id === row.id ? { ...l, ...row } : l)
      return [...prev, row].sort((a, b) => a.sort_order - b.sort_order)
    })
  }

  // ── Eliminar línea ────────────────────────────────────────────────────────────
  async function handleDeleteLine() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error: err } = await deleteLine(confirmDelete.id)
    setDeleting(false)
    if (err) { setError(err.message); setConfirmDelete(null); return }
    setLines(prev => prev.filter(l => l.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function userOf(userId) {
    return users.find(u => u.user_id === userId)
  }

  function fullName(u) {
    if (!u) return userId => userId
    return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  }

  // Empleados no asignados a la línea (para el selector)
  function availableUsers(line) {
    const members = line.member_user_ids ?? []
    // Mostramos TODOS los usuarios en el selector para permitir mover entre líneas
    return users.filter(u => !members.includes(u.user_id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <p className="text-[15px] text-[#888] max-w-xl">
          Gestioná las líneas operativas y asigná empleados a cada una.
          Al asignar un empleado a una línea, se mueve automáticamente si ya pertenecía a otra.
        </p>
        <button
          onClick={() => setLineModal(null)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FAB51A] text-[#111] font-bold text-[14.5px] hover:bg-[#e8a315] transition-colors flex-shrink-0 ml-4"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6.5 1v11M1 6.5h11" strokeLinecap="round"/>
          </svg>
          Nueva línea
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {lines.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[16px] font-semibold text-[#888] mb-1">Sin líneas</p>
          <p className="text-[14px] text-[#bbb]">Creá la primera línea operativa para comenzar.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lines.map(line => {
            const members = line.member_user_ids ?? []
            const available = availableUsers(line)
            const isSaving = savingLine === line.id

            return (
              <div
                key={line.id}
                className="bg-white rounded-2xl border border-[#e0ddd4] overflow-hidden"
              >
                {/* Card header */}
                <div
                  className="px-5 py-3 flex items-center justify-between border-b border-[#f0ede3]"
                  style={{ background: line.color + '14' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: line.color }}
                    />
                    <span className="text-[15.5px] font-bold text-[#111]">{line.name}</span>
                    <span className="text-[12px] font-mono text-[#aaa]">
                      {members.length} {members.length !== 1 ? 'miembros' : 'miembro'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setMetasModal(line)}
                      className="p-1.5 rounded-lg text-[#aaa] hover:text-[#555] hover:bg-white/60 transition-colors"
                      title="Configurar metas"
                      aria-label="Configurar metas"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <circle cx="8" cy="8" r="2.5"/>
                        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setLineModal(line)}
                      className="p-1.5 rounded-lg text-[#aaa] hover:text-[#555] hover:bg-white/60 transition-colors"
                      title="Editar línea"
                      aria-label="Editar línea"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M11 2l3 3-8 8H3v-3L11 2Z" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: line.id, name: line.name })}
                      className="p-1.5 rounded-lg text-[#aaa] hover:text-red-400 hover:bg-white/60 transition-colors"
                      title="Eliminar línea"
                      aria-label="Eliminar línea"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5l.5-8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Miembros */}
                <div className="px-5 py-3 space-y-2">
                  {members.length === 0 ? (
                    <p className="text-[13.5px] text-[#bbb] py-1">Sin miembros asignados.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {members.map(uid => {
                        const u = userOf(uid)
                        return (
                          <div
                            key={uid}
                            className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-[#f5f3eb] rounded-full"
                          >
                            {/* Avatar o inicial */}
                            {u?.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt=""
                                className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                              />
                            ) : (
                              <div
                                className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-[#111]"
                                style={{ background: line.color + '44' }}
                              >
                                {u ? (u.first_name?.[0] ?? '') + (u.last_name?.[0] ?? '') : '?'}
                              </div>
                            )}
                            <span className="text-[13px] font-medium text-[#333]">
                              {u ? fullName(u) : uid}
                            </span>
                            <button
                              onClick={() => handleRemoveMember(line.id, uid)}
                              className="ml-0.5 text-[#ccc] hover:text-red-400 transition-colors"
                              aria-label={`Quitar ${u ? fullName(u) : uid}`}
                              disabled={isSaving}
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 2l6 6M8 2L2 8" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Selector: agregar/mover empleado */}
                  {available.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <select
                        className="input-base flex-1 text-[13.5px]"
                        defaultValue=""
                        disabled={isSaving}
                        onChange={e => {
                          const uid = e.target.value
                          if (uid) {
                            handleAssignMember(line.id, uid)
                            e.target.value = ''
                          }
                        }}
                        aria-label={`Agregar empleado a ${line.name}`}
                      >
                        <option value="" disabled>Agregar empleado…</option>
                        {available.map(u => (
                          <option key={u.user_id} value={u.user_id}>
                            {fullName(u)}
                          </option>
                        ))}
                      </select>
                      {isSaving && (
                        <div className="w-4 h-4 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal línea */}
      {lineModal !== undefined && (
        <LineModal
          line={lineModal}
          companyId={companyId}
          sortOrder={lines.length}
          onClose={() => setLineModal(undefined)}
          onSaved={handleLineSaved}
        />
      )}

      {/* Modal metas de línea */}
      {metasModal && (
        <LineMetasModal
          line={metasModal}
          onClose={() => setMetasModal(null)}
          onSaved={row => {
            handleLineSaved(row)
            setMetasModal(null)
          }}
        />
      )}

      {/* Diálogo eliminar línea */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.name}
          itemLabel="línea"
          onConfirm={handleDeleteLine}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        />
      )}
    </div>
  )
}
