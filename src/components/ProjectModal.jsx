import { useState, useEffect, useRef } from 'react'

const DEPARTMENTS = ['Redes', 'Diseño', 'Audiovisual', 'Tecnología']
const STATUSES = ['Pendiente', 'En proceso', 'Completado']
const STATUS_DOT = { 'Pendiente': '#f59e0b', 'En proceso': '#3b82f6', 'Completado': '#22c55e' }

const uid = () => Math.random().toString(36).slice(2)
const mkTask = () => ({ id: uid(), name: '', status: 'pendiente' })
const mkPhase = () => ({ id: uid(), name: '', tasks: [mkTask()] })

export default function ProjectModal({ project, onClose, onSave }) {
  const isEdit = !!project
  const nameRef = useRef(null)

  const [form, setForm] = useState(() => project
    ? {
        name: project.name ?? '',
        departments: project.departments ?? (project.department ? [project.department] : []),
        team: project.team ?? '',
        requirements: project.requirements ?? '',
        status: project.status ?? 'Pendiente',
        phases: project.phases?.length ? project.phases : [mkPhase()],
      }
    : { name: '', departments: [], team: '', requirements: '', status: 'Pendiente', phases: [mkPhase()] }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 80) }, [])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleDept = d => set('departments', form.departments.includes(d) ? form.departments.filter(x => x !== d) : [...form.departments, d])

  const addPhase = () => set('phases', [...form.phases, mkPhase()])
  const delPhase = id => set('phases', form.phases.filter(p => p.id !== id))
  const setPhase = (id, name) => set('phases', form.phases.map(p => p.id === id ? { ...p, name } : p))
  const addTask = pid => set('phases', form.phases.map(p => p.id === pid ? { ...p, tasks: [...p.tasks, mkTask()] } : p))
  const delTask = (pid, tid) => set('phases', form.phases.map(p => p.id === pid ? { ...p, tasks: p.tasks.filter(t => t.id !== tid) } : p))
  const setTask = (pid, tid, name) => set('phases', form.phases.map(p =>
    p.id === pid ? { ...p, tasks: p.tasks.map(t => t.id === tid ? { ...t, name } : t) } : p
  ))

  const submit = async e => {
    e?.preventDefault()
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return }
    setLoading(true); setError('')
    try {
      await onSave({
        name: form.name.trim(),
        departments: form.departments,
        team: form.team.trim(),
        requirements: form.requirements.trim(),
        status: form.status,
        phases: form.phases.filter(p => p.name.trim()).map(p => ({ ...p, tasks: p.tasks.filter(t => t.name.trim()) })),
      })
    } catch { setError('Error al guardar.'); setLoading(false) }
  }

  return (
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#eeebe0] flex-shrink-0">
          <div>
            <h2 className="text-[16px] font-semibold text-[#111] tracking-[-0.01em]">
              {isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}
            </h2>
            <p className="text-[12px] text-[#999] mt-0.5">
              {isEdit ? 'Modifica datos, fases o tareas' : 'Define el proyecto y sus actividades'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Name */}
          <Field label="Nombre del proyecto *">
            <input
              ref={nameRef}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ej: Automatización de grillas de contenido"
              className="input-base"
            />
          </Field>

          {/* Departments */}
          <Field label="Departamentos — selecciona uno o varios">
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map(d => {
                const sel = form.departments.includes(d)
                return (
                  <button key={d} type="button" onClick={() => toggleDept(d)}
                    className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                      sel ? 'bg-[#FFB800] text-[#111] border-[#FFB800]'
                          : 'bg-white text-[#666] border-[#e0ddd4] hover:border-[#bbb] hover:text-[#333]'
                    }`}>
                    {d}
                  </button>
                )
              })}
            </div>
          </Field>

          {/* Team + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Equipo / Responsable">
              <input
                value={form.team}
                onChange={e => set('team', e.target.value)}
                placeholder="Ej: María García"
                className="input-base"
              />
            </Field>
            <Field label="Estado del proyecto">
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => set('status', s)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all flex items-center gap-1.5 ${
                      form.status === s
                        ? 'text-white border-transparent'
                        : 'bg-white text-[#666] border-[#e0ddd4] hover:border-[#bbb]'
                    }`}
                    style={form.status === s ? { background: STATUS_DOT[s], borderColor: STATUS_DOT[s] } : {}}
                  >
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: form.status === s ? 'rgba(255,255,255,0.7)' : STATUS_DOT[s] }} />
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Requirements */}
          <Field label="Descripción / Contexto (opcional)">
            <textarea
              value={form.requirements}
              onChange={e => set('requirements', e.target.value)}
              placeholder="¿Qué resuelve o automatiza este proyecto?"
              rows={2}
              className="input-base resize-none"
            />
          </Field>

          {/* Phases */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#777]">
                Fases y tareas
              </span>
              <button type="button" onClick={addPhase}
                className="text-[12px] font-semibold text-[#555] hover:text-[#111] border border-[#e0ddd4] hover:border-[#bbb] px-3 py-1 rounded-lg transition-all flex items-center gap-1.5">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                </svg>
                Añadir fase
              </button>
            </div>

            <div className="space-y-3">
              {form.phases.map((phase, idx) => (
                <div key={phase.id} className="border border-[#e8e5db] rounded-xl p-4 bg-[#faf9f5]">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      value={phase.name}
                      onChange={e => setPhase(phase.id, e.target.value)}
                      placeholder={`Fase ${idx + 1} — ej: Diseño, Desarrollo, Testing…`}
                      className="flex-1 border border-[#e0ddd4] rounded-lg px-3 py-2 text-[13px] font-semibold text-[#333] placeholder-[#bbb] outline-none focus:border-[#bbb] bg-white font-sans"
                    />
                    {form.phases.length > 1 && (
                      <button type="button" onClick={() => delPhase(phase.id)}
                        className="w-7 h-7 flex items-center justify-center text-[#ccc] hover:text-[#ef4444] hover:bg-[#fff1f1] rounded-lg transition-colors">
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 mb-2">
                    {phase.tasks.map(task => (
                      <div key={task.id} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-[#ddd] flex-shrink-0" />
                        <input
                          value={task.name}
                          onChange={e => setTask(phase.id, task.id, e.target.value)}
                          placeholder="Nombre de la tarea"
                          className="flex-1 border border-[#e0ddd4] rounded-lg px-3 py-1.5 text-[13px] text-[#444] placeholder-[#bbb] outline-none focus:border-[#bbb] bg-white font-sans"
                        />
                        {phase.tasks.length > 1 && (
                          <button type="button" onClick={() => delTask(phase.id, task.id)}
                            className="text-[#ccc] hover:text-[#ef4444] transition-colors w-5 h-5 flex items-center justify-center flex-shrink-0">
                            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => addTask(phase.id)}
                    className="text-[12px] font-semibold text-[#aaa] hover:text-[#555] transition-colors flex items-center gap-1 mt-1">
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                    </svg>
                    Añadir tarea
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-[12px] font-medium text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] px-3.5 py-2.5 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0] flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e0ddd4] text-[#666] rounded-xl text-[13px] font-semibold hover:bg-[#f5f3eb] transition-colors">
            Cancelar
          </button>
          <button type="button" disabled={loading} onClick={submit}
            className="flex-1 px-4 py-2.5 bg-[#0d0d0d] text-white rounded-xl text-[13px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando…
                </span>
              : isEdit ? 'Guardar cambios' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#777] mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
