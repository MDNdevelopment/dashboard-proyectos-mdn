import {
  ocupacionEstudio,
  cargaRecursos,
  parseISODate,
  STUDIO_WINDOW_HOURS,
} from '../../utils/audiovisual'

// `DOW` (letra) se conserva para el tooltip de cada día; `DIA` es lo que se lee en pantalla.
const DOW = ['L', 'M', 'X', 'J', 'V', 'S']
const DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** «14:00» → 14, para rotular los bloques como «14–16». */
const hora = (hhmm) => Number(hhmm.slice(0, 2))

/**
 * Ocupación del estudio por día (una fila por día, un recuadro por bloque de 2 h con el
 * cliente que lo usa) y cantidad de pautas de cada recurso en la semana.
 */
export default function OcupacionBar({ pautas, range, usersById }) {
  const carga = cargaRecursos(pautas, range, usersById)
  const dias = range.days.map((iso) => ({ iso, ...ocupacionEstudio(pautas, iso) }))
  const columnas = dias[0]?.bloques ?? []
  return (
    <div
      className="grid gap-x-8 gap-y-4 rounded-xl border border-[#ece9df] bg-white px-4 py-3.5 text-[12px] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]"
      data-tour="ocupacion"
    >
      <div aria-label="Ocupación del estudio">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
          <span className="font-mono uppercase tracking-wide text-[#999] text-[10.5px]">
            Ocupación del estudio
          </span>
          <span className="flex items-center gap-3 text-[11px] text-[#777]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#3b6fd4]" aria-hidden="true" /> Ocupado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-sm bg-[#f2f0e8] border border-[#e0ddd4]"
                aria-hidden="true"
              />{' '}
              Libre
            </span>
          </span>
        </div>
        <p className="text-[11.5px] text-[#888] mb-2.5">
          Cada recuadro es un bloque de {STUDIO_WINDOW_HOURS} horas del estudio; lo que ves es el
          cliente de la pauta que lo usa.
        </p>
        <div
          className="grid gap-1 items-center"
          style={{
            gridTemplateColumns: `44px repeat(${columnas.length}, minmax(0, 1fr)) 40px`,
          }}
        >
          <span aria-hidden="true" />
          {columnas.map((b) => (
            <span
              key={b.start}
              className="text-center font-mono text-[10.5px] text-[#999]"
              title={`Bloque de ${hora(b.start)} a ${hora(b.end)} h`}
            >
              {hora(b.start)}–{hora(b.end)} h
            </span>
          ))}
          <span aria-hidden="true" />
          {dias.map(({ iso, bloques, ocupados }, i) => (
            <div key={iso} className="contents">
              <span
                className="text-[12px] font-semibold text-[#333] leading-tight"
                title={`${DOW[i]} ${parseISODate(iso).getDate()}: ${ocupados} de ${bloques.length} bloques`}
              >
                {DIA[i]}{' '}
                <span className="font-mono font-normal text-[#999]">
                  {parseISODate(iso).getDate()}
                </span>
              </span>
              {bloques.map((b) => (
                <span
                  key={b.start}
                  className={`h-7 rounded-md px-1.5 flex items-center justify-center text-[11px] truncate ${
                    b.pauta
                      ? 'bg-[#3b6fd4] text-white font-semibold'
                      : 'bg-[#f2f0e8] border border-[#e8e4d8] text-[#bbb]'
                  }`}
                  title={b.pauta ? `${b.start} ${b.pauta.client_name ?? ''}` : `${b.start} libre`}
                >
                  {b.pauta ? (b.pauta.client_name ?? 'Pauta') : ''}
                </span>
              ))}
              <span className="text-right font-mono text-[11px] text-[#888]">
                {ocupados}/{bloques.length}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div aria-label="Carga de recursos">
        <span className="block font-mono uppercase tracking-wide text-[#999] text-[10.5px] mb-2">
          Pautas por recurso
        </span>
        {carga.length === 0 ? (
          <span className="text-[#bbb]">sin pautas asignadas</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {carga.map((r) => (
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
