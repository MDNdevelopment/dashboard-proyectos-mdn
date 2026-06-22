import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import DepartmentModal from './DepartmentModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

export default function DepartmentsView({ companyId }) {
  const [departments, setDepartments] = useState([])
  const [positionsByDept, setPositionsByDept] = useState(new Map())
  const [loading, setLoading] = useState(true)

  // Qué departamentos están expandidos
  const [expandedDepts, setExpandedDepts] = useState(new Set())

  // Modal de departamento: null=cerrado, undefined=crear, objeto=editar
  const [deptModal, setDeptModal] = useState(null)

  // Diálogo de borrado: null | { type: 'dept'|'pos', item }
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Inline: agregar cargo
  const [addingPos, setAddingPos] = useState(null) // department_id | null
  const [newPosName, setNewPosName] = useState('')
  const [savingPos, setSavingPos] = useState(false)

  // Inline: editar cargo
  const [editingPos, setEditingPos] = useState(null) // { position_id, position_name } | null

  const [posError, setPosError] = useState(null)

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [deptsRes, posRes] = await Promise.all([
      supabase.from('departments').select('*').eq('company_id', companyId).order('department_name'),
      supabase.from('positions').select('*').eq('company_id', companyId).order('position_name'),
    ])
    const depts = deptsRes.data ?? []
    const positions = posRes.data ?? []

    setDepartments(depts)

    const map = new Map()
    for (const d of depts) map.set(d.department_id, [])
    for (const p of positions) {
      const list = map.get(p.department_id)
      if (list) list.push(p)
    }
    setPositionsByDept(map)
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('empresa-departments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId, loadAll])

  // ── Handlers departamentos ──────────────────────────────────────────────────
  function toggleExpand(deptId) {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      if (next.has(deptId)) next.delete(deptId)
      else next.add(deptId)
      return next
    })
  }

  async function handleToggleVisible(dept) {
    const next = !dept.dashboard_visible
    await supabase
      .from('departments')
      .update({ dashboard_visible: next })
      .eq('department_id', dept.department_id)
    setDepartments(prev =>
      prev.map(d => d.department_id === dept.department_id ? { ...d, dashboard_visible: next } : d)
    )
  }

  function handleDeptSaved(saved) {
    setDepartments(prev => {
      const exists = prev.some(d => d.department_id === saved.department_id)
      if (exists) return prev.map(d => d.department_id === saved.department_id ? saved : d)
      return [...prev, saved].sort((a, b) => a.department_name.localeCompare(b.department_name))
    })
    setPositionsByDept(prev => {
      if (prev.has(saved.department_id)) return prev
      return new Map(prev).set(saved.department_id, [])
    })
  }

  function openDeleteDept(dept) {
    const positions = positionsByDept.get(dept.department_id) ?? []
    if (positions.length > 0) {
      // Bloquear: el departamento tiene cargos
      alert(
        `No puedes eliminar "${dept.department_name}" porque tiene ${positions.length} cargo${positions.length !== 1 ? 's' : ''} asociado${positions.length !== 1 ? 's' : ''}.\nElimina primero los cargos.`
      )
      return
    }
    setDeleteDialog({ type: 'dept', item: dept })
  }

  // ── Borrado confirmado ──────────────────────────────────────────────────────
  async function handleConfirmDelete() {
    if (!deleteDialog) return
    setDeleting(true)

    if (deleteDialog.type === 'dept') {
      await supabase
        .from('departments')
        .delete()
        .eq('department_id', deleteDialog.item.department_id)
      setDepartments(prev =>
        prev.filter(d => d.department_id !== deleteDialog.item.department_id)
      )
      setPositionsByDept(prev => {
        const next = new Map(prev)
        next.delete(deleteDialog.item.department_id)
        return next
      })
    } else {
      // type === 'pos'
      await supabase
        .from('positions')
        .delete()
        .eq('position_id', deleteDialog.item.position_id)
      setPositionsByDept(prev => {
        const next = new Map(prev)
        const deptId = deleteDialog.item.department_id
        next.set(deptId, (next.get(deptId) ?? []).filter(p => p.position_id !== deleteDialog.item.position_id))
        return next
      })
    }

    setDeleting(false)
    setDeleteDialog(null)
  }

  // ── Cargos: agregar inline ──────────────────────────────────────────────────
  async function handleAddPosition(deptId) {
    const name = newPosName.trim()
    if (!name) return
    setSavingPos(true)
    setPosError(null)

    const { data, error } = await supabase
      .from('positions')
      .insert({ position_name: name, department_id: deptId, company_id: companyId })
      .select()
      .single()

    if (error) { setPosError(error.message); setSavingPos(false); return }

    setPositionsByDept(prev => {
      const next = new Map(prev)
      const list = next.get(deptId) ?? []
      next.set(deptId, [...list, data].sort((a, b) => a.position_name.localeCompare(b.position_name)))
      return next
    })
    setNewPosName('')
    setAddingPos(null)
    setSavingPos(false)
  }

  // ── Cargos: editar inline ───────────────────────────────────────────────────
  async function handleSaveEditPos() {
    if (!editingPos) return
    const name = editingPos.position_name.trim()
    if (!name) return
    setSavingPos(true)
    setPosError(null)

    const { data, error } = await supabase
      .from('positions')
      .update({ position_name: name })
      .eq('position_id', editingPos.position_id)
      .select()
      .single()

    if (error) { setPosError(error.message); setSavingPos(false); return }

    setPositionsByDept(prev => {
      const next = new Map(prev)
      for (const [deptId, list] of next.entries()) {
        if (list.some(p => p.position_id === data.position_id)) {
          next.set(deptId, list.map(p => p.position_id === data.position_id ? data : p))
          break
        }
      }
      return next
    })
    setEditingPos(null)
    setSavingPos(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#888]">
          {departments.length} departamento{departments.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => setDeptModal(undefined)}
          className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
        >
          + Nuevo departamento
        </button>
      </div>

      {/* Estado vacío */}
      {departments.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[15px] font-semibold text-[#888] mb-1">Sin departamentos</p>
          <p className="text-[13px] text-[#bbb]">Crea el primer departamento para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map(dept => {
            const positions = positionsByDept.get(dept.department_id) ?? []
            const isExpanded = expandedDepts.has(dept.department_id)
            const isAddingHere = addingPos === dept.department_id

            return (
              <div key={dept.department_id} className="bg-white rounded-xl border border-[#e0ddd4]">
                {/* Fila del departamento */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {/* Expandir / colapsar */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(dept.department_id)}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#888] hover:text-[#111] hover:bg-[#f5f3eb] transition-colors"
                    aria-label={isExpanded ? 'Colapsar' : 'Expandir'}
                  >
                    <svg
                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M4 2l4 4-4 4" />
                    </svg>
                  </button>

                  {/* Nombre */}
                  <span className="flex-1 text-[14px] font-semibold text-[#111]">
                    {dept.department_name}
                  </span>

                  {/* Cantidad de cargos */}
                  <span className="text-[11px] font-mono text-[#999] bg-[#f5f3eb] px-2 py-0.5 rounded-full">
                    {positions.length} cargo{positions.length !== 1 ? 's' : ''}
                  </span>

                  {/* Toggle dashboard_visible */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dept.dashboard_visible}
                    onClick={() => handleToggleVisible(dept)}
                    title={dept.dashboard_visible ? 'Visible en dashboard' : 'Oculto en dashboard'}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      dept.dashboard_visible ? 'bg-[#FFB800]' : 'bg-[#d8d4c8]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        dept.dashboard_visible ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>

                  {/* Editar */}
                  <button
                    type="button"
                    onClick={() => setDeptModal(dept)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:text-[#111] hover:bg-[#f5f3eb] transition-colors"
                    aria-label={`Editar ${dept.department_name}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" />
                    </svg>
                  </button>

                  {/* Eliminar */}
                  <button
                    type="button"
                    onClick={() => openDeleteDept(dept)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label={`Eliminar ${dept.department_name}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M13 4l-1 9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1L3 4" />
                    </svg>
                  </button>
                </div>

                {/* Lista de cargos (expandida) */}
                {isExpanded && (
                  <div className="border-t border-[#f0ede3] px-4 py-3">
                    {positions.length === 0 && !isAddingHere && (
                      <p className="text-[12px] text-[#bbb] italic mb-2">
                        Sin cargos. Agrega uno con el botón de abajo.
                      </p>
                    )}

                    <div className="space-y-1 mb-2">
                      {positions.map(pos => {
                        const isEditingThis = editingPos?.position_id === pos.position_id
                        return (
                          <div key={pos.position_id} className="flex items-center gap-2 group">
                            {isEditingThis ? (
                              <>
                                <input
                                  type="text"
                                  className="input-base flex-1 !py-1.5 text-[13px]"
                                  value={editingPos.position_name}
                                  onChange={e =>
                                    setEditingPos(ep => ({ ...ep, position_name: e.target.value }))
                                  }
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveEditPos()
                                    if (e.key === 'Escape') setEditingPos(null)
                                  }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveEditPos}
                                  disabled={savingPos}
                                  className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#111] text-white hover:bg-[#222] disabled:opacity-50 transition-colors"
                                >
                                  {savingPos ? '…' : 'Guardar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPos(null)}
                                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-[13px] text-[#333] py-1">
                                  {pos.position_name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingPos({
                                      position_id: pos.position_id,
                                      position_name: pos.position_name,
                                    })
                                  }
                                  className="w-6 h-6 flex items-center justify-center rounded text-[#bbb] hover:text-[#111] hover:bg-[#f5f3eb] opacity-0 group-hover:opacity-100 transition-all"
                                  aria-label={`Editar cargo ${pos.position_name}`}
                                >
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                                    <path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteDialog({ type: 'pos', item: pos })}
                                  className="w-6 h-6 flex items-center justify-center rounded text-[#bbb] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                  aria-label={`Eliminar cargo ${pos.position_name}`}
                                >
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                                    <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M13 4l-1 9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1L3 4" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {posError && (
                      <p className="text-[12px] text-red-600 mb-2">{posError}</p>
                    )}

                    {isAddingHere ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          className="input-base flex-1 !py-1.5 text-[13px]"
                          value={newPosName}
                          onChange={e => setNewPosName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddPosition(dept.department_id)
                            if (e.key === 'Escape') { setAddingPos(null); setNewPosName('') }
                          }}
                          placeholder="Nombre del cargo"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleAddPosition(dept.department_id)}
                          disabled={savingPos || !newPosName.trim()}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#111] text-white hover:bg-[#222] disabled:opacity-50 transition-colors"
                        >
                          {savingPos ? '…' : 'Agregar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingPos(null); setNewPosName(''); setPosError(null) }}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingPos(dept.department_id)
                          setNewPosName('')
                          setPosError(null)
                        }}
                        className="text-[12px] font-semibold text-[#888] hover:text-[#111] transition-colors mt-1"
                      >
                        + Agregar cargo
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear/editar departamento */}
      {deptModal !== null && (
        <DepartmentModal
          department={deptModal === undefined ? null : deptModal}
          companyId={companyId}
          onClose={() => setDeptModal(null)}
          onSaved={handleDeptSaved}
        />
      )}

      {/* Diálogo de borrado con escritura del nombre */}
      {deleteDialog !== null && (
        <ConfirmDeleteDialog
          itemName={
            deleteDialog.type === 'dept'
              ? deleteDialog.item.department_name
              : deleteDialog.item.position_name
          }
          itemLabel={deleteDialog.type === 'dept' ? 'departamento' : 'cargo'}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteDialog(null)}
          confirming={deleting}
        />
      )}
    </>
  )
}
