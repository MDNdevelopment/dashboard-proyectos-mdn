import { ocupacionEstudio, cargaRecursos, parseISODate } from '../../utils/audiovisual'

const DOW = ['L', 'M', 'X', 'J', 'V', 'S']

/** Ocupación del estudio por día (bloques de 2h) y carga de cada recurso en la semana. */
export default function OcupacionBar({ pautas, range, usersById }) {
  const carga = cargaRecursos(pautas, range, usersById)
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[#ece9df] bg-white px-4 py-2.5 text-[12px]">
      <div className="flex items-center gap-2" aria-label="Ocupación del estudio">
        <span className="font-mono uppercase tracking-wide text-[#999] text-[10.5px]">Estudio</span>
        {range.days.map((iso, i) => {
          const { bloques, ocupados } = ocupacionEstudio(pautas, iso)
          return (
            <span
              key={iso}
              className="flex items-center gap-[2px]"
              title={`${DOW[i]} ${parseISODate(iso).getDate()}: ${ocupados} de ${bloques.length} bloques`}
            >
              <span className="text-[10px] text-[#aaa] mr-0.5">{DOW[i]}</span>
              {bloques.map((b) => (
                <span
                  key={b.start}
                  className={`w-[7px] h-[12px] rounded-sm ${b.pauta ? 'bg-[#3b6fd4]' : 'bg-[#ece9df]'}`}
                  title={b.pauta ? `${b.start} ${b.pauta.client_name ?? ''}` : `${b.start} libre`}
                />
              ))}
            </span>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Carga de recursos">
        <span className="font-mono uppercase tracking-wide text-[#999] text-[10.5px]">
          Recursos
        </span>
        {carga.length === 0 ? (
          <span className="text-[#bbb]">sin pautas asignadas</span>
        ) : (
          carga.map((r) => (
            <span
              key={r.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                r.sobrecargado
                  ? 'border-[#f5c6c6] bg-[#fdecec] text-[#c0392b]'
                  : 'border-[#e8e4d8] bg-[#faf9f5] text-[#333]'
              }`}
              title={r.sobrecargado ? 'Tiene 3 o más pautas en un mismo día' : undefined}
            >
              {r.name}
              <span className="font-mono font-bold">{r.count}</span>
            </span>
          ))
        )}
      </div>
    </div>
  )
}
