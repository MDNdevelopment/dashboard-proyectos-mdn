import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  loadReport,
  loadPrevReport,
  loadClients,
  upsertReport,
  loadCompanyEmployees,
  loadFixedTaskMarks,
} from './metricsApi'
import SectionTotal from '../common/SectionTotal'
import ClientFichaModal from './ClientFichaModal'
import { initMetricReport } from '../../utils/initMetricReport'
import { syncReportClients } from '../../utils/syncReportClients'
import { clientInMonth } from '../../utils/clientInMonth'
import { employeeActiveInMonth } from '../../utils/employeeInMonth'
import { isReportFrozen } from '../../utils/reportPeriod'
import { calcTotal, sumScore, crecimientoCliente } from '../../utils/metricsScore'
import { buildFixedWeeks, computeProductividad } from '../../utils/fixedTasks'
import { computePlataformasProductividad } from '../../utils/chequeo'
import { computeReunionesMeta } from '../../utils/reunionesMeta'
import { loadChecks } from '../chequeo/chequeoApi'
import {
  MONTHS,
  INDICATORS,
  REUNIONES_MODULE_START,
  TAREAS_FIJAS_MODULE_START,
  AUDIOVISUAL_MODULE_START,
  CHEQUEO_PRODUCTIVIDAD_START,
  SOLICITUDES_MODULE_START,
} from './constants'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { Avatar } from '../tareas/UserPickerSingle'
import { loadAds, spentByClientInPeriod } from '../ads/campaignSpendApi'
import { fmtUSD } from '../../utils/metricsFinance'
import { countMeetingsHeldForLine, loadHeldClientIdsForLine } from '../reuniones/meetingsApi'
import { countPiezasForLine, countPautasRealizadasByClient } from '../pautas/avPautasApi'
import { countCnpSolicitudesForLine } from '../cnp/cnpApi'
import { countTareasSolicitudesForLine } from '../tareas/tareasMetricsApi'
import ReunionesClientesModal from './ReunionesClientesModal'

/** Adapta un objeto cliente (logo_url) al shape que espera <Avatar> (avatar_url). */
function clientAvatar(c) {
  return {
    first_name: c?.name ?? '',
    last_name: '',
    avatar_url: c?.logo_url ?? null,
    user_id: c?.id,
  }
}

