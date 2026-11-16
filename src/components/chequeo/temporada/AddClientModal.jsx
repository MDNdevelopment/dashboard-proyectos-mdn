import { useState, useEffect } from 'react'
import UserPickerSingle from '../../tareas/UserPickerSingle'
import { allowedAssignees } from '../../../utils/temporada'

const normalizeName = (name) => (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Alta rápida de un cliente desde el Chequeo de temporada: nombre, línea y SM (opcional).
 * Crea un cliente real de MAPPI (`metric_clients`); el resto de sus datos se completa luego en
 * Empresa → Clientes. `onCreate({ name, lineId, socialManagerId })` devuelve `{ error }`.
 */
export default function AddClientModal({
  lines,
  users,
  existingNames,
  defaultLineId,
  onCreate,
  onClose,
}) {
  const [name, setName] = useState('')
  const [lineId, setLineId] = useState(defaultLineId ?? lines[0]?.id ?? '')
  const [smId, setSmId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  async function submit(e) {
    e.preventDefault()
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean) {
      setError('Escribe el nombre del cliente.')
      return
    }
    if (!lineId) {
      setError('Elige la línea del cliente.')
      return
    }
    if (existingNames.some((n) => normalizeName(n) === normalizeName(clean))) {
      setError('Ya existe un cliente con ese nombre.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await onCreate({ name: clean, lineId, socialManagerId: smId })
    setSaving(false)
    if (err) setError(err.message || 'No se pudo crear el cliente.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Agregar cliente"
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-[18px] font-bold text-[#111]">Agregar cliente</h2>
        <p className="mt-0.5 mb-4 text-[13.5px] text-[#888]">
          Se crea como cliente de MAPPI. Los demás datos los completas luego en Empresa → Clientes.
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]">
            Nombre
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-base w-full"
            placeholder="Nombre del cliente"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]">
            Línea
          </span>
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className="input-base w-full"
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-3">
          <span className="mb-1 block text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#888]">
            SM (opcional)
          </span>
          <UserPickerSingle
            users={allowedAssignees('sm', users, smId)}
            selectedId={smId}
            onChange={setSmId}
            placeholder="Sin asignar"
          />
        </div>

        {error && (
          <p role="alert" className="mb-3 text-[14px] text-[#c0392b]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[#e0ddd4] bg-white px-3 py-1.5 text-[14px] font-semibold text-[#555] hover:bg-[#f5f3eb] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#FFB800] px-3 py-1.5 text-[14px] font-semibold text-[#111] hover:brightness-95 disabled:opacity-60"
          >
            {saving ? 'Creando…' : 'Agregar cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}
