import { useState } from 'react'
import AlertasStrip, { ALERTA_META } from './AlertasStrip'
import SemanaGrid from './SemanaGrid'
import OcupacionBar from './OcupacionBar'
import AvDrawer from './AvDrawer'
import ColaAprobacion from './ColaAprobacion'
import PautaCard from './PautaCard'
import {
  weekRange,
  pautasInWeek,
  groupByDay,
  alertas as calcAlertas,
  resumenMes,
  isoDateKey,
  parseISODate,
  formatDayShort,
} from '../../utils/audiovisual'

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

/**
 * Pantalla inicial para coordinación y jefas: qué pasa esta semana, qué necesita acción y
 * cómo va el mes. Las alertas abren un panel lateral con su cola.
 */
export default function AvSemanaView({
  pautas,
  piezasByPauta,
  usersById,
  recursoUsers,
  allEmployees,
  canApprove,
  today = new Date(),
  onFields,
  onPautaClick,
  onGoDatos,
  modo = 'semana',
  onModoChange,
  calendario = null,
  children,
}) {
  const hoy = isoDateKey(today)
  const [anchor, setAnchor] = useState(hoy)
  const [drawer, setDrawer] = useState(null)
  const range = weekRange(anchor)
  const semana = pautasInWeek(pautas, range)
  const byDay = groupByDay(semana)
  const alertas = calcAlertas(pautas, piezasByPauta, hoy)
  const d0 = parseISODate(range.start)
  const resumen = resumenMes(pautas, piezasByPauta, {
    year: d0.getFullYear(),
    month: d0.getMonth() + 1,
  })
  const shift = (n) => {
    const d = parseISODate(anchor)
    d.setDate(d.getDate() + n * 7)
    setAnchor(isoDateKey(d))
  }
  const titulo =
    range.start === weekRange(hoy).start
      ? 'Esta semana'
      : `Semana del ${parseISODate(range.start).getDate()}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Rango del calendario"
          className="flex rounded-lg bg-[#ece9de] p-0.5"
        >
          {[
            { key: 'semana', label: 'Semana' },
            { key: 'mes', label: 'Mes' },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={modo === o.key}
              onClick={() => modo !== o.key && onModoChange?.(o.key, anchor)}
              className={`px-3 py-1 rounded-md text-[12px] font-mono uppercase tracking-wide transition-colors ${
                modo === o.key
                  ? 'bg-[#FFB800] text-[#111] font-bold'
                  : 'text-[#666] hover:text-[#111]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {modo === 'semana' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Semana anterior"
              className="w-8 h-8 rounded-lg text-[#666] hover:bg-[#f5f3eb]"
            >
              ‹
            </button>
            <h2 className="text-[17px] font-bold text-[#111]">
              {titulo}{' '}
              <span className="font-normal text-[#888] text-[14px]">
                · {formatDayShort(range.start)} – {formatDayShort(range.end)}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Semana siguiente"
              className="w-8 h-8 rounded-lg text-[#666] hover:bg-[#f5f3eb]"
            >
              ›
            </button>
            {anchor !== hoy && (
              <button
                type="button"
                onClick={() => setAnchor(hoy)}
                className="ml-1 px-2.5 py-1 rounded-lg text-[12.5px] font-semibold text-[#444] hover:bg-[#f5f3eb]"
              >
                Hoy
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onGoDatos}
          className="ml-auto flex items-center gap-3 rounded-xl border border-[#e8e4d8] bg-white px-4 py-2 text-left hover:border-[#111] transition-colors"
          aria-label="Ver datos del mes"
        >
          <span className="text-[11px] font-mono uppercase tracking-wide text-[#999] capitalize">
            {MESES[d0.getMonth()]}
          </span>
          <Kpi
            value={resumen.pctEditado === null ? '—' : `${resumen.pctEditado}%`}
            label="editado"
            tone="text-[#1f8a43]"
          />
          <Kpi value={resumen.realizadas} label="realizadas" tone="text-[#3b6fd4]" />
          <Kpi value={alertas.porAprobar.length} label="por aprobar" tone="text-[#9a7400]" />
        </button>
      </div>

      <AlertasStrip alertas={alertas} onOpen={setDrawer} />

      {children}

      {modo === 'mes' ? (
        calendario
      ) : (
        <>
          <SemanaGrid
            days={range.days}
            byDay={byDay}
            piezasByPauta={piezasByPauta}
            usersById={usersById}
            today={hoy}
            onPautaClick={onPautaClick}
          />

          <OcupacionBar pautas={pautas} range={range} usersById={usersById} />
        </>
      )}

      {drawer && (
        <AvDrawer
          title={ALERTA_META[drawer].label(alertas[drawer].length)}
          subtitle={DRAWER_HINT[drawer]}
          onClose={() => setDrawer(null)}
        >
          {drawer === 'porAprobar' ? (
            <ColaAprobacion
              solicitudes={alertas.porAprobar}
              pautas={pautas}
              usersById={usersById}
              recursoUsers={recursoUsers}
              allEmployees={allEmployees}
              canApprove={canApprove}
              onFields={onFields}
              onPautaClick={(p) => {
                setDrawer(null)
                onPautaClick(p)
              }}
            />
          ) : (
            alertas[drawer].map((p) => (
              <PautaCard
                key={p.id}
                pauta={p}
                piezas={piezasByPauta?.get(p.id) ?? []}
                usersById={usersById}
                showDate
                onClick={(x) => {
                  setDrawer(null)
                  onPautaClick(x)
                }}
              />
            ))
          )}
        </AvDrawer>
      )}
    </div>
  )
}

const DRAWER_HINT = {
  porAprobar: 'Agenda cada una con fecha, lugar y recursos, o declínala.',
  sinCaptura: 'Pautas que ya pasaron y nadie registró cuántas piezas salieron.',
  grillaIncumple: 'La grilla debía estar 2 días antes de la pauta y no se ha cargado.',
  piezasAtrasadas: 'Realizadas hace más de una semana con piezas todavía por editar.',
}

function Kpi({ value, label, tone }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={`font-mono font-bold text-[18px] ${tone}`}>{value}</span>
      <span className="text-[11px] text-[#999]">{label}</span>
    </span>
  )
}
