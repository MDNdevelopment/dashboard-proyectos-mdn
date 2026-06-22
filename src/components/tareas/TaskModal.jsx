import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { ESTADOS } from './constants'
import UserPickerSingle from './UserPickerSingle'

const EMPTY = {
  team_id: '',
  cliente: '',
  tarea: '',
  origen: '',
  responsable_id: null,
  apoyo_id: null,
  fecha_solicitud: '',
  fecha_entrega: '',
  fecha_cierre: '',
  estatus: 'En proceso',
}

export default function TaskModal({ tarea = null, teams = [], users = [], defaultTeamId = null, onClose, onCreated, onUpdated }) {
  const { userProfile } = useAuth()
  const isEdit = tarea != null
  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        team_id: tarea.team_id ?? '',
        cliente: tarea.cliente ?? '',
        tarea: tarea.tarea ?? '',
        origen: tarea.origen ?? '',
        responsable_id: tarea.responsable_id ?? null,
        apoyo_id: tarea.apoyo_id ?? null,
        fecha_solicitud: tarea.fecha_solicitud ?? '',
        fecha_entrega: tarea.fecha_entrega ?? '',
        fecha_cierre: tarea.fecha_cierre ?? '',
        estatus: tarea.estatus ?? 'En proceso',
      }
    }
    return { ...EMPTY, team_id: defaultTeamId ?? (teams[0]?.id ?? '') }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Close on Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.team_id) { setError('Selecciona un team'); return }
    if (!form.tarea?.trim()) { setError('La descripción de la tarea es obligatoria'); return }
    setSaving(true)
    setError(null)

    const payload = {
      company_id: userProfile?.company_id ?? '',
      team_id: form.team_id,
      cliente: form.cliente || null,
      tarea: form.tarea.trim(),
      origen: form.origen || null,
      responsable_id: form.responsable_id || null,
      apoyo_id: form.apoyo_id || null,
      capturado_por: isEdit ? tarea.capturado_por : (userProfile?.user_id ?? null),
      fecha_solicitud: form.fecha_solicitud || null,
      fecha_entrega: form.fecha_entrega || null,
      fecha_cierre: form.fecha_cierre || null,
      estatus: form.estatus,
    }

    if (isEdit) {
      const { data, error: err } = await supabase
        .from('tareas')
        .update(payload)
        .eq('id', tarea.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onUpdated(data)
    } else {
      const { data, error: err } = await supabase
        .from('tareas')
        .insert(payload)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onCreated(data)
    }
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la tarea de "${tarea.cliente || 'sin cliente'}"? No se puede deshacer.`)) return
    const { error: err } = await supabase.from('tareas').delete().eq('id', tarea.id)
    if (err) { setError(err.message); return }
    onUpdated({ ...tarea, _deleted: true })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[16px] font-bold text-[#111]">
            {isEdit ? 'Editar tarea' : 'Nueva tarea'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Team */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Team *
            </label>
            <select
              className="input-base"
              value={form.team_id}
              onChange={e => set('team_id', e.target.value)}
              required
            >
              <option value="">Seleccionar team...</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Cliente
            </label>
            <input
              className="input-base"
              value={form.cliente}
              onChange={e => set('cliente', e.target.value)}
              placeholder="Ej. Banco Exterior"
              list="clientes-list"
            />
          </div>

          {/* Tarea */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Descripción de la tarea *
            </label>
            <textarea
              className="input-base"
              rows={3}
              value={form.tarea}
              onChange={e => set('tarea', e.target.value)}
              placeholder="Describe qué hay que hacer..."
              required
            />
          </div>

          {/* Origen */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Origen / Fuente
            </label>
            <input
              className="input-base"
              value={form.origen}
              onChange={e => set('origen', e.target.value)}
              placeholder="Ej. WhatsApp, correo, reunión..."
            />
          </div>

          {/* Responsable */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Responsable
            </label>
            <UserPickerSingle
              users={users}
              selectedId={form.responsable_id}
              onChange={id => set('responsable_id', id)}
              placeholder="Asignar responsable..."
            />
          </div>

          {/* Apoyo de dirección */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Apoyo de dirección
              <span className="ml-1 font-normal normal-case text-[#bbb]">(opcional)</span>
            </label>
            <UserPickerSingle
              users={users}
              selectedId={form.apoyo_id}
              onChange={id => set('apoyo_id', id)}
              placeholder="¿Requiere apoyo de dirección?"
              clearable
            />
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Fecha solicitud
              </label>
              <input
                type="date"
                className="input-base"
                value={form.fecha_solicitud}
                onChange={e => set('fecha_solicitud', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Fecha entrega
              </label>
              <input
                type="date"
                className="input-base"
                value={form.fecha_entrega}
                onChange={e => set('fecha_entrega', e.target.value)}
              />
            </div>
          </div>

          {/* Estatus */}
          <div>
            <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Estatus
            </label>
            <select
              className="input-base"
              value={form.estatus}
              onChange={e => {
                const val = e.target.value
                set('estatus', val)
                if (val === 'Terminado' && !form.fecha_cierre) {
                  set('fecha_cierre', new Date().toISOString().slice(0, 10))
                }
                if (val !== 'Terminado') set('fecha_cierre', '')
              }}
            >
              {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Fecha cierre (auto-filled when Terminado) */}
          {form.estatus === 'Terminado' && (
            <div>
              <label className="block text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Fecha de cierre
              </label>
              <input
                type="date"
                className="input-base"
                value={form.fecha_cierre}
                onChange={e => set('fecha_cierre', e.target.value)}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                className="text-[13px] font-semibold text-red-500 hover:text-red-700 transition-colors"
              >
                Eliminar
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
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
                {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear tarea')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
