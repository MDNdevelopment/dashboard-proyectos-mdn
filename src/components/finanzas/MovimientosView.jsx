import { useMemo, useState, useEffect } from 'react'
import { fmtUSD } from '../../utils/metricsFinance'
import { fmtDate } from '../../utils/formatDate'
import { movimientosDelMes, totalesMovimientos } from '../../utils/finanzas'
import { loadInvoicesUpTo, loadDistributionsUpTo } from './finanzasApi'
import FilterBar, { FilterField } from '../common/FilterBar'
import {
  MOVIMIENTO_TIPOS,
  MOVIMIENTO_TIPO_KEYS,
  CAJA_LABELS,
  PARTIDA_KEYS_LEDGER,
  partidaMeta,
} from './constants'

/** Bolívares sin símbolo de dólar (el "Bs" se pone en el JSX), como en el resto del módulo. */
function fmtBs(n) {
  return Number(n ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const PAGE_SIZE = 30

const COLUMNS = [
  { key: 'fecha', label: 'Fecha', sortable: true, align: 'left' },
  { key: 'tipo', label: 'Tipo', sortable: true, align: 'left' },
  { key: 'partida', label: 'Partida', sortable: true, align: 'left' },
  { key: 'concepto', label: 'Concepto', sortable: true, align: 'left' },
  { key: 'contraparte', label: 'Contraparte', sortable: true, align: 'left' },
  { key: 'montoUsd', label: 'Monto (USD)', sortable: true, align: 'right' },
  { key: 'montoBs', label: 'Bs', sortable: true, align: 'right' },
  { key: 'afectaCaja', label: 'Caja', sortable: false, align: 'left' },
]

/**
 * Valor por el que se ordena cada columna. No siempre es `row[key]`: el tipo se
 * ordena por el flujo del dinero (cobro → asignación → pago → …) y no alfabético, y
 * la partida por el orden del reparto, no por su nombre.
 */
function sortValue(row, key) {
  switch (key) {
    case 'tipo':
      return MOVIMIENTO_TIPOS[row.tipo]?.orden ?? 99
    case 'partida':
      return row.partida ? PARTIDA_KEYS_LEDGER.indexOf(row.partida) : 99
    case 'montoUsd':
      return Number(row.montoUsd ?? 0)
    case 'montoBs':
      return Number(row.montoBs ?? 0)
    case 'concepto':
    case 'contraparte':
      return String(row[key] ?? '').toLowerCase()
    default:
      return row[key] ?? ''
  }
}

function SortIcon({ active, asc }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      className={`inline-block ml-1 ${active ? 'opacity-100' : 'opacity-30'}`}
      fill="currentColor"
      aria-hidden="true"
    >
      {active && !asc ? <path d="M4 7L1 2h6z" /> : <path d="M4 1l3 5H1z" />}
    </svg>
  )
}

/**
 * Movimientos: el diario consolidado del módulo Finanzas para el mes activo —
 * cobros, asignaciones y pagos de partida, traspasos, compras/ventas de divisas y
 * ajustes de la Caja Bs, en una sola tabla con orden y filtros.
 *
 * Es SOLO LECTURA a propósito: borrar o editar se sigue haciendo en la tab de
 * origen (Facturación, Distribución, Divisas), que es la única que conoce las reglas
 * de borrado por fuente y su cascada.
 *
 * Carga `invoices`/`distributions` ACUMULADOS aparte de los de `shared` (que son
 * solo del mes activo) porque acá la pertenencia al mes la decide la FECHA del
 * movimiento, no su `month_id` — ver `movimientosDelMes()`.
 */
export default function MovimientosView({
  companyId,
  year,
  month,
  finMonth,
  fxOperations,
  bsLedger,
  loading,
}) {
  const [invoicesUpTo, setInvoicesUpTo] = useState([])
  const [distributionsUpTo, setDistributionsUpTo] = useState([])
  const [cargando, setCargando] = useState(true)

  const [sortKey, setSortKey] = useState('fecha')
  const [sortAsc, setSortAsc] = useState(false)
  const [q, setQ] = useState('')
  const [fTipo, setFTipo] = useState('all')
  const [fPartida, setFPartida] = useState('all')
  const [fMoneda, setFMoneda] = useState('all')
  const [fFlujo, setFFlujo] = useState('all') // all | real | interno
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!companyId) return
      setCargando(true)
      const [inv, dist] = await Promise.all([
        loadInvoicesUpTo(companyId, year, month),
        loadDistributionsUpTo(companyId, year, month),
      ])
      if (cancelled) return
      setInvoicesUpTo(inv.data ?? [])
      setDistributionsUpTo(dist.data ?? [])
      setCargando(false)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [companyId, year, month])

  const rows = useMemo(
    () =>
      movimientosDelMes({
        invoices: invoicesUpTo,
        distributions: distributionsUpTo,
        fxOperations,
        bsLedger,
        year,
        month,
      }),
    [invoicesUpTo, distributionsUpTo, fxOperations, bsLedger, year, month],
  )

  // Las cards son del MES, no de la selección: si cambiaran al filtrar, el usuario
  // leería "el mes ingresó $300" después de filtrar un cliente. Lo que responde a
  // los filtros es el contador de movimientos.
  const totales = useMemo(() => totalesMovimientos(rows), [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (fTipo !== 'all' && r.tipo !== fTipo) return false
      if (fPartida === 'none' ? r.partida != null : fPartida !== 'all' && r.partida !== fPartida)
        return false
      if (fMoneda !== 'all' && r.moneda !== fMoneda) return false
      if (fFlujo === 'real' && r.naturaleza === 'interno') return false
      if (fFlujo === 'interno' && r.naturaleza !== 'interno') return false
      if (needle) {
        // La nota también entra: es justo lo que uno busca ("factura 1042").
        const heno = `${r.concepto ?? ''} ${r.contraparte ?? ''} ${r.nota ?? ''}`.toLowerCase()
        if (!heno.includes(needle)) return false
      }
      return true
    })
  }, [rows, q, fTipo, fPartida, fMoneda, fFlujo])

  const sorted = useMemo(() => {
    const copia = [...filtered]
    copia.sort((a, b) => {
      const x = sortValue(a, sortKey)
      const y = sortValue(b, sortKey)
      let cmp = x < y ? -1 : x > y ? 1 : 0
      // Desempate estable del mismo día: createdAt es el único timestamp real.
      if (cmp === 0) cmp = String(a.createdAt ?? '') < String(b.createdAt ?? '') ? -1 : 1
      return sortAsc ? cmp : -cmp
    })
    return copia
  }, [filtered, sortKey, sortAsc])

  const hasFilters =
    q.trim() !== '' ||
    fTipo !== 'all' ||
    fPartida !== 'all' ||
    fMoneda !== 'all' ||
    fFlujo !== 'all'

  // Sin esto, filtrar estando en la página 3 deja la tabla vacía.
  useEffect(() => setPage(0), [q, fTipo, fPartida, fMoneda, fFlujo, year, month])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages - 1)
  const pagina = sorted.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE)

  function handleSort(key) {
    if (key === sortKey) setSortAsc((v) => !v)
    else {
      setSortKey(key)
      // La fecha se lee mejor de más reciente a más antigua; el resto, ascendente.
      setSortAsc(key !== 'fecha')
    }
  }

  function clearFilters() {
    setQ('')
    setFTipo('all')
    setFPartida('all')
    setFMoneda('all')
    setFFlujo('all')
  }

  if (loading || cargando)
    return <div className="text-[14px] text-[#999] py-10 text-center">Cargando…</div>

  if (!finMonth) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center text-[13.5px] text-[#999]">
        Este mes todavía no tiene movimiento. Entra a Facturación y se prepara solo.
      </div>
    )
  }

  if (finMonth.summaryOnly) {
    return (
      <div className="bg-white border border-[#e0ddd4] rounded-xl p-10 text-center text-[13.5px] text-[#999]">
        Este mes se cargó como resumen (solo totales) — no tiene movimientos fila por fila que
        mostrar aquí.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 max-w-2xl">
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
          <p className="text-[11px] uppercase text-[#999]">Entradas del mes</p>
          <p className="font-bold text-[#1F9D57] text-[16px]">{fmtUSD(totales.entradas)}</p>
          <p className="text-[11px] text-[#999]">cobros, por fecha de pago</p>
        </div>
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
          <p className="text-[11px] uppercase text-[#999]">Salidas del mes</p>
          <p className="font-bold text-[#D6453F] text-[16px]">{fmtUSD(totales.salidas)}</p>
          <p className="text-[11px] text-[#999]">pagos, por fecha de pago</p>
        </div>
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-3">
          <p className="text-[11px] uppercase text-[#999]">Neto del mes</p>
          <p
            className="font-bold text-[16px]"
            style={{ color: totales.neto < 0 ? '#D6453F' : '#111' }}
          >
            {fmtUSD(totales.neto)}
          </p>
          <p className="text-[11px] text-[#999]">excluye internos, divisas y ajustes</p>
        </div>
      </div>

      <FilterBar cols={5} onClear={hasFilters ? clearFilters : undefined}>
        <FilterField label="Buscar">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Concepto, contraparte…"
            className="input-base text-[14px] py-1.5 w-full"
          />
        </FilterField>
        <FilterField label="Tipo">
          <select
            value={fTipo}
            onChange={(e) => setFTipo(e.target.value)}
            className="input-base text-[14px] py-1.5 w-full"
          >
            <option value="all">Todos</option>
            {MOVIMIENTO_TIPO_KEYS.map((k) => (
              <option key={k} value={k}>
                {MOVIMIENTO_TIPOS[k].label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Partida">
          <select
            value={fPartida}
            onChange={(e) => setFPartida(e.target.value)}
            className="input-base text-[14px] py-1.5 w-full"
          >
            <option value="all">Todas</option>
            {PARTIDA_KEYS_LEDGER.map((p) => (
              <option key={p} value={p}>
                {partidaMeta(p)?.name ?? p}
              </option>
            ))}
            <option value="none">Sin partida</option>
          </select>
        </FilterField>
        <FilterField label="Moneda">
          <select
            value={fMoneda}
            onChange={(e) => setFMoneda(e.target.value)}
            className="input-base text-[14px] py-1.5 w-full"
          >
            <option value="all">Todas</option>
            <option value="USD">USD</option>
            <option value="Bs">Bs</option>
          </select>
        </FilterField>
        {/* Separa el dinero real de los movimientos internos (asignaciones y
            traspasos), que están en la lista pero no suman en las cards. */}
        <FilterField label="Flujo">
          <select
            value={fFlujo}
            onChange={(e) => setFFlujo(e.target.value)}
            className="input-base text-[14px] py-1.5 w-full"
          >
            <option value="all">Todos</option>
            <option value="real">Dinero real</option>
            <option value="interno">Internos</option>
          </select>
        </FilterField>
      </FilterBar>

      <p className="text-[13px] font-mono text-[#888]">
        {sorted.length} movimiento{sorted.length === 1 ? '' : 's'}
        {sorted.length !== rows.length && ` de ${rows.length}`}
      </p>

      {rows.length === 0 ? (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[13.5px] text-[#888]">
          Sin movimientos este mes.
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-[#e0ddd4] rounded-xl p-4 text-[13.5px] text-[#888]">
          Sin resultados para los filtros aplicados.
        </div>
      ) : (
        <div className="bg-white border border-[#e0ddd4] rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-[#f0ede3] text-[11px] uppercase tracking-wide text-[#999]">
                  {COLUMNS.map((col) => {
                    const active = sortKey === col.key
                    // Clases literales: Tailwind no generaría `text-${col.align}`.
                    return (
                      <th
                        key={col.key}
                        aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                        className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : 'text-left'} ${
                          col.sortable ? 'cursor-pointer select-none hover:text-[#666]' : ''
                        }`}
                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                      >
                        {col.label}
                        {col.sortable && <SortIcon active={active} asc={sortAsc} />}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pagina.map((r) => {
                  const meta = partidaMeta(r.partida)
                  return (
                    <tr key={r.id} className="border-b border-[#f5f3eb] last:border-0">
                      <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">
                        {fmtDate(r.fecha)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="whitespace-nowrap">{MOVIMIENTO_TIPOS[r.tipo].label}</span>
                        {r.interno && (
                          <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#f0ede3] text-[#888]">
                            Interno
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {meta ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                            <span className={meta.text}>{meta.name}</span>
                          </span>
                        ) : (
                          <span className="text-[#ccc]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.concepto}
                        {r.nota && <div className="text-[11.5px] text-[#999]">{r.nota}</div>}
                        {r.resultadoCambioUsd ? (
                          <div className="text-[11.5px] text-[#999]">
                            Resultado por cambio {r.resultadoCambioUsd < 0 ? '− ' : ''}
                            {fmtUSD(Math.abs(r.resultadoCambioUsd))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.contraparte ?? <span className="text-[#ccc]">—</span>}
                      </td>
                      <td
                        className="text-right px-4 py-2.5 font-mono whitespace-nowrap"
                        style={{ color: Number(r.montoUsd ?? 0) < 0 ? '#D6453F' : '#1F9D57' }}
                      >
                        {r.montoUsd == null ? (
                          <span className="text-[#ccc]">—</span>
                        ) : (
                          <>
                            {r.montoUsd < 0 ? '− ' : ''}
                            {fmtUSD(Math.abs(r.montoUsd))}
                          </>
                        )}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono whitespace-nowrap">
                        {r.montoBs == null ? (
                          <span className="text-[#ccc]">—</span>
                        ) : (
                          <>
                            {r.montoBs < 0 ? '− ' : ''}
                            {fmtBs(Math.abs(r.montoBs))} Bs
                            {r.tasa ? (
                              <div className="text-[11px] text-[#999]">· {fmtBs(r.tasa)}</div>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[#999] whitespace-nowrap">
                        {CAJA_LABELS[r.afectaCaja] ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-3 px-4 py-2.5 border-t border-[#f0ede3]">
              <span className="text-[12px] text-[#999]">
                Página {pageClamped + 1} de {totalPages} · {sorted.length} movimientos
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={pageClamped === 0}
                  className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#666] border border-[#e0ddd4] hover:bg-[#f5f3eb] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹ Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={pageClamped >= totalPages - 1}
                  className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#666] border border-[#e0ddd4] hover:bg-[#f5f3eb] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[12px] text-[#aaa]">
        Los cobros se listan por su fecha de pago, así que un abono tardío de una factura de otro
        mes aparece en el mes en que entró el dinero. Las compras y ventas de divisas no suman como
        entrada ni salida: cambian de bolsillo, no de patrimonio.
      </p>
    </div>
  )
}
