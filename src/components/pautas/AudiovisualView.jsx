import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { loadCompanyEmployees } from '../metricas/metricsApi'
import { loadPautas, createPauta } from './avPautasApi'
import {
  avEditMode,
  nextAgendaDeadline,
  pautasInScope,
  pautasInMonth,
} from '../../utils/audiovisual'
import AvCalendar from './AvCalendar'
import AvPhaseTable from './AvPhaseTable'
import AvAnalytics from './AvAnalytics'
import PautaDetailCard from './PautaDetailCard'
import WhatsAppAgendaModal from './WhatsAppAgendaModal'

const ALL_LINES = '__all__'

function currentYearMonth() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Sub-sección Audiovisual de Tareas Fijas: calendario de pautas + flujo de aprobación
 * (solicitada → programada → realizada/declinada) + analítica de piezas. Se monta desde
 * TareasFijasPage con `lines`/`clients` ya cargadas por la página (mismo roster que la
 * sub-sección Redes-Diseño); gestiona su propio estado de pautas + empleados + realtime,
 * igual que ReunionesPage.
 */
export default function AudiovisualView({ companyId, userProfile, can, lines, clients }) {
  const canManage = can('audiovisual.manage')
  const canCoordinate = can('audiovisual.coordina')
  const editMode = avEditMode({ canCoordinate, canManage })
  // "Ver todo" (todas las líneas) es una capability aparte de "coordina" (agendar/
  // declinar/marcar realizada): antes cualquier coordinador del depto Audiovisual veía
  // todas las líneas; ahora eso queda acotado a dirección (nivel≥4), admin, o quien
  // tenga explícitamente audiovisual.ver_todo (configurable en Empresa → Permisos —
  // sembrado por defecto solo para Lizdania). Sin línea propia, `pautasInScope`/
  // `scopedClients` igual muestran todo (comportamiento existente, sin cambios).
  const canViewAll =
    userProfile?.access_level >= 4 || userProfile?.admin === true || can('audiovisual.ver_todo')

  const [{ year, month }, setPeriod] = useState(currentYearMonth)
  const [pautas, setPautas] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  // Solo relevante cuando canViewAll (badges "Todos"/línea): sin ese permiso, el alcance queda
  // SIEMPRE derivado de `lines` (la única línea visible de la jefa) — nunca en estado, para
  // que no pueda quedar "atascado" en ALL_LINES si `lines` llega vacío en el primer render
  // (p. ej. mientras la página aún está cargando) y termine mostrando pautas de otras líneas.
  const [scopeLineId, setScopeLineId] = useState(ALL_LINES)
  const [detailPauta, setDetailPauta] = useState(null)
  const [waOpen, setWaOpen] = useState(false)
  // Pestaña activa de AvPhaseTable, levantada aquí (en vez de vivir dentro de
  // AvPhaseTable) porque `onPhaseChange` la necesita tras crear/guardar una solicitud
  // (salta a la pestaña Solicitudes). Independiente del filtro del calendario: cambiar de
  // pestaña en la tabla ya NO afecta lo que se ve en el calendario — ver `calendarFilter`.
  const [phase, setPhase] = useState('solicitudes')
  // Filtro del calendario, controlado únicamente por los SummaryCard de arriba
  // (Todas/Agendadas/Realizadas) — deliberadamente independiente de `phase`.
  const [calendarFilter, setCalendarFilter] = useState('todas')

  const defaultLineId = !canViewAll ? (lines[0]?.id ?? null) : null
  const scopeLine = canViewAll ? (scopeLineId === ALL_LINES ? null : scopeLineId) : defaultLineId

  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [pautasRes, employeesRes] = await Promise.all([
      loadPautas(companyId),
      loadCompanyEmployees(companyId),
    ])
    setPautas(pautasRes.data ?? [])
    setEmployees(employeesRes.data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Realtime: canal creado sincrónicamente (evita el race de StrictMode), patrón
  // AppLayout/ReunionesPage/TareasFijasPage.
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

  function handleChanged(pauta) {
    setPautas((prev) => {
      const exists = prev.some((p) => p.id === pauta.id)
      return exists ? prev.map((p) => (p.id === pauta.id ? pauta : p)) : [...prev, pauta]
    })
    setDetailPauta((prev) => (prev && prev.id === pauta.id ? pauta : prev))
  }

  function handleDeleted(id) {
    setPautas((prev) => prev.filter((p) => p.id !== id))
  }

  const scopedPautas = pautasInScope(pautas, scopeLine)
  const scopedClients = clients.filter((c) => !scopeLine || c.line_id === scopeLine)
  const audiovisualUsers = employees.filter((u) => u.department_id === 2 && !u.deleted_at)
  const usersById = new Map(employees.map((u) => [u.user_id, u]))
  // Tabla de seguimiento + recuadros de resumen + analítica siguen al mes que se está
  // viendo en el calendario (pautas sin fecha se mantienen visibles siempre, ver
  // pautasInMonth). El calendario mismo (AvCalendar) recibe `scopedPautas` sin este
  // filtro: ya arma su propia grilla acotada al mes/año, incluyendo los días de relleno
  // de semanas adyacentes.
  const monthPautas = pautasInMonth(scopedPautas, year, month)

  const { deadline } = nextAgendaDeadline()
  // "Agendadas" = pautas con status 'programada' (con o sin fecha) — mismo número que la
  // pestaña "Agenda" de AvPhaseTable.
  const agendadasCount = monthPautas.filter((p) => p.status === 'programada').length
  const realizadasCount = monthPautas.filter((p) => p.status === 'realizada').length
  const calendarStatusFilter =
    calendarFilter === 'agendadas'
      ? 'programada'
      : calendarFilter === 'realizadas'
        ? 'realizada'
        : null

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

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {!canViewAll ? (
          <span className="px-3 py-1 rounded-full text-[14.5px] font-semibold bg-[#FFB800] text-[#111]">
            {lines[0]?.name ?? 'Sin línea'}
          </span>
        ) : (
          <>
            <button
              onClick={() => setScopeLineId(ALL_LINES)}
              className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                scopeLineId === ALL_LINES
                  ? 'bg-[#FFB800] text-[#111]'
                  : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
              }`}
            >
              Todos
            </button>
            {lines.map((l) => (
              <button
                key={l.id}
                onClick={() => setScopeLineId(l.id)}
                className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                  scopeLineId === l.id
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                }`}
              >
                {l.name}
              </button>
            ))}
          </>
        )}
        <button
          onClick={() => setWaOpen(true)}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#111] bg-[#25D366]/15 border border-[#25D366]/40 px-3 py-1.5 rounded-lg hover:bg-[#25D366]/25 transition-colors ml-auto"
        >
          Generar agenda WhatsApp
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SummaryCard
          label="Todas"
          value={agendadasCount + realizadasCount}
          color="text-[#9a7400]"
          active={calendarFilter === 'todas'}
          onClick={() => setCalendarFilter('todas')}
        />
        <SummaryCard
          label="Agendadas"
          value={agendadasCount}
          color="text-[#3b6fd4]"
          active={calendarFilter === 'agendadas'}
          onClick={() => setCalendarFilter('agendadas')}
        />
        <SummaryCard
          label="Realizadas"
          value={realizadasCount}
          color="text-[#1f8a43]"
          active={calendarFilter === 'realizadas'}
          onClick={() => setCalendarFilter('realizadas')}
        />
      </div>

      <AvCalendar
        year={year}
        month={month}
        pautas={scopedPautas}
        statusFilter={calendarStatusFilter}
        onMonthChange={(y, m) => setPeriod({ year: y, month: m })}
        onDayClick={async (date) => {
          // Solo la coordinadora crea directo desde el calendario (pauta ya 'programada',
          // por eso sí aparece ahí). El rol "solicita" arma su borrador con "+ Solicitar
          // pauta" en la tabla — una solicitud nunca se ve en el calendario de todos modos
          // (AvCalendar solo pinta 'programada'/'realizada'), así que el clic en un día no
          // hace nada para ese rol, en vez de escribir en la base de datos sin necesidad.
          if (editMode !== 'coordina') return
          const pad = (n) => String(n).padStart(2, '0')
          const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
          const { data, error } = await createPauta(
            companyId,
            { status: 'programada', pauta_date: dateStr },
            userProfile?.user_id,
            defaultLineId,
          )
          if (!error && data) handleChanged(data)
        }}
        onPautaClick={setDetailPauta}
      />

      <div className="mt-4">
        <AvPhaseTable
          pautas={monthPautas}
          clients={scopedClients}
          audiovisualUsers={audiovisualUsers}
          allEmployees={employees.filter((u) => !u.deleted_at)}
          companyId={companyId}
          userId={userProfile?.user_id}
          defaultLineId={defaultLineId}
          editMode={editMode}
          phase={phase}
          onPhaseChange={setPhase}
          onChanged={handleChanged}
          onDeleted={handleDeleted}
        />
      </div>

      <AvAnalytics pautas={monthPautas} lines={lines} usersById={usersById} />

      {detailPauta && (
        <PautaDetailCard
          pauta={detailPauta}
          usersById={usersById}
          onClose={() => setDetailPauta(null)}
        />
      )}

      {waOpen && (
        <WhatsAppAgendaModal
          pautas={scopedPautas}
          lines={lines}
          usersById={usersById}
          onClose={() => setWaOpen(false)}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filtrar por ${label}`}
      className={`text-left bg-white border rounded-xl px-4 py-3 min-w-[130px] transition-colors ${
        active
          ? 'border-[#FFB800] ring-1 ring-[#FFB800]/40'
          : 'border-[#e0ddd4] hover:border-[#d8d4c6]'
      }`}
    >
      <div className={`text-[22px] font-semibold ${color}`}>{value}</div>
      <div className="text-[11.5px] text-[#999] font-mono uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </button>
  )
}
