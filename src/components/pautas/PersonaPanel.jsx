import AvDrawer from './AvDrawer'
import Avatar from '../Avatar'
import { pautasPorSemanaPersona } from '../../utils/audiovisual'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const shortDate = (iso) => {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

/**
 * Panel lateral de una persona: totales del mes (de `aggregateResourcePerformance`), pautas
 * por semana y accesos a la lista "Todas" ya filtrada. "Capturadas" es el término neutro
 * (grabar solo aplica a video).
 */
export default function PersonaPanel({
  persona,
  perf,
  pautas,
  piezasByPauta,
  usersById,
  year,
  month,
  onVerLista,
  onClose,
}) {
  const row = (perf ?? []).find((r) => r.id === persona.id) ?? {}
  const user = usersById?.get(persona.id) ?? {
    user_id: persona.id,
    first_name: persona.name,
    last_name: '',
    avatar_url: null,
  }
  const semanas = pautasPorSemanaPersona(pautas, piezasByPauta, persona.id, { year, month })
  const max = Math.max(1, ...semanas.map((s) => s.total))
  const stats = [
    { label: 'Videos capturados', value: row.grabaAv ?? 0, tone: 'text-[#3b6fd4]' },
    { label: 'Fotos capturadas', value: row.grabaFoto ?? 0, tone: 'text-[#3b6fd4]' },
    {
      label: 'Videos editados',
      value: (row.editaAv ?? 0) + (row.editaCnp ?? 0),
      tone: 'text-[#1f8a43]',
    },
    { label: 'Fotos editadas', value: row.editaFoto ?? 0, tone: 'text-[#1f8a43]' },
  ]
  const botones = [
    { label: 'Videos capturados', rol: 'captura', grupo: 'av' },
    { label: 'Fotos capturadas', rol: 'captura', grupo: 'foto' },
    { label: 'Videos editados', rol: 'edicion', grupo: 'av' },
    { label: 'Fotos editadas', rol: 'edicion', grupo: 'foto' },
  ]

  return (
    <AvDrawer title={persona.name} subtitle={`${MESES[month - 1]} ${year}`} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar user={user} size={40} />
        <div className="text-[12px] text-[#888]">Resumen de su trabajo en el mes.</div>
      </div>

      <section className="bg-white border border-[#e0ddd4] rounded-xl p-4">
        <h3 className="text-[13px] font-semibold text-[#222] mb-2">Totales del mes</h3>
        <dl className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[#ece9df] bg-[#fcfbf7] px-3 py-2"
            >
              <dt className="text-[10.5px] font-mono uppercase tracking-wide text-[#999]">
                {s.label}
              </dt>
              <dd className={`font-mono font-bold text-[20px] ${s.tone}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
        {row.editaCnp > 0 && (
          <p className="text-[11px] text-[#999] mt-2">
            Los videos editados incluyen {row.editaCnp} de CNP de audiovisual.
          </p>
        )}
      </section>

      <section className="bg-white border border-[#e0ddd4] rounded-xl p-4">
        <h3 className="text-[13px] font-semibold text-[#222] mb-0.5">Pautas por semana</h3>
        <p className="text-[11px] text-[#999] mb-2">
          Pautas confirmadas donde capturó o editó, según la fecha de la pauta.
        </p>
        <ul className="space-y-2">
          {semanas.map((s) => (
            <li key={s.start} aria-label={`Semana ${shortDate(s.start)} a ${shortDate(s.end)}`}>
              <div className="flex items-center gap-2">
                <div className="w-[92px] text-[12px] font-mono text-[#555]">
                  {shortDate(s.start)} – {shortDate(s.end)}
                </div>
                <div className="flex-1 h-[10px] bg-[#f0ede4] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#FFB800] rounded-full"
                    style={{ width: `${(s.total / max) * 100}%` }}
                  />
                </div>
                <div className="w-[28px] text-right font-mono font-bold text-[13px] text-[#111]">
                  {s.total}
                </div>
              </div>
              {s.total > 0 && (
                <div className="text-[11px] text-[#a29b8c] ml-[100px]">
                  {s.capturo} capturó · {s.edito} editó
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border border-[#e0ddd4] rounded-xl p-4">
        <h3 className="text-[13px] font-semibold text-[#222] mb-2">Ver en la lista</h3>
        <div className="grid grid-cols-2 gap-2">
          {botones.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => onVerLista?.({ id: persona.id, rol: b.rol, grupo: b.grupo })}
              className="px-3 py-2 rounded-lg border border-[#e0ddd4] bg-white text-[13px] font-semibold text-[#333] hover:border-[#111] hover:bg-[#faf9f5] transition-colors"
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>
    </AvDrawer>
  )
}
