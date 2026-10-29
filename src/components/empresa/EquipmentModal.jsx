import { useState, useEffect } from 'react'
import { createEquipment, updateEquipment, fetchEquipmentHistory } from '../../lib/equipment'
import {
  STATUS_META,
  validateEquipment,
  modelSuggestions,
  icloudSuggestions,
} from '../../utils/equipment'

const LABEL = 'block text-[11.5px] font-mono uppercase tracking-wide text-[#999] mb-1'

function formatDay(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Crear/editar un equipo (`equipment` null = crear). El historial de responsables se
 * muestra al editar y lo escribe un trigger en la base: aquí es solo lectura.
 */
export default function EquipmentModal({
  companyId,
  userId,
  employees = [],
  lines = [],
  allEquipment = [],
  equipment,
  onClose,
  onSaved,
}) {
  const isEdit = equipment != null
  const [form, setForm] = useState({
    model: equipment?.model ?? '',
    serial: equipment?.serial ?? '',
    icloud_email: equipment?.icloud_email ?? '',
    line_id: equipment?.line_id ?? '',
    responsible_user_id: equipment?.responsible_user_id ?? '',
    status: equipment?.status ?? 'en_uso',
    notes: equipment?.notes ?? '',
  })
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    fetchEquipmentHistory(equipment.id)
      .then((rows) => {
        if (!cancelled) setHistory(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isEdit, equipment?.id])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const personName = (id) => {
    const u = employees.find((e) => e.user_id === id)
    return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : 'Ex-empleado'
  }
  const lineName = (id) => lines.find((l) => l.id === id)?.name

  async function handleSave() {
    const problem = validateEquipment(form)
    if (problem) return setError(problem)

    const fields = {
      model: form.model.trim(),
      serial: form.serial.trim() || null,
      icloud_email: form.icloud_email.trim() || null,
      line_id: form.line_id || null,
      responsible_user_id: form.responsible_user_id || null,
      status: form.status,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    setError(null)
    try {
      const saved = isEdit
        ? await updateEquipment(equipment.id, fields)
        : await createEquipment(companyId, fields, userId)
      onSaved(saved)
      onClose()
    } catch (err) {
      // 23505 = serial repetido (índice único por empresa)
      setError(err.code === '23505' ? 'Ya hay un equipo registrado con ese serial.' : err.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-5 border-b border-[#eeebe0]">
          <h2 className="text-[18px] font-semibold text-[#111]">
            {isEdit ? 'Editar iPhone' : 'Nuevo iPhone'}
          </h2>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="eq-model" className={LABEL}>
                Modelo
              </label>
              <input
                id="eq-model"
                className="input-base w-full"
                value={form.model}
                onChange={set('model')}
                list="eq-model-options"
                placeholder="Ej. iPhone 15 Pro Max"
                autoFocus
              />
              <datalist id="eq-model-options">
                {modelSuggestions(allEquipment).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="eq-serial" className={LABEL}>
                Serial (opcional)
              </label>
              <input
                id="eq-serial"
                className="input-base w-full font-mono"
                value={form.serial}
                onChange={set('serial')}
              />
            </div>
          </div>

          <div>
            <label htmlFor="eq-icloud" className={LABEL}>
              Correo de iCloud
            </label>
            <input
              id="eq-icloud"
              type="email"
              className="input-base w-full"
              list="eq-icloud-options"
              value={form.icloud_email}
              onChange={set('icloud_email')}
              placeholder="correo@gmail.com"
            />
            <datalist id="eq-icloud-options">
              {icloudSuggestions(allEquipment).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="eq-responsible" className={LABEL}>
                Responsable
              </label>
              <select
                id="eq-responsible"
                className="input-base w-full"
                value={form.responsible_user_id}
                onChange={set('responsible_user_id')}
              >
                <option value="">Sin responsable</option>
                {employees.map((e) => (
                  <option key={e.user_id} value={e.user_id}>
                    {[e.first_name, e.last_name].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="eq-line" className={LABEL}>
                Línea / team
              </label>
              <select
                id="eq-line"
                className="input-base w-full"
                value={form.line_id}
                onChange={set('line_id')}
              >
                <option value="">Sin línea</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="eq-status" className={LABEL}>
              Estado
            </label>
            <select
              id="eq-status"
              className="input-base w-full"
              value={form.status}
              onChange={set('status')}
            >
              {Object.entries(STATUS_META).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="eq-notes" className={LABEL}>
              Notas
            </label>
            <textarea
              id="eq-notes"
              rows={3}
              className="input-base w-full"
              value={form.notes}
              onChange={set('notes')}
              placeholder="Número de línea, daños, accesorios…"
            />
          </div>

          {isEdit && (
            <div className="p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df]">
              <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
                Historial de responsables
              </p>
              {history.length === 0 ? (
                <p className="text-[14px] text-[#bbb]">Sin asignaciones registradas.</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((h) => (
                    <li key={h.id} className="text-[13.5px] text-[#444]">
                      <span className="font-semibold">
                        {h.user_id ? personName(h.user_id) : 'Sin responsable'}
                      </span>
                      {h.line_id && lineName(h.line_id) && (
                        <span className="text-[#888]"> · {lineName(h.line_id)}</span>
                      )}
                      <span className="block font-mono text-[12px] text-[#999]">
                        {formatDay(h.started_at)} –{' '}
                        {h.ended_at ? formatDay(h.ended_at) : 'actualidad'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-[#eeebe0]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#e0ddd4] text-[#666] rounded-xl text-[15px] font-semibold hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-[#FFB800] text-[#111] rounded-xl text-[15px] font-bold hover:bg-[#e6a600] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
