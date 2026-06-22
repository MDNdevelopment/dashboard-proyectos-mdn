import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

/**
 * Modal crear/editar pregunta de evaluación.
 * Convención: question=null → crear, question=objeto → editar.
 */
export default function QuestionModal({
  question = null,
  companyId,
  departments,
  positions,
  onClose,
  onSaved,
}) {
  const isEdit = question != null

  const [text, setText] = useState(question?.text ?? '')
  const [selectedPositionIds, setSelectedPositionIds] = useState(() =>
    (question?.question_positions ?? []).map(qp => String(qp.position_id))
  )
  const [tags, setTags] = useState(() =>
    (question?.question_tags ?? []).map(qt => qt.tag)
  )
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  // ── Cargos: toggle ──────────────────────────────────────────────────────────
  function togglePosition(posId) {
    const id = String(posId)
    setSelectedPositionIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────
  function addTag() {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) return
    setTags(prev => [...prev, t])
    setTagInput('')
  }

  function removeTag(tag) {
    setTags(prev => prev.filter(t => t !== tag))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) {
      setError('El texto de la pregunta es obligatorio.')
      return
    }
    setSaving(true)
    setError(null)

    // 1. Crear o actualizar la pregunta
    let questionId
    if (isEdit) {
      const { data, error: err } = await supabase
        .from('questions')
        .update({ text: text.trim() })
        .eq('id', question.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      questionId = data.id
    } else {
      const { data, error: err } = await supabase
        .from('questions')
        .insert({ text: text.trim(), company_id: companyId, removed: false })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      questionId = data.id
    }

    // 2. Replace question_positions
    await supabase.from('question_positions').delete().eq('question_id', questionId)
    if (selectedPositionIds.length > 0) {
      await supabase
        .from('question_positions')
        .insert(selectedPositionIds.map(pid => ({ question_id: questionId, position_id: pid })))
    }

    // 3. Replace question_tags
    await supabase.from('question_tags').delete().eq('question_id', questionId)
    if (tags.length > 0) {
      await supabase
        .from('question_tags')
        .insert(tags.map(tag => ({ question_id: questionId, tag })))
    }

    // 4. Construir objeto para el update optimista en el padre
    const saved = {
      ...(isEdit ? question : {}),
      id: questionId,
      text: text.trim(),
      company_id: companyId,
      removed: false,
      question_positions: selectedPositionIds.map(pid => ({ position_id: pid })),
      question_tags: tags.map(tag => ({ tag })),
    }

    onSaved(saved)
    onClose()
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[16px] font-bold text-[#111]">
            {isEdit ? 'Editar pregunta' : 'Nueva pregunta'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Texto */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Texto de la pregunta *
            </label>
            <textarea
              className="input-base resize-none"
              rows={3}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Ej: ¿Cumple con los plazos de entrega establecidos?"
              autoFocus
            />
          </div>

          {/* Cargos: lista checkbox agrupada por departamento */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-2">
              Cargos que aplican
            </label>
            {departments.length === 0 ? (
              <p className="text-[12px] text-[#bbb] italic">
                No hay departamentos ni cargos creados todavía.
              </p>
            ) : (
              <div className="border border-[#e0ddd4] rounded-xl divide-y divide-[#f0ede3] max-h-52 overflow-y-auto">
                {departments.map(dept => {
                  const deptPositions = positions.filter(
                    p => String(p.department_id) === String(dept.department_id)
                  )
                  if (deptPositions.length === 0) return null
                  return (
                    <div key={dept.department_id} className="px-3 py-2">
                      <p className="text-[10px] font-mono font-bold tracking-[0.1em] uppercase text-[#aaa] mb-1.5">
                        {dept.department_name}
                      </p>
                      <div className="space-y-0.5">
                        {deptPositions.map(pos => {
                          const isSelected = selectedPositionIds.includes(String(pos.position_id))
                          return (
                            <button
                              key={pos.position_id}
                              type="button"
                              onClick={() => togglePosition(pos.position_id)}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-left ${
                                isSelected ? 'bg-[#f0fdf4] hover:bg-[#dcfce7]' : 'hover:bg-[#f5f3eb]'
                              }`}
                            >
                              <span className="flex-1 text-[13px] text-[#111]">
                                {pos.position_name}
                              </span>
                              <span
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                  isSelected
                                    ? 'border-[#16A34A] bg-[#16A34A]'
                                    : 'border-[#d1d5db] bg-white'
                                }`}
                              >
                                {isSelected && (
                                  <svg
                                    width="10" height="10" fill="none" viewBox="0 0 24 24"
                                    stroke="white" strokeWidth={3}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {selectedPositionIds.length > 0 && (
              <p className="text-[11px] text-[#888] mt-1.5">
                {selectedPositionIds.length} cargo{selectedPositionIds.length !== 1 ? 's' : ''} seleccionado{selectedPositionIds.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Tags (opcional)
            </label>
            {/* Input para agregar tag */}
            <div className="flex gap-2">
              <input
                type="text"
                className="input-base flex-1"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag() }
                }}
                placeholder="Ej: comunicación, liderazgo…"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!tagInput.trim()}
                className="px-3 py-2 rounded-xl text-[12px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-40"
              >
                Agregar
              </button>
            </div>
            {/* Chips de tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#92600a] bg-[#fff8e6] border border-[#fde68a] px-2 py-0.5 rounded-md"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-[#b45309] hover:text-[#92400e] transition-colors"
                      aria-label={`Quitar tag ${tag}`}
                    >
                      <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[13px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear pregunta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
