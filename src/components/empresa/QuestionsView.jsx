import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import QuestionModal from './QuestionModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'

export default function QuestionsView({ companyId }) {
  const [questions, setQuestions] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtro por cargo: '' = todos
  const [filterPosition, setFilterPosition] = useState('')

  // Modal: null=cerrado, undefined=crear, objeto=editar
  const [modal, setModal] = useState(null)

  // Diálogo de borrado: null | { item }
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [qRes, dRes, pRes] = await Promise.all([
      supabase
        .from('questions')
        .select('*, question_positions(position_id), question_tags(tag)')
        .eq('company_id', companyId)
        .eq('removed', false)
        .order('text'),
      supabase.from('departments').select('*').eq('company_id', companyId).order('department_name'),
      supabase.from('positions').select('*').eq('company_id', companyId).order('position_name'),
    ])
    setQuestions(qRes.data ?? [])
    setDepartments(dRes.data ?? [])
    setPositions(pRes.data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('empresa-questions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'question_positions' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'question_tags' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId, loadAll])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function positionName(positionId) {
    return positions.find(p => String(p.position_id) === String(positionId))?.position_name ?? ''
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleQuestionSaved(saved) {
    setQuestions(prev => {
      const exists = prev.some(q => q.id === saved.id)
      if (exists) return prev.map(q => q.id === saved.id ? saved : q)
      return [...prev, saved].sort((a, b) => a.text.localeCompare(b.text))
    })
  }

  async function handleConfirmDelete() {
    if (!deleteDialog) return
    setDeleting(true)
    await supabase
      .from('questions')
      .update({ removed: true })
      .eq('id', deleteDialog.item.id)
    setQuestions(prev => prev.filter(q => q.id !== deleteDialog.item.id))
    setDeleting(false)
    setDeleteDialog(null)
  }

  // ── Filtrado local ───────────────────────────────────────────────────────────
  const filteredQuestions = filterPosition
    ? questions.filter(q =>
        (q.question_positions ?? []).some(qp => String(qp.position_id) === String(filterPosition))
      )
    : questions

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
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-[15px] text-[#888]">
            {filteredQuestions.length} pregunta{filteredQuestions.length !== 1 ? 's' : ''}
            {filterPosition ? ' (filtradas)' : ''}
          </p>
          {/* Filtro por cargo */}
          {positions.length > 0 && (
            <select
              value={filterPosition}
              onChange={e => setFilterPosition(e.target.value)}
              className="input-base !py-1.5 !text-[14px] w-auto"
            >
              <option value="">Todos los cargos</option>
              {positions.map(p => (
                <option key={p.position_id} value={p.position_id}>
                  {p.position_name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={() => setModal(undefined)}
          className="w-full sm:w-auto px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
        >
          + Nueva pregunta
        </button>
      </div>

      {/* Estado vacío */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[17px] font-semibold text-[#888] mb-1">Sin preguntas</p>
          <p className="text-[15px] text-[#bbb]">
            {filterPosition
              ? 'No hay preguntas para este cargo. Cambia el filtro o crea una nueva.'
              : 'Crea la primera pregunta para comenzar.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuestions.map(q => {
            const posIds = (q.question_positions ?? []).map(qp => qp.position_id)
            const tags = (q.question_tags ?? []).map(qt => qt.tag)

            return (
              <div
                key={q.id}
                className="bg-white rounded-xl border border-[#e0ddd4] px-5 py-4 flex items-start gap-4"
              >
                {/* Texto de la pregunta */}
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] text-[#111] leading-snug mb-2">{q.text}</p>

                  {/* Chips de cargos */}
                  {posIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {posIds.map(pid => (
                        <span
                          key={pid}
                          className="text-[13px] font-medium text-[#555] bg-[#f5f3eb] border border-[#e8e5db] px-2 py-0.5 rounded-md"
                        >
                          {positionName(pid)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Chips de tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => (
                        <span
                          key={tag}
                          className="text-[13px] font-medium text-[#92600a] bg-[#fff8e6] border border-[#fde68a] px-2 py-0.5 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {posIds.length === 0 && tags.length === 0 && (
                    <p className="text-[13px] text-[#bbb] italic">Sin cargos ni tags asignados</p>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setModal(q)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:text-[#111] hover:bg-[#f5f3eb] transition-colors"
                    aria-label={`Editar pregunta`}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteDialog({ item: q })}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#888] hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label={`Eliminar pregunta`}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M13 4l-1 9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1L3 4" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear/editar pregunta */}
      {modal !== null && (
        <QuestionModal
          question={modal === undefined ? null : modal}
          companyId={companyId}
          departments={departments}
          positions={positions}
          onClose={() => setModal(null)}
          onSaved={handleQuestionSaved}
        />
      )}

      {/* Diálogo de borrado */}
      {deleteDialog !== null && (
        <ConfirmDeleteDialog
          itemName={deleteDialog.item.text.slice(0, 40)}
          itemLabel="pregunta"
          message={`La pregunta será ocultada del banco (soft delete). No se eliminan las respuestas históricas de evaluaciones anteriores.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteDialog(null)}
          confirming={deleting}
        />
      )}
    </>
  )
}
