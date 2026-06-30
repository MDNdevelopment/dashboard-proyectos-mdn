import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import getPastMonthRange from '../../utils/getPastMonthRange'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

/**
 * Modal de evaluación.
 * - evaluationId=undefined → modo crear (flujo completo).
 * - evaluationId=<id>     → modo ver (solo lectura + opción eliminar).
 */
export default function EvaluationModal({
  employee,
  evaluationId,
  managerId,
  onClose,
  onSaved,
  onDeleted,
}) {
  const isReadOnly = evaluationId != null
  const { firstDay } = getPastMonthRange()

  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState({})   // { question_id: value (1-5) }
  const [comment, setComment] = useState('')
  const initialEval = useRef({ responses: {}, comment: '' })
  // En modo lectura (isReadOnly) el value siempre iguala el baseline → dirty=false → sin confirm
  const { requestClose } = useUnsavedChanges({
    value: isReadOnly ? initialEval.current : { responses, comment },
    baseline: initialEval.current,
    onClose,
  })
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape' && !showDelete) requestClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose, showDelete])

  // ── Carga de datos ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!employee?.position_id) { setLoadingData(false); return }

    async function load() {
      setLoadingData(true)
      setError(null)

      // Cargar preguntas del cargo del empleado
      const { data: qpData, error: qpErr } = await supabase
        .from('question_positions')
        .select('question_id, questions(id, text, removed)')
        .eq('position_id', employee.position_id)

      if (qpErr) { setError(qpErr.message); setLoadingData(false); return }

      const activeQuestions = (qpData ?? [])
        .filter(qp => qp.questions && qp.questions.removed === false && qp.questions.text)
        .map(qp => qp.questions)

      setQuestions(activeQuestions)

      // Si es modo ver, cargar respuestas y comentario existentes
      if (isReadOnly) {
        const [respRes, commRes] = await Promise.all([
          supabase
            .from('evaluation_responses')
            .select('*')
            .eq('evaluation_id', evaluationId),
          supabase
            .from('evaluation_comments')
            .select('*')
            .eq('evaluation_id', evaluationId),
        ])

        const respMap = {}
        ;(respRes.data ?? []).forEach(r => { respMap[String(r.question_id)] = r.response })
        setResponses(respMap)
        setComment(commRes.data?.[0]?.comment ?? '')
      }

      setLoadingData(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.position_id, evaluationId, isReadOnly])

  // ── Cálculo de score ────────────────────────────────────────────────────────
  function computeScore(responsesMap, qs) {
    const total = qs.reduce((acc, q) => acc + (responsesMap[String(q.id)] ?? 0), 0)
    return qs.length === 0 ? 0 : parseFloat(((total / (qs.length * 5)) * 5).toFixed(2))
  }

  const allAnswered =
    questions.length > 0 &&
    questions.every(q => responses[String(q.id)] != null)

  // ── Submit (crear) ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!allAnswered) return
    setSaving(true)
    setError(null)

    const total_score = computeScore(responses, questions)

    // 1. Crear sesión de evaluación
    const { data: session, error: sessErr } = await supabase
      .from('evaluation_sessions')
      .insert({
        manager_id: managerId,
        employee_id: employee.user_id,
        period: firstDay,
        total_score,
      })
      .select()
      .single()

    if (sessErr) { setError(sessErr.message); setSaving(false); return }

    // 2. Insertar respuestas
    const responsesPayload = questions.map(q => ({
      evaluation_id: session.id,
      question_id: q.id,
      response: responses[String(q.id)],
    }))
    const { error: respErr } = await supabase
      .from('evaluation_responses')
      .insert(responsesPayload)

    if (respErr) { setError(respErr.message); setSaving(false); return }

    // 3. Insertar comentario (opcional)
    if (comment.trim()) {
      await supabase
        .from('evaluation_comments')
        .insert({ evaluation_id: session.id, comment: comment.trim() })
    }

    onSaved(session)
    onClose()
  }

  // ── Eliminar evaluación ─────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true)
    // Borrar hijos primero para evitar FK violations
    await supabase.from('evaluation_comments').delete().eq('evaluation_id', evaluationId)
    await supabase.from('evaluation_responses').delete().eq('evaluation_id', evaluationId)
    const { error: delErr } = await supabase
      .from('evaluation_sessions')
      .delete()
      .eq('id', evaluationId)

    if (delErr) {
      setError(delErr.message)
      setDeleting(false)
      setShowDelete(false)
      return
    }

    if (onDeleted) onDeleted(evaluationId)
    onClose()
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const employeeName = employee
    ? `${employee.first_name} ${employee.last_name}`
    : '—'

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
        onClick={e => { if (e.target === e.currentTarget && !showDelete) requestClose() }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
            <div>
              <h2 className="text-[18px] font-bold text-[#111]">
                {isReadOnly ? 'Evaluación' : 'Nueva evaluación'}
              </h2>
              <p className="text-[14px] text-[#888] mt-0.5">{employeeName}</p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
              aria-label="Cerrar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">
            {/* Período */}
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                Período:
              </span>
              <span className="text-[14px] font-mono text-[#555] bg-[#f5f3eb] px-2 py-0.5 rounded-full">
                {firstDay}
              </span>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : questions.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-[16px] font-semibold text-[#888]">Sin preguntas</p>
                <p className="text-[14px] text-[#bbb] mt-1">
                  No hay preguntas asignadas al cargo de este empleado.
                </p>
              </div>
            ) : (
              <form id="eval-form" onSubmit={handleSubmit} className="space-y-6">
                {questions.map((q, idx) => (
                  <div key={q.id}>
                    <label className="block text-[15px] font-semibold text-[#111] mb-2.5">
                      <span className="text-[#bbb] font-mono mr-1.5">{idx + 1}.</span>
                      {q.text}
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(val => {
                        const selected = responses[String(q.id)] === val
                        return (
                          <button
                            key={val}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => {
                              if (isReadOnly) return
                              setResponses(prev => ({ ...prev, [String(q.id)]: val }))
                            }}
                            className={`w-10 h-10 rounded-xl text-[16px] font-bold transition-all border ${
                              selected
                                ? 'bg-[#FFB800] text-[#111] border-[#FFB800] shadow-sm'
                                : 'bg-white text-[#555] border-[#e0ddd4] hover:border-[#FFB800] hover:bg-[#fff8e6]'
                            } ${isReadOnly ? 'cursor-default' : ''}`}
                            aria-label={`Opción ${val}`}
                          >
                            {val}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Comentario */}
                <div>
                  <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                    Comentario {isReadOnly ? '' : '(opcional)'}
                  </label>
                  {isReadOnly ? (
                    <p className="text-[15px] text-[#555] bg-[#f5f3eb] rounded-xl px-3 py-2.5 min-h-[60px]">
                      {comment || <span className="text-[#bbb] italic">Sin comentario</span>}
                    </p>
                  ) : (
                    <textarea
                      className="input-base resize-none"
                      rows={3}
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Observaciones adicionales sobre el desempeño…"
                    />
                  )}
                </div>
              </form>
            )}
          </div>

          {/* Footer */}
          {!loadingData && questions.length > 0 && (
            <div className="px-6 pb-5 flex items-center justify-between">
              {isReadOnly ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDelete(true)}
                    className="px-4 py-2 rounded-xl text-[15px] font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={requestClose}
                    className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                  >
                    Cerrar
                  </button>
                </>
              ) : (
                <>
                  <div className="text-[14px] text-[#aaa] font-mono">
                    {Object.keys(responses).length}/{questions.length} respondidas
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={requestClose}
                      className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      form="eval-form"
                      disabled={!allAnswered || saving}
                      className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Guardando…' : 'Guardar evaluación'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showDelete && (
        <ConfirmDeleteDialog
          itemName={employeeName}
          itemLabel="evaluación"
          message={
            <>
              Esta acción <strong>no se puede deshacer</strong>. Se eliminarán la evaluación, todas
              sus respuestas y comentarios. Escribe el nombre del empleado para confirmar.
            </>
          }
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          confirming={deleting}
        />
      )}
    </>
  )
}
