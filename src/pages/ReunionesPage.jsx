import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import { loadClients, loadCompanyEmployees } from "../components/metricas/metricsApi";
import CalendarView from "../components/reuniones/CalendarView";
import MeetingModal from "../components/reuniones/MeetingModal";
import MeetingDetail from "../components/reuniones/MeetingDetail";
import { unmarkMeetingHeld } from "../components/reuniones/meetingsApi";

export default function ReunionesPage() {
  const { userProfile, can = () => true } = useAuth();
  const companyId = userProfile?.company_id;
  const canManage = can("reuniones.manage");
  const [searchParams, setSearchParams] = useSearchParams();

  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  // Filtros del calendario: estado (activado por las cards, toggle de selección única),
  // modalidad y alcance ("solo las mías"). Ninguno dispara un nuevo fetch — todos filtran
  // client-side sobre `meetings`, ya cargadas completas por el realtime de abajo.
  const [statusFilter, setStatusFilter] = useState("todas"); // 'todas' | 'programada' | 'realizada' | 'cancelada'
  const [modalityFilter, setModalityFilter] = useState("todas"); // 'todas' | 'presencial' | 'videollamada'
  const [onlyMine, setOnlyMine] = useState(false);
  // Convención del proyecto: undefined = cerrado, null = crear, objeto = editar.
  const [modalMeeting, setModalMeeting] = useState(undefined);
  const [modalDefaultDate, setModalDefaultDate] = useState(null);
  // Vista de solo lectura (undefined = cerrada, objeto = viendo) — se abre al hacer click
  // en una reunión, antes de entrar a edición (mismo patrón que AdsDetail → AdsForm).
  const [viewMeeting, setViewMeeting] = useState(undefined);

  // Realtime: canal creado sincrónicamente para que el cleanup siempre tenga referencia
  // (evita el race condition de StrictMode), mismo patrón que AppLayout.jsx (Proyectos).
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel("meetings-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, (payload) => {
        setMeetings((prev) => {
          if (payload.eventType === "INSERT") {
            if (payload.new.company_id !== companyId) return prev;
            return prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new];
          }
          if (payload.eventType === "UPDATE") return prev.map((m) => (m.id === payload.new.id ? payload.new : m));
          if (payload.eventType === "DELETE") return prev.filter((m) => m.id !== payload.old.id);
          return prev;
        });
      })
      .subscribe();

    supabase
      .from("meetings")
      .select("*")
      .eq("company_id", companyId)
      .order("starts_at")
      .then(({ data, error }) => {
        if (!error) setMeetings(data ?? []);
        setLoading(false);
      });

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    loadClients(companyId).then(({ data }) => setClients(data ?? []));
    loadCompanyEmployees(companyId).then(({ data }) => setEmployees(data ?? []));
  }, [companyId]);

  // Abrir el detalle de una reunión específica desde ?meetingId=uuid (deeplink desde la
  // campanita de notificaciones — mismo patrón que ?projectId= en AppLayout.jsx).
  useEffect(() => {
    const meetingId = searchParams.get("meetingId");
    if (!meetingId || meetings.length === 0) return;
    const meeting = meetings.find((m) => m.id === meetingId);
    if (meeting) setViewMeeting(meeting);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("meetingId");
      return next;
    }, { replace: true });
  }, [searchParams, meetings]);

  function handleDayClick(date) {
    if (!canManage) return;
    setModalDefaultDate(date);
    setModalMeeting(null);
  }

  // Ver una reunión es universal (cualquier autenticado) — solo editar/gestionar sigue
  // restringido a reuniones.manage (gateado dentro de MeetingDetail vía `canManage`).
  function handleMeetingClick(meeting) {
    setViewMeeting(meeting);
  }

  function handleEditFromDetail(meeting) {
    setViewMeeting(undefined);
    setModalDefaultDate(null);
    setModalMeeting(meeting);
  }

  function handleSaved(meeting) {
    setMeetings((prev) => {
      const exists = prev.some((m) => m.id === meeting.id);
      return exists ? prev.map((m) => (m.id === meeting.id ? meeting : m)) : [...prev, meeting];
    });
    // Si la reunión que se está viendo cambió (p. ej. se marcó realizada desde el detalle),
    // refrescar el objeto en pantalla para que el estado se vea actualizado sin cerrar.
    setViewMeeting((prev) => (prev && prev.id === meeting.id ? meeting : prev));
  }

  function handleDeleted(id) {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  /**
   * Click rápido en el check de una pill "realizada" — sin abrir el modal. Solo desmarca:
   * marcar como realizada siempre pasa por MeetingDetail, donde se puede agregar el link
   * de la minuta.
   */
  async function handleToggleHeld(meeting) {
    if (!canManage || meeting.status !== "realizada") return;
    const { data, error } = await unmarkMeetingHeld(meeting.id);
    if (!error && data) handleSaved(data);
  }

  /** Click en una card de resumen: selección única con toggle — click en la ya activa la desactiva. */
  function handleStatusCardClick(status) {
    setStatusFilter((prev) => (prev === status ? "todas" : status));
  }

  // Reuniones del mes que se está viendo en el calendario — solo para los 3 conteos de las
  // cards. A propósito NO se filtran por modalidad/alcance (decisión: las cards siempre
  // cuentan todo el mes, sin importar los otros filtros activos).
  const monthMeetings = meetings.filter((m) => {
    const d = new Date(m.starts_at);
    return d.getFullYear() === period.year && d.getMonth() + 1 === period.month;
  });
  const scheduledCount = monthMeetings.filter((m) => m.status === "programada").length;
  const heldCount = monthMeetings.filter((m) => m.status === "realizada").length;
  const cancelledCount = monthMeetings.filter((m) => m.status === "cancelada").length;

  // Reuniones que se le pasan al calendario: TODAS (cualquier mes, igual que hoy — para no
  // romper los días de desborde del grid), filtradas por estado/modalidad/alcance.
  const calendarMeetings = meetings
    .filter((m) => statusFilter === "todas" || m.status === statusFilter)
    .filter((m) => modalityFilter === "todas" || m.modality === modalityFilter)
    .filter((m) => !onlyMine || (m.attendee_ids ?? []).includes(userProfile?.user_id));

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Reuniones</h1>
            <p className="text-[15px] text-[#888] mt-0.5">
              {canManage ? "Calendario de reuniones con clientes y empleados" : "Calendario de reuniones"}
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => { setModalDefaultDate(new Date()); setModalMeeting(null); }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.8">
                <path d="M6 1v10M1 6h10" strokeLinecap="round" />
              </svg>
              Nueva reunión
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-[15px] text-[#888]">Cargando…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatusSummaryCard
                label="Pautadas"
                value={scheduledCount}
                active={statusFilter === "programada"}
                onClick={() => handleStatusCardClick("programada")}
              />
              <StatusSummaryCard
                label="Completadas"
                value={heldCount}
                active={statusFilter === "realizada"}
                onClick={() => handleStatusCardClick("realizada")}
              />
              <StatusSummaryCard
                label="Canceladas"
                value={cancelledCount}
                active={statusFilter === "cancelada"}
                onClick={() => handleStatusCardClick("cancelada")}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
              <select
                aria-label="Filtrar por modalidad"
                value={modalityFilter}
                onChange={(e) => setModalityFilter(e.target.value)}
                className="input-base !text-[13px] sm:!text-[14.5px] px-2 sm:px-3 py-2"
              >
                <option value="todas">Modalidad: todas</option>
                <option value="presencial">Presencial</option>
                <option value="videollamada">Videollamada</option>
              </select>
              <select
                aria-label="Filtrar por alcance"
                value={onlyMine ? "mias" : "todas"}
                onChange={(e) => setOnlyMine(e.target.value === "mias")}
                className="input-base !text-[13px] sm:!text-[14.5px] px-2 sm:px-3 py-2"
              >
                <option value="todas">Reuniones: todas</option>
                <option value="mias">Solo las mías</option>
              </select>
            </div>

            <CalendarView
              year={period.year}
              month={period.month}
              meetings={calendarMeetings}
              currentUserId={userProfile?.user_id}
              onMonthChange={(year, month) => setPeriod({ year, month })}
              onDayClick={handleDayClick}
              onMeetingClick={handleMeetingClick}
              onToggleHeld={handleToggleHeld}
            />
          </>
        )}
      </div>

      {modalMeeting !== undefined && (
        <MeetingModal
          meeting={modalMeeting}
          defaultDate={modalDefaultDate}
          clients={clients}
          employees={employees}
          onClose={() => setModalMeeting(undefined)}
          onSaved={handleSaved}
        />
      )}

      {viewMeeting !== undefined && (
        <MeetingDetail
          meeting={viewMeeting}
          employees={employees}
          canManage={canManage}
          onClose={() => setViewMeeting(undefined)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onEdit={handleEditFromDetail}
        />
      )}
    </main>
  );
}

/**
 * Card de resumen clickeable — mismo lenguaje visual que `KpiCard` (label mono uppercase +
 * valor grande), pero como <button> con estado `active` en vez de <Link> (KpiCard solo
 * soporta navegación con `to`). Un click activa/desactiva el filtro de estado del calendario.
 */
function StatusSummaryCard({ label, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white border rounded-2xl p-3 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.14)] ${
        active ? "border-[#111] ring-1 ring-[#111]" : "border-[#e0ddd4]"
      }`}
    >
      <p className="text-[11px] sm:text-[13px] font-mono font-bold tracking-[0.08em] sm:tracking-[0.14em] uppercase text-[#888] mb-2 sm:mb-3">{label}</p>
      <p className="text-[24px] sm:text-[30px] font-bold leading-none tracking-tight text-[#111]">{value}</p>
    </button>
  );
}
