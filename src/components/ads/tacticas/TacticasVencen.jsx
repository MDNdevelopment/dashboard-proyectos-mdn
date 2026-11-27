import DaysPill from './DaysPill'
import { daysLeft, daysPillTone } from '../../../utils/tacticas'

/**
 * Tarjeta "Vencen pronto" del Dashboard de Tácticas, debajo de las tortas: las vigentes que vencen
 * en ≤ 10 días, en una grilla de mini-tarjetas (logo, marca, táctica y días). Clic en una abre su
 * detalle; los botones llevan a Base filtrada por "Urgentes" o "Por vencer". Sigue el mismo
 * formato que la tarjeta "Por hacer".
 *
 * @param {object}   props
 * @param {Array}    props.campaigns  — vigentes que vencen pronto (`vencenPronto`), ya ordenadas
 * @param {string}   props.today
 * @param {Map}      props.clientsById
 * @param {Function} props.onSelect   — (campaign) => void, abre el detalle
 * @param {Function} props.onGoToBase — (estado) => void
 */
export default function TacticasVencen({ campaigns, today, clientsById, onSelect, onGoToBase }) {
  const urgentes = campaigns.filter((c) => daysPillTone(daysLeft(c, today)) === 'red').length
  const porVencer = campaigns.length - urgentes

  return (
    <section
      aria-labelledby="tacticas-vencen-titulo"
      className="bg-white border border-[#e0ddd4] rounded-2xl p-5 mb-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${urgentes > 0 ? 'bg-[#e05252]' : 'bg-[#FFB800]'}`}
            />
            Vencen pronto
          </p>
          <h2 id="tacticas-vencen-titulo" className="text-[18px] font-bold text-[#111]">
            {campaigns.length}{' '}
            {campaigns.length === 1
              ? 'táctica vence en 10 días o menos'
              : 'tácticas vencen en 10 días o menos'}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {urgentes > 0 && (
            <button
              type="button"
              onClick={() => onGoToBase('urgentes')}
              className="text-[14px] font-bold px-3.5 py-2 rounded-xl bg-[#e05252] text-white hover:bg-[#c94444] transition-colors"
            >
              Ver urgentes ({urgentes})
            </button>
          )}
          {porVencer > 0 && (
            <button
              type="button"
              onClick={() => onGoToBase('por_vencer')}
              className="text-[14px] font-bold px-3.5 py-2 rounded-xl bg-[#111] text-white hover:bg-[#222] transition-colors"
            >
              Ver próximas a vencer ({porVencer})
            </button>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {campaigns.map((c) => {
          const logo = clientsById?.get(c.client_id)?.logo_url
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="w-full h-full flex items-center gap-3 rounded-xl border border-[#e0ddd4] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#FFB800]"
              >
                {logo ? (
                  <img
                    src={logo}
                    alt=""
                    className="w-10 h-10 flex-none rounded-full object-cover border border-[#e0ddd4]"
                  />
                ) : (
                  <span className="w-10 h-10 flex-none rounded-full bg-[#f0ede3] border border-[#e0ddd4] flex items-center justify-center text-[14px] font-bold text-[#999] uppercase">
                    {c.client?.[0]}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-[#111] truncate">
                    {c.client}
                  </span>
                  <span className="block text-[13px] text-[#888] truncate" title={c.name}>
                    {c.name}
                  </span>
                </span>
                <DaysPill days={daysLeft(c, today)} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
