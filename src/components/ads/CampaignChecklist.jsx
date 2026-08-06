import { checklistProgress } from '../tareas/taskChecklist'

/**
 * Checklist de "acciones" de una Táctica (campaigns.checklist, jsonb).
 * Componente controlado: recibe `value` (array de ítems { id, title, done }) y
 * notifica cambios con `onChange(nextArray)`. El % de cumplimiento se deriva con
 * `checklistProgress` (reutilizado de Tareas) y avanza al tildar los ítems.
 *
 * Solo para Tácticas — los Ads (paid_campaigns) no lo usan.
 *
 * @param {object}   props
 * @param {Array}    props.value      — ítems { id, title, done }
 * @param {Function} props.onChange   — (nextArray) => void
 * @param {boolean}  props.canManage  — permite tildar/destildar las acciones (avanza el %)
 * @param {boolean}  props.editable   — permite agregar/editar texto/eliminar acciones
 *                                      (en el detalle es false: solo se tildan; en el form es true)
 */
export default function CampaignChecklist({
  value = [],
  onChange,
  canManage = true,
  editable = true,
}) {
  const items = Array.isArray(value) ? value : []
  const { done, total } = checklistProgress(items)
  const percent = total ? Math.round((done / total) * 100) : 0

  function newId() {
    return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  }

  function addItem() {
    onChange([...items, { id: newId(), title: '', done: false }])
  }

  function patchItem(id, patch) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function removeItem(id) {
    onChange(items.filter((it) => it.id !== id))
  }

  const labelClass = 'block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888]'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={labelClass}>Acciones{total > 0 ? ` (${done}/${total})` : ''}</span>
        {total > 0 && (
          <span className="text-[12px] font-mono font-semibold text-[#555]">{percent}%</span>
        )}
      </div>

      {/* Barra de progreso */}
      {total > 0 && (
        <div className="h-1.5 bg-[#f0ede3] rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full rounded-full bg-[#FFB800] transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-[13px] text-[#bbb] mb-2">
          {editable ? 'Sin acciones. Agrega los pasos de esta táctica.' : 'Sin acciones.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 mb-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!it.done}
                disabled={!canManage}
                onChange={(e) => patchItem(it.id, { done: e.target.checked })}
                aria-label={`Completar ${it.title || 'acción'}`}
                className="h-4 w-4 rounded border-[#e0ddd4] accent-[#FFB800] flex-shrink-0"
              />
              {editable ? (
                <input
                  type="text"
                  value={it.title}
                  onChange={(e) => patchItem(it.id, { title: e.target.value })}
                  placeholder="Descripción de la acción"
                  className={`input-base flex-1 py-1 text-[14px] ${it.done ? 'line-through text-[#999]' : ''}`}
                />
              ) : (
                <span
                  className={`flex-1 text-[14px] ${it.done ? 'line-through text-[#999]' : 'text-[#333]'}`}
                >
                  {it.title || '—'}
                </span>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  title="Eliminar acción"
                  className="p-1 rounded-lg text-[#999] hover:text-red-600 hover:bg-red-50 transition-all flex-shrink-0"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <button
          type="button"
          onClick={addItem}
          className="text-[13.5px] font-semibold text-[#555] hover:text-[#111] transition-colors"
        >
          + Agregar acción
        </button>
      )}
    </div>
  )
}
