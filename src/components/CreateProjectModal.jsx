import { useState, useEffect, useRef } from 'react'

const DEPARTMENTS = [
  { value: 'redes', label: 'Redes' },
  { value: 'diseño', label: 'Diseño' },
  { value: 'audiovisual', label: 'Audiovisual' },
  { value: 'tecnologia', label: 'Tecnología' },
]

const uid = () => Math.random().toString(36).slice(2)
const newTask = () => ({ id: uid(), name: '', status: 'pendiente' })
const newPhase = () => ({ id: uid(), name: '', tasks: [newTask()] })

function CreateProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '',
    department: 'tecnologia',
    team: '',
    requirements: '',
    phases: [newPhase()],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const firstInputRef = useRef(null)

  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const addPhase = () => setForm(f => ({ ...f, phases: [...f.phases, newPhase()] }))

  const removePhase = (phaseId) =>
    setForm(f => ({ ...f, phases: f.phases.filter(p => p.id !== phaseId) }))

  const updatePhaseName = (phaseId, name) =>
    setForm(f => ({
      ...f,
      phases: f.phases.map(p => p.id === phaseId ? { ...p, name } : p),
    }))

  const addTask = (phaseId) =>
    setForm(f => ({
      ...f,
      phases: f.phases.map(p =>
        p.id === phaseId ? { ...p, tasks: [...p.tasks, newTask()] } : p
      ),
    }))

  const removeTask = (phaseId, taskId) =>
    setForm(f => ({
      ...f,
      phases: f.phases.map(p =>
        p.id === phaseId ? { ...p, tasks: p.tasks.filter(t => t.id !== taskId) } : p
      ),
    }))

  const updateTaskName = (phaseId, taskId, name) =>
    setForm(f => ({
      ...f,
      phases: f.phases.map(p =>
        p.id === phaseId
          ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, name } : t) }
          : p
      ),
    }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre del proyecto es obligatorio.'); return }
    setLoading(true)
    setError('')
    try {
      const cleanPhases = form.phases
        .filter(p => p.name.trim())
        .map(p => ({ ...p, tasks: p.tasks.filter(t => t.name.trim()) }))
      await onCreate({
        name: form.name.trim(),
        department: form.department,
        team: form.team.trim(),
        requirements: form.requirements.trim(),
        phases: cleanPhases,
      })
    } catch {
      setError('Error al crear el proyecto. Verifica la conexión con Firebase.')
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[95svh] sm:max-h-[92vh] flex flex-col shadow-2xl mx-0 sm:mx-4">
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Nuevo Proyecto</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Project name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nombre del proyecto <span className="text-red-400">*</span>
            </label>
            <input
              ref={firstInputRef}
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="Ej: Rediseño web corporativa"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
            />
          </div>

          {/* Department + Team */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Departamento <span className="text-red-400">*</span>
              </label>
              <select
                value={form.department}
                onChange={e => update('department', e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 bg-white appearance-none cursor-pointer"
              >
                {DEPARTMENTS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Equipo / Persona
              </label>
              <input
                type="text"
                value={form.team}
                onChange={e => update('team', e.target.value)}
                placeholder="Ej: Carlos Ruiz"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
              />
            </div>
          </div>

          {/* Requirements */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Requisitos <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={form.requirements}
              onChange={e => update('requirements', e.target.value)}
              placeholder="Describe los requisitos o contexto del proyecto..."
              rows={2}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all resize-none"
            />
          </div>

          {/* Phases */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Fases y tareas</label>
              <button
                type="button"
                onClick={addPhase}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-1 rounded-lg transition-colors"
              >
                + Añadir fase
              </button>
            </div>

            <div className="space-y-3">
              {form.phases.map((phase, idx) => (
                <div key={phase.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
                  {/* Phase name row */}
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={phase.name}
                      onChange={e => updatePhaseName(phase.id, e.target.value)}
                      placeholder={`Nombre de la fase ${idx + 1} (ej: Diseño, Desarrollo...)`}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-gray-400 bg-white"
                    />
                    {form.phases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePhase(phase.id)}
                        className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Tasks */}
                  <div className="space-y-2 mb-2">
                    {phase.tasks.map(task => (
                      <div key={task.id} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                        <input
                          type="text"
                          value={task.name}
                          onChange={e => updateTaskName(phase.id, task.id, e.target.value)}
                          placeholder="Nombre de la tarea"
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-300 bg-white"
                        />
                        {phase.tasks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTask(phase.id, task.id)}
                            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 rounded transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addTask(phase.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    + tarea
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </form>

        {/* Sticky footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form=""
            disabled={loading}
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creando...
              </span>
            ) : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateProjectModal
