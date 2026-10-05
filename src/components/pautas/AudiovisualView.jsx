import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import { loadCompanyEmployees } from '../metricas/metricsApi'
import { loadPautas, loadPiezas, updatePauta } from './avPautasApi'
import { loadExternalResources } from './externalResourcesApi'
import { loadCnp } from '../cnp/cnpApi'
import { cnpInMonth } from '../cnp/constants'
import {
  nextAgendaDeadline,
  pautasInScope,
  pautasInMonth,
  externalAsUser,
  externalUsersForRole,
  pautaPermissions,
  leadLineIdsFor,
  pendingApprovalCount,
  pendientesPorEditar,
  alertas as calcAlertas,
  miTrabajo as calcMiTrabajo,
} from '../../utils/audiovisual'
import { effectiveLineId } from '../../utils/lineFilters'
import AvToolbar from './AvToolbar'
import AvSemanaView from './AvSemanaView'
import AvCalendarView from './AvCalendarView'
import AvListView from './AvListView'
import AvDatosView from './AvDatosView'
import PautaDetail from './PautaDetail'
import PautaFormModal from './PautaFormModal'
import SolicitarWizard from './SolicitarWizard'
import MisSolicitudes from './MisSolicitudes'
import MiTrabajoView from './MiTrabajoView'
import DayPautasModal from './DayPautasModal'
import WhatsAppAgendaModal from './WhatsAppAgendaModal'

const ALL_LINES = '__all__'

function currentYearMonth() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

const DEFAULT_LIST_FILTER = {
  status: 'solicitadas',
  recursoId: null,
  query: '',
  pendiente: null,
  lineId: null,
}

/**
 * Módulo Pautas (Tareas Fijas → Audiovisual): dueño del estado (pautas, piezas, empleados,
 * recursos externos, CNP de audiovisual) y del realtime; reparte a tres vistas (Calendario /
 * Lista / Rendimiento) y a los modales (detalle, formulario, día, WhatsApp). Se monta desde
 * PautasPage con `lines`/`clients` ya cargadas.
 */
export default function AudiovisualView({
  companyId,
  userProfile,
  can,
  lines,
  clients,
  // Línea general "Independientes" (metric_lines.is_general): agrupa cuentas sin línea.
  generalLine = null,
}) {
  const canManage = can('audiovisual.manage')
  const canCoordinate = can('audiovisual.coordina')
  const canGestionPautas = can('audiovisual.pautas.gestion')
  const leadLineIds = leadLineIdsFor(lines, userProfile?.user_id)
  const canViewAll =
    userProfile?.access_level >= 4 ||
    userProfile?.admin === true ||
    can('audiovisual.ver_todo') ||
    can('audiovisual.piezas')

  const [{ year, month }, setPeriod] = useState(currentYearMonth)
  const [pautas, setPautas] = useState([])
  const [piezas, setPiezas] = useState([])
  const [employees, setEmployees] = useState([])
  const [externalResources, setExternalResources] = useState([])
  const [cnpRequests, setCnpRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [scopeLineId, setScopeLineId] = useState(ALL_LINES)
  // Cada rol entra a la pantalla que le sirve: coordinación/jefas a Semana; el equipo
  // audiovisual (recursos, sin coordinar) a Mi trabajo.
  const esRecurso = userProfile?.department_id === 2 && !canCoordinate
  const [view, setView] = useState(esRecurso ? 'mitrabajo' : 'semana')
  const [semanaModo, setSemanaModo] = useState('semana')
  const [calendarFilter, setCalendarFilter] = useState('todas')
  const [listFilter, setListFilter] = useState(DEFAULT_LIST_FILTER)
  // El detalle se guarda por id y se resuelve contra `pautas`: así siempre pinta la fila
  // que llegó por realtime, sin sincronizarla a mano.
  const [detailId, setDetailId] = useState(null)
  // null = cerrado, {mode:'create'} o {mode:'edit', pauta}.
  const [form, setForm] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [waOpen, setWaOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const defaultLineId = !canViewAll ? (lines[0]?.id ?? null) : null
  const scopeLine = canViewAll ? (scopeLineId === ALL_LINES ? null : scopeLineId) : defaultLineId

  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [pautasRes, employeesRes, piezasRes, externalRes, cnpRes] = await Promise.all([
      loadPautas(companyId),
      loadCompanyEmployees(companyId),
      loadPiezas(companyId),
      loadExternalResources(companyId),
      loadCnp(companyId),
    ])
    setPautas(pautasRes.data ?? [])
    setEmployees(employeesRes.data ?? [])
    setPiezas(piezasRes.data ?? [])
    setExternalResources(externalRes.data ?? [])
    setCnpRequests(cnpRes.data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Deep-link ?pautaId= (campanita de notificaciones): abre el detalle y lleva el
  // calendario al mes y línea de la pauta.
  useEffect(() => {
    const pautaId = searchParams.get('pautaId')
    if (!pautaId || pautas.length === 0) return
    const pauta = pautas.find((p) => p.id === pautaId)
    if (pauta) {
      setDetailId(pauta.id)
      setView('semana')
      if (pauta.pauta_date) {
        const [y, m] = pauta.pauta_date.split('-').map(Number)
        setPeriod({ year: y, month: m })
      }
      if (canViewAll && pauta.line_id) setScopeLineId(pauta.line_id)
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('pautaId')
        return next
      },
      { replace: true },
    )
  }, [searchParams, pautas, canViewAll, setSearchParams])

  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('av-pautas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'av_pautas' }, (payload) => {
        setPautas((prev) => {
          if (payload.eventType === 'INSERT') {
            if (payload.new.company_id !== companyId) return prev
            return prev.some((p) => p.id === payload.new.id) ? prev : [...prev, payload.new]
          }
          if (payload.eventType === 'UPDATE')
            return prev.map((p) => (p.id === payload.new.id ? payload.new : p))
          if (payload.eventType === 'DELETE') return prev.filter((p) => p.id !== payload.old.id)
          return prev
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('av-pauta-piezas-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'av_pauta_piezas' },
        (payload) => {
          setPiezas((prev) => {
            if (payload.eventType === 'INSERT') {
              if (payload.new.company_id !== companyId) return prev
              return prev.some((p) => p.id === payload.new.id) ? prev : [...prev, payload.new]
            }
            if (payload.eventType === 'UPDATE')
              return prev.map((p) => (p.id === payload.new.id ? payload.new : p))
            if (payload.eventType === 'DELETE') return prev.filter((p) => p.id !== payload.old.id)
            return prev
          })
        },
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [companyId])

  function handleChanged(pauta) {
    setPautas((prev) => {
      const exists = prev.some((p) => p.id === pauta.id)
      return exists ? prev.map((p) => (p.id === pauta.id ? pauta : p)) : [...prev, pauta]
    })
  }

  function handleDeleted(id) {
    setPautas((prev) => prev.filter((p) => p.id !== id))
  }

  function handlePiezaChanged(pieza) {
    setPiezas((prev) => {
      const exists = prev.some((p) => p.id === pieza.id)
      return exists ? prev.map((p) => (p.id === pieza.id ? pieza : p)) : [...prev, pieza]
    })
  }

  function handlePiezaDeleted(id) {
    setPiezas((prev) => prev.filter((p) => p.id !== id))
  }

  // Único camino de escritura de `av_pautas` desde el detalle y sus diálogos.
  async function handlePautaFields(pauta, fields) {
    const { data, error: err } = await updatePauta(pauta.id, fields)
    if (err) return { error: err }
    handleChanged(data)
    return { error: null }
  }

  const generalLineId = generalLine?.id ?? null
  const linesWithGeneral = generalLine ? [...lines, generalLine] : lines
  const scopedPautas = pautasInScope(pautas, scopeLine, generalLineId)
  const visibleScopedPautas = scopedPautas.filter((p) => !p.deleted_at)
  const scopedClients = clients.filter(
    (c) => !scopeLine || effectiveLineId(c, generalLineId) === scopeLine,
  )
  const audiovisualUsers = employees.filter((u) => u.department_id === 2 && !u.deleted_at)
  const recursoOptions = [
    ...audiovisualUsers,
    ...externalUsersForRole(externalResources, 'grabacion'),
  ]
  const editorOptions = [...audiovisualUsers, ...externalUsersForRole(externalResources, 'edicion')]
  const activeEmployees = employees.filter((u) => !u.deleted_at)
  const usersById = new Map([
    ...employees.map((u) => [u.user_id, u]),
    ...externalResources.map((r) => {
      const u = externalAsUser(r)
      return [u.user_id, u]
    }),
  ])
  const piezasByPautaMap = new Map()
  piezas.forEach((pz) => {
    if (!piezasByPautaMap.has(pz.pauta_id)) piezasByPautaMap.set(pz.pauta_id, [])
    piezasByPautaMap.get(pz.pauta_id).push(pz)
  })
  // La lista y el rendimiento siguen al mes del calendario; las pautas sin fecha
  // (solicitudes) se ven siempre. `monthPautas` conserva las borradas (filtro Papelera).
  const monthPautas = pautasInMonth(scopedPautas, year, month)
  const visiblePautas = monthPautas.filter((p) => !p.deleted_at)
  const cnpMonthIdx = year * 12 + (month - 1)
  const cnpAv = pautasInScope(
    cnpRequests.filter((c) => c.is_audiovisual && !c.deleted_at),
    scopeLine,
    generalLineId,
  ).filter((c) => cnpInMonth(c, cnpMonthIdx))
  const pendientes = pendientesPorEditar(
    visiblePautas,
    piezasByPautaMap,
    linesWithGeneral,
    generalLineId,
  )
  const pendingCount = pendingApprovalCount(scopedPautas)
  const alertas = calcAlertas(visibleScopedPautas, piezasByPautaMap)
  const permsFor = (p) =>
    pautaPermissions({
      canCoordinate,
      canGestionPautas,
      canManage,
      userId: userProfile?.user_id,
      pauta: p,
      leadLineIds,
    })
  // "Mi trabajo" existe para los recursos y para cualquiera que tenga algo propio que
  // marcar (pautas asignadas o lotes por entregar).
  const mio = calcMiTrabajo(visibleScopedPautas, piezas, userProfile?.user_id)
  const tieneTrabajo =
    esRecurso ||
    mio.hoy.length + mio.proximas.length + mio.pasadasSinCaptura.length + mio.porEditar.length > 0
  const views = [
    {
      key: 'semana',
      label: 'Semana',
      badge: alertas.total,
      badgeLabel: `${alertas.total} cosas por atender`,
      badgeTone: 'red',
    },
    ...(tieneTrabajo
      ? [
          {
            key: 'mitrabajo',
            label: 'Mi trabajo',
            badge: mio.resumen.pendientes,
            badgeLabel: `${mio.resumen.pendientes} piezas por editar`,
          },
        ]
      : []),
    { key: 'datos', label: 'Datos' },
    {
      key: 'todas',
      label: 'Todas',
      badge: pendingCount,
      badgeLabel: `${pendingCount} solicitudes por aprobar`,
    },
  ]
  const detailPauta = detailId ? (pautas.find((p) => p.id === detailId) ?? null) : null
  const { deadline } = nextAgendaDeadline()

  function goToMonth(y, m) {
    setPeriod({ year: y, month: m })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="bg-white border border-[#e8e4d8] rounded-xl px-4 py-3 mb-4 text-[13.5px] text-[#555] leading-relaxed">
        Calendario de <strong>pautas audiovisuales</strong> (grabaciones/sesiones) por cliente. La
        agenda de la semana siguiente se arma el jueves, máximo el viernes 05:00pm.
        <span className="block mt-1 text-[12.5px] font-mono text-[#b98900]">
          Próximo cierre de agenda:{' '}
          {deadline.toLocaleDateString('es-VE', {
            weekday: 'long',
            day: '2-digit',
            month: 'short',
          })}{' '}
          · 05:00pm
        </span>
      </div>

      <AvToolbar
        canViewAll={canViewAll}
        lines={lines}
        generalLine={generalLine}
        scopeLineId={scopeLineId}
        allLinesKey={ALL_LINES}
        onScopeChange={setScopeLineId}
        views={views}
        view={view}
        onViewChange={setView}
        canCreate={canManage || canCoordinate}
        createLabel={canCoordinate ? 'Agregar pauta' : 'Solicitar pauta'}
        onCreate={() => setForm({ mode: 'create' })}
        onWhatsApp={() => setWaOpen(true)}
      />

      {view === 'semana' && (
        <AvSemanaView
          pautas={visibleScopedPautas}
          piezasByPauta={piezasByPautaMap}
          usersById={usersById}
          recursoUsers={recursoOptions}
          allEmployees={activeEmployees}
          canApprove={canCoordinate}
          onFields={handlePautaFields}
          onPautaClick={(p) => setDetailId(p.id)}
          onGoDatos={() => setView('datos')}
          modo={semanaModo}
          onModoChange={(modo, ancla) => {
            setSemanaModo(modo)
            if (modo === 'mes') {
              const [y, m] = ancla.split('-').map(Number)
              goToMonth(y, m)
            }
          }}
          calendario={
            <AvCalendarView
              year={year}
              month={month}
              pautas={visibleScopedPautas}
              monthPautas={visiblePautas}
              filter={calendarFilter}
              onFilterChange={setCalendarFilter}
              onMonthChange={goToMonth}
              onDayClick={setDayDetail}
              onPautaClick={(p) => setDetailId(p.id)}
            />
          }
        >
          {!canCoordinate && (
            <MisSolicitudes
              pautas={visibleScopedPautas}
              userId={userProfile?.user_id}
              onPautaClick={(p) => setDetailId(p.id)}
            />
          )}
        </AvSemanaView>
      )}

      {view === 'mitrabajo' && (
        <MiTrabajoView
          pautas={visibleScopedPautas}
          piezas={piezas}
          piezasByPauta={piezasByPautaMap}
          usersById={usersById}
          userId={userProfile?.user_id}
          userName={usersById.get(userProfile?.user_id)?.first_name ?? ''}
          permsFor={permsFor}
          companyId={companyId}
          onFields={handlePautaFields}
          onPiezaChanged={handlePiezaChanged}
          onPautaClick={(p) => setDetailId(p.id)}
        />
      )}

      {view === 'todas' && (
        <AvListView
          pautas={monthPautas}
          piezasByPauta={piezasByPautaMap}
          lines={linesWithGeneral}
          generalLineId={generalLineId}
          usersById={usersById}
          recursoUsers={recursoOptions}
          filter={listFilter}
          onFilterChange={setListFilter}
          pendientes={pendientes}
          onPautaClick={(p) => setDetailId(p.id)}
        />
      )}

      {view === 'datos' && (
        <AvDatosView
          pautas={visiblePautas}
          allPautas={visibleScopedPautas}
          year={year}
          month={month}
          lines={linesWithGeneral}
          generalLineId={generalLineId}
          usersById={usersById}
          piezasByPauta={piezasByPautaMap}
          cnpAv={cnpAv}
          pendientes={pendientes}
          onMonthChange={(ym) => {
            const [y, m] = ym.split('-').map(Number)
            goToMonth(y, m)
          }}
          onSelectPendiente={(sel) => {
            setListFilter({ ...DEFAULT_LIST_FILTER, pendiente: sel })
            setView('todas')
          }}
          onSelectLine={(lineId) => {
            setListFilter({ ...DEFAULT_LIST_FILTER, status: 'agendadas', lineId })
            setView('todas')
          }}
        />
      )}

      {detailPauta && (
        <PautaDetail
          pauta={detailPauta}
          piezas={piezasByPautaMap.get(detailPauta.id) ?? []}
          pautas={pautas}
          lines={linesWithGeneral}
          usersById={usersById}
          recursoUsers={recursoOptions}
          editorUsers={editorOptions}
          allEmployees={activeEmployees}
          perms={pautaPermissions({
            canCoordinate,
            canGestionPautas,
            canManage,
            userId: userProfile?.user_id,
            pauta: detailPauta,
            leadLineIds,
          })}
          userId={userProfile?.user_id}
          companyId={companyId}
          onFields={handlePautaFields}
          onChanged={handleChanged}
          onDeleted={(id) => {
            handleDeleted(id)
            setDetailId(null)
          }}
          onPiezaChanged={handlePiezaChanged}
          onPiezaDeleted={handlePiezaDeleted}
          onEdit={(p) => setForm({ mode: 'edit', pauta: p })}
          onClose={() => setDetailId(null)}
        />
      )}

      {form?.mode === 'create' && (
        <SolicitarWizard
          clients={scopedClients}
          employees={activeEmployees}
          recursoUsers={audiovisualUsers}
          pautas={pautas}
          companyId={companyId}
          userId={userProfile?.user_id}
          defaultLineId={defaultLineId}
          onClose={() => setForm(null)}
          onSaved={(p) => {
            handleChanged(p)
            setForm(null)
            setView('semana')
          }}
        />
      )}

      {form?.mode === 'edit' && (
        <PautaFormModal
          pauta={form.pauta}
          clients={scopedClients}
          employees={activeEmployees}
          pautas={pautas}
          onClose={() => setForm(null)}
          onSaved={(p) => {
            handleChanged(p)
            setForm(null)
          }}
        />
      )}

      {dayDetail && (
        <DayPautasModal
          date={dayDetail}
          pautas={visibleScopedPautas}
          usersById={usersById}
          onClose={() => setDayDetail(null)}
          onPautaClick={(p) => {
            setDayDetail(null)
            setDetailId(p.id)
          }}
        />
      )}

      {waOpen && (
        <WhatsAppAgendaModal
          pautas={visibleScopedPautas}
          lines={linesWithGeneral}
          generalLineId={generalLineId}
          usersById={usersById}
          onClose={() => setWaOpen(false)}
        />
      )}
    </div>
  )
}
