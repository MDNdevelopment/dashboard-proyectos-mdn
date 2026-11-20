import { daysPillTone, daysLabel } from '../../../utils/tacticas'

// Clases literales: Tailwind no genera CSS para clases armadas por interpolación.
const TONES = {
  red: 'bg-[#fce4e4] text-[#8e1b1b]',
  yellow: 'bg-[#fff1c2] text-[#6e4a00]',
  green: 'bg-[#e3f2e5] text-[#1e5e24]',
}

/** Pill de "días que quedan" de una táctica: rojo ≤ 3 o vencida, amarillo ≤ 10, verde el resto. */
export default function DaysPill({ days }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[13px] font-semibold whitespace-nowrap ${TONES[daysPillTone(days)]}`}
    >
      {daysLabel(days)}
    </span>
  )
}
