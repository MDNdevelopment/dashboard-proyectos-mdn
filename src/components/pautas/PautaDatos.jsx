import {
  FORMAT_KEYS,
  FORMAT_LABELS,
  FORMAT_ICONS,
  formatDayShort,
  formatTime12,
  lugarLabel,
  resourceNames,
  requesterName,
  grillaStatus,
  GRILLA_STATUS_LABELS,
  reagendamientosOf,
  formatReagendamiento,
} from '../../utils/audiovisual'

/** Datos de la pauta en una grilla limpia: cuándo, dónde, qué, quién. */
export default function PautaDatos({ pauta, usersById }) {
  const formats = FORMAT_KEYS.filter((c) => (pauta.formats ?? []).includes(c))
  const recursos = resourceNames(pauta, usersById)
  const asistentes = (pauta.attendee_ids ?? [])
    .map((id) => usersById?.get(id))
    .filter(Boolean)
    .map((u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim())
  const grilla = grillaStatus(pauta)
  const historial = reagendamientosOf(pauta)
  const fecha = pauta.pauta_date
    ? `${formatDayShort(pauta.pauta_date)}${pauta.salida ? ` · ${formatTime12(pauta.salida)}` : ''}${
        pauta.llegada ? ` – ${formatTime12(pauta.llegada)}` : ''
      }`
    : pauta.status === 'solicitada'
      ? 'Sin fecha deseada'
      : 'Por agendar'

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
        <Item label="Cuándo" value={fecha} />
        <Item label="Dónde" value={lugarLabel(pauta)} />
        <Item
          label="Formatos"
          value={
            formats.length
              ? formats.map((c) => `${FORMAT_ICONS[c]} ${FORMAT_LABELS[c]}`).join(' · ')
              : '—'
          }
        />
        <Item
          label="Grilla"
          value={
            pauta.link ? (
              <a
                href={pauta.link}
                target="_blank"
                rel="noreferrer"
                className="text-[#2563eb] hover:underline"
              >
                Abrir grilla
              </a>
            ) : (
              GRILLA_STATUS_LABELS[grilla]
            )
          }
        />
        <Item label="Recursos" value={recursos.length ? recursos.join(', ') : 'Sin asignar'} />
        <Item label="Asisten" value={asistentes.length ? asistentes.join(', ') : '—'} />
        <Item label="Solicitó" value={requesterName(pauta, usersById) ?? '—'} />
        <Item label="Extra" value={pauta.extra ? 'Sí, fuera del plan' : 'No'} />
      </dl>

      {(pauta.tema || pauta.requirements || pauta.piezas_desc) && (
        <div className="rounded-xl bg-[#faf9f5] border border-[#ece9df] px-4 py-3 space-y-1.5 text-[13px] text-[#333]">
          {pauta.tema && (
            <p>
              <span className="font-semibold">Tema:</span> {pauta.tema}
            </p>
          )}
          {pauta.requirements && (
            <p>
              <span className="font-semibold">Requerimientos:</span> {pauta.requirements}
            </p>
          )}
          {pauta.piezas_desc && (
            <p>
              <span className="font-semibold">Piezas esperadas:</span> {pauta.piezas_desc}
            </p>
          )}
        </div>
      )}

      {historial.length > 0 && (
        <ul
          className="text-[12px] text-[#9a7400] space-y-0.5"
          aria-label="Historial de reagendados"
        >
          {historial.map((e, i) => (
            <li key={i}>🔁 {formatReagendamiento(e, usersById)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-[10.5px] font-mono uppercase tracking-wide text-[#999]">{label}</dt>
      <dd className="text-[13px] text-[#111] leading-snug mt-0.5">{value}</dd>
    </div>
  )
}