export default function OperacionesView({ line, companyId, year, month, closed = false }) {
  const { can = () => true } = useAuth()
  // La Meta de reuniones se recalcula sola (1 por marca de la línea, menos las "No
  // aplica") solo en el mes en curso y no cerrado. Meses pasados conservan la meta que
  // ya tenían guardada, igual criterio que "Realizadas" con REUNIONES_MODULE_START.
  // Se lee la fecha en cada render (no a nivel de módulo) para no congelar "hoy" en el
  // momento en que se importó el archivo.
  const today = new Date()
  const metaAutoSync = !closed && year === today.getFullYear() && month === today.getMonth() + 1
  const [report, setReport] = useState(null)
  const [prevReport, setPrevReport] = useState(null)
  const [clients, setClients] = useState([])
  // Mapa company-wide (todas las líneas, incl. archivados) para resolver nombre/logo de
  // cuentas que se movieron a otra línea: sus reportes pasados guardan el clienteId pero
  // ya no están en la cartera de esta línea. Sin esto se mostraría "[Cliente eliminado]".
  const [companyClientsById, setCompanyClientsById] = useState({})
  const [companyEmployees, setCompanyEmployees] = useState([])
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [cliModal, setCliModal] = useState(null) // null=cerrado, objeto=cliente abierto
  const [heldClientIds, setHeldClientIds] = useState([]) // clientes con reunión realizada en el período
  const [reunionesModal, setReunionesModal] = useState(false)
  // Roster de marcas para la sección de Reuniones (picker + meta). En meses congelados
  // se deriva del propio reporte guardado, igual que crecimiento/pautas — ver `load()`.
  const [reunionesClients, setReunionesClients] = useState([])

  // Snapshot del reporte tal como vino del servidor (o quedó tras un save).
  // Se usa para detectar cambios sin guardar y mostrar aviso al recargar/cerrar.
  const baselineRef = useRef(null)

  const load = useCallback(async () => {
    if (!line?.id || !companyId) return
    setLoading(true)
    setError(null)

    const [
      reportRes,
      prevRes,
      clientsRes,
      companyClientsRes,
      employeesRes,
      adsRes,
      meetingsRes,
      heldRes,
      fixedTaskMarksRes,
      piezasRes,
      pautasRealizadasRes,
      checksRes,
      cnpSolRes,
      tareasSolRes,
    ] = await Promise.all([
      loadReport(line.id, year, month),
      loadPrevReport(line.id, year, month),
      loadClients(companyId, line.id, { includeArchived: true }),
      loadClients(companyId, null, { includeArchived: true }),
      loadCompanyEmployees(companyId),
      loadAds(companyId),
      countMeetingsHeldForLine(companyId, line.id, { month, year }),
      loadHeldClientIdsForLine(companyId, line.id, { month, year }),
      loadFixedTaskMarks(line.id, year, month),
      countPiezasForLine(companyId, line.id, { month, year }),
      countPautasRealizadasByClient(companyId, line.id, { month, year }),
      loadChecks(companyId, year, month),
      countCnpSolicitudesForLine(companyId, line.id, { month, year }),
      countTareasSolicitudesForLine(companyId, line.id, { month, year }),
    ])
    setCompanyClientsById(Object.fromEntries((companyClientsRes.data ?? []).map((c) => [c.id, c])))
    setAds(adsRes.data ?? [])
    const meetingsCount = meetingsRes?.count ?? 0
    const heldIds = heldRes?.clientIds ?? []
    setHeldClientIds(heldIds)

    // Todos (incl. archivados) para resolver nombres en reportes guardados;
    // solo activos EN ESE MES para syncReportClients (no re-agregar archivados
    // al reporte actual, pero sin perder al que se dio de baja durante este mismo mes).
    const allLineClients = clientsRes.data ?? []
    const activeLineClients = allLineClients.filter((c) => clientInMonth(c, year, month))
    setClients(allLineClients)

    const allEmployees = employeesRes.data ?? []
    setCompanyEmployees(allEmployees)
    // Filtrar solo los empleados miembros de esta línea para sincronizar sueldos,
    // igual que FinanzasView. Sin este filtro, syncReportClients recibe [] y borra
    // las filas de nómina del team al guardar desde esta vista. Se excluyen también
    // los que ya estaban de baja ANTES de este mes (ver employeeActiveInMonth).
    const memberIds = new Set(line.member_user_ids ?? [])
    const lineEmployees = allEmployees.filter(
      (e) => memberIds.has(e.user_id) && employeeActiveInMonth(e, year, month),
    )

    // Un mes ya pasado (o cerrado) es de solo lectura: se muestra tal cual se guardó,
    // sin reconciliar contra el roster actual (que puede tener altas/bajas posteriores
    // a ese mes). Ver utils/reportPeriod.js.
    const frozen = isReportFrozen(year, month, closed)

    // Guardar el reporte del mes anterior para mostrarlo en la sección de crecimiento
    setPrevReport(prevRes.data?.data ?? null)

    // Poda las marcas que ya quedaron cubiertas (tienen reunión realizada) del mapa de
    // justificativos, para no arrastrar justificativos obsoletos en el jsonb del reporte.
    function pruneJustificativos(reuniones) {
      const justificativos = { ...(reuniones.justificativos ?? {}) }
      heldIds.forEach((id) => {
        delete justificativos[id]
      })
      return justificativos
    }

    // Antes del lanzamiento del módulo Reuniones no hay filas en `meetings` para derivar
    // el conteo — esos meses conservan el valor que ya tenían guardado en vez de pisarlo
    // con 0. De REUNIONES_MODULE_START en adelante (o si el reporte está cerrado, ver
    // "Cerrar reporte"), se mantiene como siempre reflejando el conteo automático.
    const isReunionesEra =
      year > REUNIONES_MODULE_START.year ||
      (year === REUNIONES_MODULE_START.year && month >= REUNIONES_MODULE_START.month)
    const shouldAutoSync = isReunionesEra && !closed

    let synced
    if (reportRes.data) {
      // Mes congelado (pasado o cerrado): se muestra tal cual se guardó, sin reconciliar
      // contra el roster actual (evita borrar/agregar clientes o empleados retroactivamente).
      // Mes editable: sincronizar items con los clientes/empleados activos EN ESE MES.
      synced = frozen
        ? structuredClone(reportRes.data.data)
        : syncReportClients(reportRes.data.data, activeLineClients, lineEmployees)
    } else {
      // Inicializar con carry-forward y metas de la línea
      const lineMetas = line?.metas ?? {}
      const fresh = initMetricReport(prevRes.data?.data ?? null, activeLineClients, lineMetas)
      synced = frozen ? fresh : syncReportClients(fresh, activeLineClients, lineEmployees)
    }
    // "Realizadas" ya no es editable — siempre refleja el conteo automático (clientes
    // distintos con reunión realizada en el mes), a diferencia del resto de indicadores
    // que quedan congelados al guardar. Excepto en meses previos al módulo Reuniones o
    // en reportes cerrados, donde se conserva el valor histórico guardado.
    if (shouldAutoSync) synced.reuniones.realizadas = meetingsCount
    synced.reuniones.justificativos = pruneJustificativos(synced.reuniones)
    // Meta de reuniones: 1 por marca de la línea, menos las "No aplica" — recalculada
    // solo en el mes en curso (metaAutoSync, ver arriba). metaAutoSync implica mes no
    // congelado, así que el roster vigente es siempre activeLineClients.
    if (metaAutoSync) {
      synced.reuniones.meta = computeReunionesMeta(
        activeLineClients,
        synced.reuniones.justificativos,
      )
    }

    // "Productividad – Tareas Fijas" ya no se captura a mano — se deriva de lo tildado
    // en Gestión de Tareas → Tareas Fijas (fixed_task_marks), mismo patrón que
    // "Realizadas" arriba. Antes del lanzamiento del módulo no hay marcas que derivar,
    // así que esos meses conservan las filas que ya tenían guardadas.
    const isFijasEra =
      year > TAREAS_FIJAS_MODULE_START.year ||
      (year === TAREAS_FIJAS_MODULE_START.year && month >= TAREAS_FIJAS_MODULE_START.month)
    const weeks = buildFixedWeeks(year, month)
    if (isFijasEra && !closed) {
      synced.productividad.tareas = computeProductividad(
        fixedTaskMarksRes.data ?? [],
        activeLineClients,
        weeks,
      )
    }

    // Fila «Actualización de Plataformas» del mismo indicador — se mudó al módulo
    // Chequeo (ver utils/chequeo.js → computePlataformasProductividad), derivada de la
    // grilla semanal de publication_checks (ya no de publication_check_events, en
    // desuso). Antes del lanzamiento no hay celdas que derivar, así que esos meses no la
    // agregan (evita un meta>0/real=0 falso; conserva la fila si ya estaba guardada de antes).
    const isChequeoEra =
      year > CHEQUEO_PRODUCTIVIDAD_START.year ||
      (year === CHEQUEO_PRODUCTIVIDAD_START.year && month >= CHEQUEO_PRODUCTIVIDAD_START.month)
    if (isChequeoEra && !closed) {
      synced.productividad.tareas = [
        ...synced.productividad.tareas.filter((t) => t.nombre !== 'Actualización de Plataformas'),
        computePlataformasProductividad(checksRes.data ?? [], activeLineClients),
      ]
    }

    // "Nº Piezas vs Piezas editadas" ya no se captura a mano — se deriva de las pautas
    // 'realizada' de Tareas Fijas → Audiovisual (av_pautas), mismo patrón que Reuniones y
    // Productividad arriba. Antes del lanzamiento no hay pautas que derivar, así que esos
    // meses conservan el valor que ya tenían guardado.
    const isAvEra =
      year > AUDIOVISUAL_MODULE_START.year ||
      (year === AUDIOVISUAL_MODULE_START.year && month >= AUDIOVISUAL_MODULE_START.month)
    if (isAvEra && !closed) {
      synced.piezas.piezas = piezasRes.piezas
      synced.piezas.editadas = piezasRes.editadas
    }

    // "Nº Pautas" (Realizadas) ya no se captura a mano por marca — se deriva del conteo
    // de pautas 'realizada' de Audiovisual por cliente, mismo corte de fecha que Piezas.
    // La Meta de cada marca sigue siendo manual (no tiene equivalente en av_pautas).
    if (isAvEra && !closed) {
      const byClient = pautasRealizadasRes.byClient
      synced.pautas.items = synced.pautas.items.map((item) => ({
        ...item,
        realizadas: byClient[item.clienteId] ?? 0,
      }))
    }

    // "Solicitudes vs Entregados" ya no se captura a mano — se deriva de CNP + Gestión
    // de Tareas, 5 pts cada uno (ver calcSolicitudes en utils/metricsScore.js). Antes del
    // lanzamiento esos meses conservan el valor que ya tenían guardado. Los dos campos
    // planos (solicitudes/editadas) se mantienen como la suma de ambas fuentes para que
    // reportes/queries antiguas que solo leen esas claves sigan funcionando.
    const isSolicitudesEra =
      year > SOLICITUDES_MODULE_START.year ||
      (year === SOLICITUDES_MODULE_START.year && month >= SOLICITUDES_MODULE_START.month)
    if (isSolicitudesEra && !closed) {
      const cnp = { solicitudes: cnpSolRes.solicitudes, entregados: cnpSolRes.entregados }
      const tareas = { solicitudes: tareasSolRes.solicitudes, entregados: tareasSolRes.entregados }
      synced.solicitudes = {
        solicitudes: cnp.solicitudes + tareas.solicitudes,
        editadas: cnp.entregados + tareas.entregados,
        cnp,
        tareas,
      }
    }
    setReport(synced)
    baselineRef.current = synced

    // Roster de marcas para Reuniones (picker + meta máxima). Debe respetar el mismo
    // congelamiento que crecimiento/pautas/finanzas: en meses pasados no se recalcula contra
    // la asignación de línea ACTUAL (una cuenta movida después de ese mes no debe aparecer
    // como "marca de la línea" en un reporte anterior a la mudanza). En un mes congelado se
    // deriva de los clienteId que efectivamente quedaron en el reporte guardado (crecimiento),
    // resolviendo cada uno a su objeto cliente vía el roster de la línea o el mapa company-wide
    // (por si ya no pertenece a esta línea). En un mes editable se usa el roster activo normal.
    if (frozen) {
      const companyMap = new Map((companyClientsRes.data ?? []).map((c) => [c.id, c]))
      const lineMap = new Map(allLineClients.map((c) => [c.id, c]))
      const rosterIds = [...new Set((synced.crecimiento?.items ?? []).map((i) => i.clienteId))]
      setReunionesClients(
        rosterIds.map((id) => lineMap.get(id) ?? companyMap.get(id)).filter(Boolean),
      )
    } else {
      setReunionesClients(activeLineClients)
    }
    setLoading(false)
  }, [line?.id, line?.member_user_ids, companyId, year, month, closed, metaAutoSync])

  useEffect(() => {
    load()
  }, [load])

  // Aviso nativo del navegador si se intenta recargar/cerrar con cambios sin guardar.
  useUnsavedChanges({ value: report, baseline: baselineRef.current, onClose: () => {} })

  async function handleSave() {
    if (!report || closed) return
    setSaving(true)
    const { error: err } = await upsertReport(companyId, line.id, year, month, report)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    // Actualizar baseline para que el aviso desaparezca tras guardar
    baselineRef.current = report
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Resuelve el cliente por id: primero en la cartera de la línea; si no está (p.ej. se
  // movió a otra línea después de este reporte), cae al mapa company-wide.
  function resolveClient(clienteId) {
    return clients.find((c) => c.id === clienteId) ?? companyClientsById[clienteId] ?? null
  }

  function clientName(clienteId) {
    return resolveClient(clienteId)?.name ?? '[Cliente eliminado]'
  }

  // Renderiza el logo + nombre del cliente como botón que abre la ficha técnica.
  function ClientLink({ clienteId }) {
    const client = resolveClient(clienteId)
    if (client) {
      // La cuenta ya no está en esta línea (se movió): se marca para dar contexto.
      const movida = !!client.line_id && client.line_id !== line?.id
      return (
        <button
          type="button"
          onClick={() => setCliModal(client)}
          className="inline-flex items-center gap-1.5 text-[14px] text-[#555] hover:text-[#111] hover:underline text-left"
          title={`Ver ficha de ${client.name}`}
        >
          <Avatar user={clientAvatar(client)} size={20} />
          {client.name}
          {movida && <span className="text-[11.5px] text-[#aaa] font-mono">· otra línea</span>}
        </button>
      )
    }
    return <span className="text-[14px] text-[#555] truncate">[Cliente eliminado]</span>
  }

  // Puntajes en tiempo real
  const scores = report ? calcTotal(report, null) : null
  const total = scores ? sumScore(scores) : 0
  const scoreColor =
    total >= 80 ? 'text-green-600' : total >= 60 ? 'text-[#b45309]' : 'text-red-600'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!report) return null

  // Ver `reunionesClients` en `load()` para el congelamiento por período.
  const activeClients = reunionesClients

  // ── Helpers de actualización ──────────────────────────────────────────────
  function setField(path, value) {
    setReport((prev) => {
      const next = structuredClone(prev)
      const parts = path.split('.')
      let obj = next
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]]
      obj[parts[parts.length - 1]] = value
      return next
    })
  }

  // Guarda (o quita, si value es "") el justificativo de una marca sin reunión en el período.
  // En mes en curso, la Meta se recalcula en el acto (1 por marca activa, menos "No aplica").
  function setJustificativo(clienteId, value) {
    setReport((prev) => {
      const next = structuredClone(prev)
      const justificativos = { ...(next.reuniones.justificativos ?? {}) }
      if (value) justificativos[clienteId] = value
      else delete justificativos[clienteId]
      next.reuniones.justificativos = justificativos
      if (metaAutoSync) {
        next.reuniones.meta = computeReunionesMeta(reunionesClients, justificativos)
      }
      return next
    })
  }

  function setTareaField(idx, field, value) {
    setReport((prev) => {
      const next = structuredClone(prev)
      next.productividad.tareas[idx][field] =
        field === 'nombre' ? value : value === '' ? null : Number(value)
      return next
    })
  }

  function setItemField(indicador, idx, field, value) {
    setReport((prev) => {
      const next = structuredClone(prev)
      const parsed = value === '' || value === null ? null : Number(value)
      next[indicador].items[idx][field] = field === 'nombre' ? value : parsed
      return next
    })
  }

  // Antes del lanzamiento del módulo Tareas Fijas, "Productividad" se sigue capturando
  // a mano (mismo criterio que en load(), ver TAREAS_FIJAS_MODULE_START en constants.js).
  const isFijasEra =
    year > TAREAS_FIJAS_MODULE_START.year ||
    (year === TAREAS_FIJAS_MODULE_START.year && month >= TAREAS_FIJAS_MODULE_START.month)

  // Antes del lanzamiento del módulo Audiovisual, "Piezas" se sigue capturando a mano
  // (mismo criterio que en load(), ver AUDIOVISUAL_MODULE_START en constants.js).
  const isAvEra =
    year > AUDIOVISUAL_MODULE_START.year ||
    (year === AUDIOVISUAL_MODULE_START.year && month >= AUDIOVISUAL_MODULE_START.month)

  // Antes del lanzamiento del auto-llenado, "Solicitudes vs Entregados" se sigue
  // capturando a mano (mismo criterio que en load(), ver SOLICITUDES_MODULE_START).
  const isSolicitudesEra =
    year > SOLICITUDES_MODULE_START.year ||
    (year === SOLICITUDES_MODULE_START.year && month >= SOLICITUDES_MODULE_START.month)

  return (
    <fieldset disabled={closed} className="space-y-5 border-0 p-0 m-0 min-w-0">
      {/* Header con score en tiempo real */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">
            {line.name} · {MONTHS[month - 1]} {year}
          </p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`text-[36px] font-bold ${scoreColor}`}>{total.toFixed(1)}</span>
            <span className="text-[16px] text-[#aaa] font-mono">/100</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {/* Barra de indicadores */}
          <div className="flex gap-1">
            {INDICATORS.map((ind, i) => {
              const pts = scores?.[ind.key] ?? 0
              const pct = (pts / ind.peso) * 100
              const colors = [
                '#FAB51A',
                '#3B82F6',
                '#10B981',
                '#F97316',
                '#8B5CF6',
                '#06B6D4',
                '#EC4899',
              ]
              return (
                <div
                  key={ind.key}
                  className="flex flex-col items-center gap-0.5"
                  title={`${ind.short}: ${pts.toFixed(1)}/${ind.peso}`}
                >
                  <div className="w-5 h-14 bg-[#f0ede3] rounded-full overflow-hidden flex items-end">
                    <div
                      className="w-full rounded-full transition-all"
                      style={{ height: `${Math.min(100, pct)}%`, background: colors[i] }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[#bbb]">{ind.short.slice(0, 3)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* 1. REUNIONES */}
      <Section
        title="1. Reuniones realizadas"
        subtitle={`Peso: ${INDICATORS[0].peso} pts`}
        score={scores?.reuniones}
        max={INDICATORS[0].peso}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Realizadas">
            <input
              type="number"
              className="input-base bg-[#f2f0e8] text-[#888] cursor-not-allowed"
              value={report.reuniones.realizadas ?? 0}
              disabled
              readOnly
              title="Derivado automáticamente del módulo Reuniones: clientes distintos con reunión realizada en el mes (máx. 1 por cliente)"
            />
            <p className="mt-1 text-[12px] font-mono text-[#888]">
              Derivado de Reuniones · máx. 1 por cliente
            </p>
          </Field>
          <Field label="Meta">
            <input
              type="number"
              className="input-base bg-[#f2f0e8] text-[#888] cursor-not-allowed"
              value={report.reuniones.meta ?? 0}
              disabled
              readOnly
              title="1 por cada marca de la línea, menos las marcadas «No aplica» en este período"
            />
            <p className="mt-1 text-[12px] font-mono text-[#888]">
              {metaAutoSync ? 'Marcas de la línea − «No aplica»' : 'Meta guardada del período'}
            </p>
          </Field>
        </div>
        {(() => {
          const heldSet = new Set(heldClientIds)
          const pending = activeClients.filter((c) => !heldSet.has(c.id))
          return (
            <button
              type="button"
              onClick={() => setReunionesModal(true)}
              className="flex items-center gap-1.5 text-[13px] font-mono text-[#555] hover:text-[#111] transition-colors"
            >
              <svg
                width="14"
                height="14"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              </svg>
              Ver marcas{activeClients.length > 0 ? ` (${pending.length} sin reunión)` : ''}
            </button>
          )
        })()}
        <Field label="Comentario (opcional)">
          <textarea
            className="input-base w-full resize-none"
            rows={2}
            placeholder="Notas u observaciones sobre las reuniones del mes"
            value={report.reuniones.comentario ?? ''}
            onChange={(e) => setField('reuniones.comentario', e.target.value)}
          />
        </Field>
      </Section>

      {reunionesModal && (
        <ReunionesClientesModal
          clients={activeClients}
          heldClientIds={heldClientIds}
          justificativos={report.reuniones.justificativos ?? {}}
          onSetJustificativo={setJustificativo}
          onClose={() => setReunionesModal(false)}
        />
      )}

      {/* 2. PRODUCTIVIDAD */}
      <Section
        title="2. Productividad – Tareas Fijas"
        subtitle={`Peso: ${INDICATORS[1].peso} pts`}
        score={scores?.productividad}
        max={INDICATORS[1].peso}
      >
        <div className="space-y-2">
          {report.productividad.tareas.map((tarea, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[minmax(100px,1fr)_auto_auto] gap-2 items-center"
            >
              <input
                type="text"
                placeholder={isFijasEra ? undefined : 'Nombre de tarea'}
                className={
                  isFijasEra
                    ? 'input-base text-[14px] bg-[#f2f0e8] text-[#888] cursor-not-allowed'
                    : 'input-base text-[14px]'
                }
                value={tarea.nombre}
                onChange={
                  isFijasEra ? undefined : (e) => setTareaField(idx, 'nombre', e.target.value)
                }
                disabled={isFijasEra}
                readOnly={isFijasEra}
              />
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-[#aaa]">Real</span>
                <input
                  type="number"
                  min={isFijasEra ? undefined : '0'}
                  className={
                    isFijasEra
                      ? 'input-base w-20 text-[14px] bg-[#f2f0e8] text-[#888] cursor-not-allowed'
                      : 'input-base w-20 text-[14px]'
                  }
                  value={isFijasEra ? (tarea.realizado ?? 0) : (tarea.realizado ?? '')}
                  onChange={
                    isFijasEra ? undefined : (e) => setTareaField(idx, 'realizado', e.target.value)
                  }
                  disabled={isFijasEra}
                  readOnly={isFijasEra}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-[#aaa]">Meta</span>
                <input
                  type="number"
                  min={isFijasEra ? undefined : '0'}
                  className={
                    isFijasEra
                      ? 'input-base w-20 text-[14px] bg-[#f2f0e8] text-[#888] cursor-not-allowed'
                      : 'input-base w-20 text-[14px]'
                  }
                  value={isFijasEra ? (tarea.meta ?? 0) : (tarea.meta ?? '')}
                  onChange={
                    isFijasEra ? undefined : (e) => setTareaField(idx, 'meta', e.target.value)
                  }
                  disabled={isFijasEra}
                  readOnly={isFijasEra}
                />
              </div>
            </div>
          ))}
          {isFijasEra ? (
            <p className="mt-1 text-[12px] font-mono text-[#888]">
              Derivado de la grilla de tareas recurrentes (Gestión de Tareas)
            </p>
          ) : (
            <button
              onClick={() => {
                setReport((prev) => {
                  const next = structuredClone(prev)
                  next.productividad.tareas.push({ nombre: '', realizado: null, meta: null })
                  return next
                })
              }}
              className="text-[13px] text-[#888] hover:text-[#111] font-medium flex items-center gap-1 mt-1"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M6 1v10M1 6h10" strokeLinecap="round" />
              </svg>
              Agregar tarea
            </button>
          )}
        </div>
        <SectionTotal label="tareas" count={report.productividad.tareas.length} />
      </Section>

      {/* 3. CRECIMIENTO */}
      {(() => {
        const prevMonth = month - 1 < 1 ? 12 : month - 1
        const prevMonthName = MONTHS[prevMonth - 1]
        const currMonthName = MONTHS[month - 1]
        // seedMode: no hay reporte previo → todas las columnas del periodo pasado son editables
        const seedMode = !prevReport
        // Anchos fijos (no "auto") para que el encabezado y cada fila —cada uno su propia
        // grilla— alineen columna a columna sin importar si el badge/% o Inversión Ads
        // tienen contenido más largo o más corto en una fila que en otra.
        // 200px: 2×92px inputs + gap-2 (mes anterior). 210px: ídem + border-l/pl-2 (mes actual).
        // 88px: Meta (input !w-20). 104px: badge de cumplimiento + %. 120px: Inversión Ads.
        const GROW_COLS = 'grid-cols-[minmax(110px,1fr)_200px_210px_88px_104px_120px]'
        return (
          <Section
            title="3. Crecimiento de seguidores"
            subtitle={`Peso: ${INDICATORS[2].peso} pts — cliente cumple si seguidores ganados ≥ meta`}
            score={scores?.crecimiento}
            max={INDICATORS[2].peso}
          >
            {seedMode && (
              <p className="text-[12px] text-[#888] bg-[#faf9f3] border border-[#e8e4d8] rounded-lg px-3 py-2 mb-1">
                Primer mes de uso: ingresá manualmente los seguidores del periodo anterior como
                línea base. A partir del próximo mes se auto-completará.
              </p>
            )}
            {!seedMode &&
              report.crecimiento.items.some((item) => {
                const prevItem = (prevReport?.crecimiento?.items ?? []).find(
                  (i) => i.clienteId === item.clienteId,
                )
                return (
                  prevItem?.seguidoresGanados == null ||
                  prevItem?.seguidoresGanados === '' ||
                  prevItem?.seguidoresActuales == null ||
                  prevItem?.seguidoresActuales === ''
                )
              }) && (
                <p className="text-[12px] text-[#888] bg-[#faf9f3] border border-[#e8e4d8] rounded-lg px-3 py-2 mb-1">
                  Algunos valores del mes anterior están vacíos. Podés completarlos manualmente como
                  línea base.
                </p>
              )}
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                {report.crecimiento.items.length === 0 ? (
                  <p className="text-[14px] text-[#bbb]">
                    Sin clientes. Configurá la cartera en la pestaña Configuración.
                  </p>
                ) : (
                  <>
                    {/* Fila de encabezados de columna */}
                    <div className={`grid ${GROW_COLS} gap-x-3 gap-y-0 items-center mb-1`}>
                      <div />
                      {/* Título único mes anterior (centrado sobre las 2 columnas del grupo) */}
                      <div className="text-center">
                        <span
                          className={`text-[11px] font-mono font-bold uppercase tracking-[0.08em] whitespace-nowrap ${seedMode ? 'text-[#888]' : 'text-[#bbb]'}`}
                        >
                          {prevMonthName}
                        </span>
                      </div>
                      {/* Título único mes actual (centrado sobre las 2 columnas del grupo) */}
                      <div className="text-center border-l border-[#e0ddd4] pl-2">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-[0.08em] text-[#555] whitespace-nowrap">
                          {currMonthName}
                        </span>
                      </div>
                      <div />
                      <div />
                      <div />
                    </div>
                    {/* Filas por cliente */}
                    <div className="space-y-2">
                      {report.crecimiento.items.map((item, idx) => {
                        const { ganados, cumple, pct } = crecimientoCliente(item)
                        const spent = spentByClientInPeriod(ads, item.clienteId, { month, year })
                        const budget = clients.find((c) => c.id === item.clienteId)?.campaign_budget
                        const prevItem = (prevReport?.crecimiento?.items ?? []).find(
                          (i) => i.clienteId === item.clienteId,
                        )
                        // Editable por campo: si el mes anterior tiene un valor, se muestra bloqueado;
                        // si está vacío (o no hay reporte previo), se puede editar manualmente.
                        const hasPrevGanados =
                          prevItem?.seguidoresGanados != null && prevItem?.seguidoresGanados !== ''
                        const hasPrevTotales =
                          prevItem?.seguidoresActuales != null &&
                          prevItem?.seguidoresActuales !== ''
                        const ganadosEditable = !hasPrevGanados
                        const totalesEditable = !hasPrevTotales
                        const prevGanados = hasPrevGanados
                          ? prevItem.seguidoresGanados
                          : (item.seguidoresGanadosPrev ?? '')
                        const prevTotales = hasPrevTotales
                          ? prevItem.seguidoresActuales
                          : (item.seguidoresBase ?? '')
                        return (
                          <div
                            key={item.clienteId}
                            className={`grid ${GROW_COLS} gap-x-3 items-center`}
                          >
                            <ClientLink clienteId={item.clienteId} />

                            {/* Mes anterior — editable si no hay dato en el reporte del mes anterior */}
                            <div className="flex gap-2 items-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={`text-[10px] whitespace-nowrap ${ganadosEditable ? 'text-[#777]' : 'text-[#999]'}`}
                                >
                                  Gan. {prevMonthName.slice(0, 3)}
                                </span>
                                <input
                                  type="number"
                                  disabled={!ganadosEditable}
                                  readOnly={!ganadosEditable}
                                  className={`input-base !w-[92px] flex-none text-[13px] ${ganadosEditable ? '' : 'bg-[#f5f3ec] text-[#bbb] cursor-not-allowed'}`}
                                  placeholder="—"
                                  value={prevGanados}
                                  onChange={
                                    ganadosEditable
                                      ? (e) =>
                                          setItemField(
                                            'crecimiento',
                                            idx,
                                            'seguidoresGanadosPrev',
                                            e.target.value === '' ? null : e.target.value,
                                          )
                                      : undefined
                                  }
                                />
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={`text-[10px] whitespace-nowrap ${totalesEditable ? 'text-[#777]' : 'text-[#999]'}`}
                                >
                                  Tot. {prevMonthName.slice(0, 3)}
                                </span>
                                <input
                                  type="number"
                                  disabled={!totalesEditable}
                                  readOnly={!totalesEditable}
                                  className={`input-base !w-[92px] flex-none text-[13px] ${totalesEditable ? '' : 'bg-[#f5f3ec] text-[#bbb] cursor-not-allowed'}`}
                                  placeholder="—"
                                  value={prevTotales}
                                  onChange={
                                    totalesEditable
                                      ? (e) =>
                                          setItemField(
                                            'crecimiento',
                                            idx,
                                            'seguidoresBase',
                                            e.target.value === '' ? null : e.target.value,
                                          )
                                      : undefined
                                  }
                                />
                              </div>
                            </div>

                            {/* Mes actual — editables */}
                            <div className="flex gap-2 items-center border-l border-[#e0ddd4] pl-2">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[10px] text-[#aaa] whitespace-nowrap">
                                  Gan. {currMonthName.slice(0, 3)}
                                </span>
                                <input
                                  type="number"
                                  className="input-base !w-[92px] flex-none text-[13px]"
                                  placeholder="—"
                                  value={item.seguidoresGanados ?? ''}
                                  onChange={(e) =>
                                    setItemField(
                                      'crecimiento',
                                      idx,
                                      'seguidoresGanados',
                                      e.target.value === '' ? null : e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[10px] text-[#aaa] whitespace-nowrap">
                                  Tot. {currMonthName.slice(0, 3)}
                                </span>
                                <input
                                  type="number"
                                  className="input-base !w-[92px] flex-none text-[13px]"
                                  placeholder="—"
                                  value={item.seguidoresActuales ?? ''}
                                  onChange={(e) =>
                                    setItemField(
                                      'crecimiento',
                                      idx,
                                      'seguidoresActuales',
                                      e.target.value === '' ? null : e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>

                            {/* Meta */}
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[10px] text-[#aaa] whitespace-nowrap">
                                Meta
                              </span>
                              <input
                                type="number"
                                min="0"
                                className="input-base !w-20 flex-none text-[13px]"
                                value={item.meta ?? ''}
                                onChange={(e) =>
                                  setItemField('crecimiento', idx, 'meta', e.target.value)
                                }
                              />
                            </div>

                            {/* Indicador de cumplimiento + % */}
                            <div className="flex flex-col items-center gap-0.5">
                              {cumple === null ? (
                                <span
                                  className="text-[12px] text-[#bbb] font-mono"
                                  title="Faltan datos de seguidores ganados"
                                >
                                  —
                                </span>
                              ) : cumple ? (
                                <span
                                  className="text-[12px] font-semibold text-green-700 bg-green-50 rounded-full px-2.5 py-0.5 whitespace-nowrap"
                                  title={ganados !== null ? `+${ganados} seguidores ganados` : ''}
                                >
                                  ✓ Cumple
                                </span>
                              ) : (
                                <span
                                  className="text-[12px] font-semibold text-[#a06a00] bg-[#fff6e0] rounded-full px-2.5 py-0.5 whitespace-nowrap"
                                  title={ganados !== null ? `${ganados} seguidores ganados` : ''}
                                >
                                  Pendiente
                                </span>
                              )}
                              {/* Altura reservada aunque no haya %, para que todas las filas midan igual */}
                              <span
                                className={`text-[11px] font-mono font-semibold leading-none ${pct !== null ? (cumple ? 'text-green-600' : 'text-red-500') : 'invisible'}`}
                              >
                                {pct !== null ? `${Math.round(pct)}%` : '0%'}
                              </span>
                            </div>

                            {/* Inversión en pauta (auto desde paid_campaigns, por start_date) vs presupuesto del cliente */}
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[10px] text-[#aaa] whitespace-nowrap">
                                Inversión Ads
                              </span>
                              <span className="flex items-baseline gap-0.5 whitespace-nowrap">
                                <span className="text-[13px] font-mono text-[#555] tabular-nums">
                                  {fmtUSD(spent)}
                                </span>
                                {budget != null && (
                                  <span className="text-[10px] font-mono text-[#aaa] tabular-nums">
                                    / {fmtUSD(budget)}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            {report.crecimiento.items.length > 0 && (
              <SectionTotal label="marcas" count={report.crecimiento.items.length} />
            )}
          </Section>
        )
      })()}

      {/* 4. SOLICITUDES */}
      <Section
        title="4. Solicitudes vs Entregados (CNP y gestión de tareas)"
        subtitle={`Peso: ${INDICATORS[3].peso} pts`}
        score={scores?.solicitudes}
        max={INDICATORS[3].peso}
      >
        {isSolicitudesEra ? (
          <div
            className="overflow-x-auto"
            title="Derivado automáticamente de CNP y Gestión de Tareas"
          >
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[11px] font-mono font-bold tracking-[0.1em] uppercase text-[#aaa]">
                  <th className="pb-1.5 font-normal">Fuente</th>
                  <th className="pb-1.5 font-normal text-right">Entregados / Solicitados</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#ece9df]">
                  <td className="py-1.5 text-[#333]">CNP (piezas)</td>
                  <td className="py-1.5 text-right font-mono text-[#555]">
                    {report.solicitudes.cnp?.entregados ?? 0} /{' '}
                    {report.solicitudes.cnp?.solicitudes ?? 0}
                  </td>
                </tr>
                <tr className="border-t border-[#ece9df]">
                  <td className="py-1.5 text-[#333]">Gestión de Tareas</td>
                  <td className="py-1.5 text-right font-mono text-[#555]">
                    {report.solicitudes.tareas?.entregados ?? 0} /{' '}
                    {report.solicitudes.tareas?.solicitudes ?? 0}
                  </td>
                </tr>
                <tr className="border-t border-[#ece9df] font-semibold">
                  <td className="py-1.5 text-[#111]">Total</td>
                  <td className="py-1.5 text-right font-mono text-[#111]">
                    {report.solicitudes.editadas ?? 0} / {report.solicitudes.solicitudes ?? 0}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[12px] font-mono text-[#888]">
              Derivado de CNP y Gestión de Tareas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Solicitudes recibidas">
              <input
                type="number"
                min="0"
                className="input-base"
                value={report.solicitudes.solicitudes ?? ''}
                onChange={(e) =>
                  setField(
                    'solicitudes.solicitudes',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field label="Editadas / Entregadas">
              <input
                type="number"
                min="0"
                className="input-base"
                value={report.solicitudes.editadas ?? ''}
                onChange={(e) =>
                  setField(
                    'solicitudes.editadas',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
          </div>
        )}
      </Section>

      {/* 5. PAUTAS */}
      <Section
        title="5. Nº Pautas"
        subtitle={`Peso: ${INDICATORS[4].peso} pts — cliente cumple si realizadas ≥ meta`}
        score={scores?.pautas}
        max={INDICATORS[4].peso}
      >
        <div className="overflow-x-auto">
          <div className="space-y-2">
            {report.pautas.items.length === 0 ? (
              <p className="text-[14px] text-[#bbb]">Sin clientes configurados.</p>
            ) : (
              report.pautas.items.map((item, idx) => (
                <div
                  key={item.clienteId}
                  className="grid grid-cols-[minmax(100px,1fr)_auto_auto] gap-2 items-center"
                >
                  <ClientLink clienteId={item.clienteId} />
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#aaa]">Realizadas</span>
                      <input
                        type="number"
                        min="0"
                        className={
                          isAvEra
                            ? 'input-base w-20 text-[13px] bg-[#f2f0e8] text-[#888] cursor-not-allowed'
                            : 'input-base w-20 text-[13px]'
                        }
                        value={item.realizadas ?? ''}
                        disabled={isAvEra}
                        readOnly={isAvEra}
                        onChange={
                          isAvEra
                            ? undefined
                            : (e) => setItemField('pautas', idx, 'realizadas', e.target.value)
                        }
                        title={
                          isAvEra
                            ? 'Derivado automáticamente de Audiovisual: pautas realizadas del cliente en el mes'
                            : undefined
                        }
                      />
                    </div>
                    {isAvEra && (
                      <p className="text-[10px] font-mono text-[#888]">Derivado de Audiovisual</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-[#aaa]">Meta</span>
                    <input
                      type="number"
                      min="0"
                      className="input-base w-20 text-[13px]"
                      value={item.meta ?? ''}
                      onChange={(e) => setItemField('pautas', idx, 'meta', e.target.value)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {report.pautas.items.length > 0 && (
          <SectionTotal label="marcas" count={report.pautas.items.length} />
        )}
      </Section>

      {/* 6. PIEZAS */}
      <Section
        title="6. Nº Piezas vs Piezas editadas"
        subtitle={`Peso: ${INDICATORS[5].peso} pts`}
        score={scores?.piezas}
        max={INDICATORS[5].peso}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Piezas totales">
            <input
              type="number"
              min="0"
              className={
                isAvEra ? 'input-base bg-[#f2f0e8] text-[#888] cursor-not-allowed' : 'input-base'
              }
              value={isAvEra ? (report.piezas.piezas ?? 0) : (report.piezas.piezas ?? '')}
              disabled={isAvEra}
              readOnly={isAvEra}
              onChange={
                isAvEra
                  ? undefined
                  : (e) =>
                      setField(
                        'piezas.piezas',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
              }
              title={
                isAvEra
                  ? 'Derivado automáticamente de Audiovisual: piezas de las pautas realizadas en el mes'
                  : undefined
              }
            />
            {isAvEra && (
              <p className="mt-1 text-[12px] font-mono text-[#888]">Derivado de Audiovisual</p>
            )}
          </Field>
          <Field label="Piezas editadas">
            <input
              type="number"
              min="0"
              className={
                isAvEra ? 'input-base bg-[#f2f0e8] text-[#888] cursor-not-allowed' : 'input-base'
              }
              value={isAvEra ? (report.piezas.editadas ?? 0) : (report.piezas.editadas ?? '')}
              disabled={isAvEra}
              readOnly={isAvEra}
              onChange={
                isAvEra
                  ? undefined
                  : (e) =>
                      setField(
                        'piezas.editadas',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
              }
              title={
                isAvEra
                  ? 'Derivado automáticamente de Audiovisual: piezas editadas de las pautas realizadas en el mes'
                  : undefined
              }
            />
            {isAvEra && (
              <p className="mt-1 text-[12px] font-mono text-[#888]">Derivado de Audiovisual</p>
            )}
          </Field>
        </div>
      </Section>

      {/* Botón guardar */}
      <div className="flex flex-col items-end gap-2 pt-2 pb-6">
        {/* Checkbox mes incompleto */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!report.incompleto}
            onChange={(e) => setField('incompleto', e.target.checked)}
            className="w-4 h-4 rounded border-[#d0ccc0] accent-[#FAB51A] cursor-pointer"
          />
          <span className="text-[13px] text-[#888]">
            Marcar mes como incompleto{' '}
            <span className="text-[#bbb]">(no contar en el promedio anual)</span>
          </span>
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-[15px] transition-all ${
            saved ? 'bg-green-500 text-white' : 'bg-[#FAB51A] text-[#111] hover:bg-[#e8a315]'
          } disabled:opacity-60`}
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-[#111] border-t-transparent rounded-full animate-spin" />
          ) : saved ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
          {saved ? 'Guardado' : saving ? 'Guardando...' : 'Guardar reporte'}
        </button>
      </div>
      {cliModal && (
        <ClientFichaModal
          client={cliModal}
          line={line}
          onClose={() => setCliModal(null)}
          employees={companyEmployees}
        />
      )}
    </fieldset>
  )
}

function Section({ title, subtitle, score, max, children }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0
  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-[#111]">{title}</p>
          <p className="text-[12px] text-[#aaa] mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="text-[20px] font-bold text-[#111] tabular-nums">
            {score != null ? score.toFixed(1) : '—'}
          </span>
          <span className="text-[11px] font-mono text-[#aaa]">/{max} pts</span>
          <div className="w-24 h-1.5 bg-[#f0ede3] rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-[#FAB51A] rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[12px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
