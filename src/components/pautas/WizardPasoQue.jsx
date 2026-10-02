import { useState } from 'react'
import { FORMAT_KEYS, FORMAT_LABELS, FORMAT_ICONS } from '../../utils/audiovisual'

/** Paso 1 del asistente: cliente, formatos y de qué trata. */
export default function WizardPasoQue({ values, set, clients }) {
  const [query, setQuery] = useState('')
  const sorted = [...(clients ?? [])]
    .filter((c) => !c.deleted_at || c.id === values.client_id)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' }))
  const q = query.trim().toLowerCase()
  const visible = q ? sorted.filter((c) => (c.name ?? '').toLowerCase().includes(q)) : sorted
  const elegido = sorted.find((c) => c.id === values.client_id) ?? null

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
          ¿Para qué cliente?
        </h3>
        {elegido ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#111] bg-[#111] text-[#FFB800] px-4 py-3">
            <span className="text-[15px] font-bold truncate">{elegido.name}</span>
            {sorted.length > 1 && (
              <button
                type="button"
                onClick={() => set('client_id', null)}
                className="text-[12.5px] font-semibold text-white/80 hover:text-white"
              >
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <>
            {sorted.length > 6 && (
              <input
                className="input-base mb-2"
                aria-label="Buscar cliente"
                placeholder="Buscar cliente…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            )}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto"
              role="listbox"
              aria-label="Cliente"
            >
              {visible.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => set('client_id', c.id)}
                  className="min-h-[44px] text-left px-3 rounded-xl border border-[#e0ddd4] bg-white text-[14px] font-semibold text-[#222] hover:border-[#111]"
                >
                  {c.name}
                </button>
              ))}
              {visible.length === 0 && (
                <p className="text-[12.5px] text-[#999] px-1 py-2">Ningún cliente coincide.</p>
              )}
            </div>
          </>
        )}
      </section>

      <section>
        <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
          ¿Qué se graba?
        </h3>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Formatos">
          {FORMAT_KEYS.map((code) => {
            const on = values.formats.includes(code)
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set(
                    'formats',
                    on ? values.formats.filter((c) => c !== code) : [...values.formats, code],
                  )
                }
                className={`min-h-[64px] rounded-xl border text-[13px] font-semibold transition-colors ${
                  on
                    ? 'bg-[#111] border-[#111] text-[#FFB800]'
                    : 'bg-white border-[#e0ddd4] text-[#555] hover:border-[#111]'
                }`}
              >
                <span className="block text-[22px] leading-none mb-1">{FORMAT_ICONS[code]}</span>
                {FORMAT_LABELS[code]}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
          ¿De qué trata?
        </h3>
        <input
          className="input-base min-h-[44px]"
          aria-label="De qué trata"
          value={values.tema}
          onChange={(e) => set('tema', e.target.value)}
          placeholder="Tema o concepto, en una línea"
        />
      </section>
    </div>
  )
}
