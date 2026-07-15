import { useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, isToday, addMonths, subMonths, isBefore, startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Grid mensual construido a mano con date-fns (no hay librería de calendario en el
 * proyecto). En desktop (≥ sm) cada día muestra hasta 3 pills de sus reuniones (el resto
 * vía "+N más" → `DayMeetingsList`, ver abajo); en móvil (< sm), donde 7 columnas no dan
 * espacio para texto legible, cada día muestra puntos de color en su lugar (ver
 * `dotColor`). Click en el día vacío crea una reunión con esa fecha precargada. En
 * desktop, click en el resto de la celda también crea (las pills tienen su propio click
 * para ver detalle); en móvil, click en un día CON reuniones abre `DayMeetingsList` en vez
 * de crear (ver `handleCellClick`). Click en una pill, en el grid desktop o dentro de esa
 * lista, abre el detalle de solo lectura de esa reunión (`onMeetingClick` — el padre
 * decide si es vista o edición).
 */
export default function CalendarView({ year, month, meetings, currentUserId, onMonthChange, onDayClick, onMeetingClick, onToggleHeld }) {
  const [expandedDay, setExpandedDay] = useState(null); // Date | null — día cuya lista completa está abierta
  const anchor = new Date(year, month - 1, 1);
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const meetingsByDay = new Map();
  for (const m of meetings) {
    const key = format(new Date(m.starts_at), "yyyy-MM-dd");
    if (!meetingsByDay.has(key)) meetingsByDay.set(key, []);
    meetingsByDay.get(key).push(m);
  }

  function goPrev() {
    const d = subMonths(anchor, 1);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  }
  function goNext() {
    const d = addMonths(anchor, 1);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  }
  function goToday() {
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth() + 1);
  }

  /**
   * Click en una celda del día. En desktop el comportamiento no cambia: siempre crea una
   * reunión con esa fecha (las pills tienen su propio click para ver detalle). En móvil,
   * donde la celda solo muestra puntos (sin pills clickeables), tocar un día CON reuniones
   * abre la lista completa en vez de crear una nueva — un día vacío sigue creando. Se
   * resuelve con un chequeo de ancho al momento del click (no un listener de resize/estado)
   * para no duplicar la celda en dos árboles JSX separados.
   */
  function handleCellClick(day, dayMeetings) {
    const isMobile = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 639px)").matches;
    if (isMobile && dayMeetings.length > 0) {
      setExpandedDay(day);
    } else {
      onDayClick(day);
    }
  }

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden">
      {/* Header: navegación de mes */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ece9df]">
        <h2 className="text-[17px] font-bold text-[#111] capitalize">
          {format(anchor, "MMMM yyyy", { locale: es })}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={goPrev} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#666] hover:bg-[#f5f3eb] transition-colors" aria-label="Mes anterior">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2 3 6l5 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[#444] hover:bg-[#f5f3eb] transition-colors">
            Hoy
          </button>
          <button onClick={goNext} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#666] hover:bg-[#f5f3eb] transition-colors" aria-label="Mes siguiente">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 2l5 4-5 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-[#ece9df]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#999] text-center py-2">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayMeetings = meetingsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, anchor);
          return (
            <div
              key={key}
              onClick={() => handleCellClick(day, dayMeetings)}
              className={`min-h-[64px] sm:min-h-[92px] border-b border-r border-[#ece9df] p-1.5 cursor-pointer transition-colors hover:bg-[#f5f3eb]/60 ${
                inMonth ? "" : "bg-[#fafaf7]"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[13px] font-semibold ${
                  isToday(day) ? "bg-[#FFB800] text-[#111]" : inMonth ? "text-[#333]" : "text-[#bbb]"
                }`}
              >
                {format(day, "d")}
              </span>

              {/* Móvil (< sm): puntos de color, uno por reunión — el detalle se ve al
                  tocar el día, que abre DayMeetingsList (ver onClick de la celda). */}
              {dayMeetings.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                  {dayMeetings.slice(0, 4).map((m) => (
                    <span key={m.id} className={`w-1.5 h-1.5 rounded-full ${dotColor(m)}`} title={m.client_name ?? m.title} />
                  ))}
                  {dayMeetings.length > 4 && (
                    <span className="text-[10px] leading-none font-semibold text-[#888]">+{dayMeetings.length - 4}</span>
                  )}
                </div>
              )}

              {/* Desktop (≥ sm): pills completas, comportamiento sin cambios. */}
              <div className="mt-1 space-y-0.5 hidden sm:block">
                {dayMeetings.slice(0, 3).map((m) => (
                  <MeetingPill key={m.id} meeting={m} currentUserId={currentUserId} onMeetingClick={onMeetingClick} onToggleHeld={onToggleHeld} />
                ))}
                {dayMeetings.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpandedDay(day); }}
                    className="w-full flex items-center gap-1 text-left text-[11px] font-semibold text-[#888] hover:text-[#111] px-1.5 transition-colors"
                  >
                    +{dayMeetings.length - 3} más
                    {dayMeetings.slice(3).some((m) => (m.attendee_ids ?? []).includes(currentUserId)) && (
                      <PersonIcon className="flex-shrink-0" width={9} height={9} />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {expandedDay && (
        <DayMeetingsList
          day={expandedDay}
          meetings={meetingsByDay.get(format(expandedDay, "yyyy-MM-dd")) ?? []}
          currentUserId={currentUserId}
          onClose={() => setExpandedDay(null)}
          onMeetingClick={(m) => { setExpandedDay(null); onMeetingClick(m); }}
          onToggleHeld={onToggleHeld}
        />
      )}
    </div>
  );
}

/** Color del punto de estado en la vista compacta de móvil — misma lógica de estado que
 * `MeetingPill` (programada/realizada/cancelada/vencida-sin-marcar), resumida a un color. */
function dotColor(m) {
  const isPast = isBefore(startOfDay(new Date(m.starts_at)), startOfDay(new Date()));
  if (m.status === "cancelada") return "bg-[#bbb]";
  if (m.status === "realizada") return "bg-green-600";
  if (m.status === "programada" && isPast) return "bg-red-500";
  return "bg-blue-500";
}

/** Lista completa de reuniones de un día — abierta desde "+N más" cuando no caben en la
 * celda del grid. Reusa MeetingPill (sin truncar) para mantener el mismo lenguaje visual. */
function DayMeetingsList({ day, meetings, currentUserId, onClose, onMeetingClick, onToggleHeld }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-[#ece9df] flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#111] capitalize">
            {format(day, "EEEE d 'de' MMMM", { locale: es })}
          </h3>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-3 py-3 overflow-y-auto flex-1 space-y-1.5">
          {meetings.map((m) => (
            <MeetingPill key={m.id} meeting={m} currentUserId={currentUserId} onMeetingClick={onMeetingClick} onToggleHeld={onToggleHeld} truncateTitle={false} size="lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Pill de una reunión dentro de un día. 4 estados visuales:
 *   - programada (futura): azul, sin ícono — click abre el modal.
 *   - realizada: check verde, texto normal (no tachado) — click en el check desmarca sin
 *     abrir modal.
 *   - cancelada: X gris + texto tachado — no se puede togglear desde el calendario.
 *   - programada + vencida (nadie la marcó): alerta roja (triángulo, solo decorativo) —
 *     click en cualquier parte de la pill abre el modal, donde se marca realizada y se
 *     puede agregar el link de la minuta (no se marca directo desde el calendario).
 * Los íconos son SVG de trazo fino (consistentes con el resto de la app, no emoji/unicode).
 * El ícono de "realizada" es un <button> interno con stopPropagation (desmarca sin pedir
 * nada); el resto de la pill (el texto, y el triángulo de vencida) abre el detalle de la
 * reunión. `truncateTitle=false` se usa en la lista
 * completa del día (DayMeetingsList) para no cortar el título. `size="lg"` la agranda bastante
 * (misma lista) para que se lea cómoda como fila de lista, en vez de pill compacta de grid.
 */
function MeetingPill({ meeting: m, currentUserId, onMeetingClick, onToggleHeld, truncateTitle = true, size = "sm" }) {
  // Vencida = su DÍA ya pasó, no su hora exacta — una reunión de hoy no debe verse en
  // alerta solo porque su horario ya sonó; se vuelve "vencida" recién al día siguiente.
  const isPast = isBefore(startOfDay(new Date(m.starts_at)), startOfDay(new Date()));
  const isRealizada = m.status === "realizada";
  const isCancelada = m.status === "cancelada";
  const isOverdueUnmarked = m.status === "programada" && isPast;
  const isLarge = size === "lg";
  const involvesMe = (m.attendee_ids ?? []).includes(currentUserId);

  const styleClass = isCancelada
    ? "bg-[#f3f3f3] text-[#999] line-through"
    : isRealizada
      ? "bg-green-50 text-green-800"
      : isOverdueUnmarked
        ? "bg-red-50 text-red-700 border border-red-200"
        : "bg-blue-50 text-blue-700 hover:bg-blue-100";

  const timeLabel = format(new Date(m.starts_at), "HH:mm");
  const displayName = m.client_name ?? m.title;
  const iconSize = isLarge ? 14 : 11;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onMeetingClick(m); }}
      onKeyDown={(e) => { if (e.key === "Enter") onMeetingClick(m); }}
      className={`w-full flex items-center rounded transition-colors cursor-pointer ${
        isLarge ? "gap-2 text-[14px] font-semibold px-3 py-2.5" : "gap-1 text-[11.5px] font-medium px-1.5 py-1"
      } ${styleClass}`}
      title={`${timeLabel} · ${displayName}`}
    >
      {isCancelada && (
        <svg aria-hidden="true" width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" className="flex-shrink-0">
          <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
        </svg>
      )}
      {isRealizada && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleHeld(m); }}
          aria-label={`Desmarcar "${m.title}" como realizada`}
          className="flex-shrink-0 leading-none"
        >
          <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {isOverdueUnmarked && (
        <svg aria-hidden="true" width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-shrink-0">
          <path d="M8 1.5 1 13.5h14L8 1.5z" strokeLinejoin="round" />
          <path d="M8 6v3.5M8 11v.5" strokeLinecap="round" />
        </svg>
      )}
      <span className={`min-w-0 flex-1 ${truncateTitle ? "truncate" : ""}`}>{timeLabel} {displayName}</span>
      {involvesMe && (
        <PersonIcon
          aria-label="Te incluye como participante"
          className="flex-shrink-0 opacity-70"
          width={iconSize}
          height={iconSize}
        />
      )}
    </div>
  );
}

/** Ícono de "me incluye" — indica que el usuario actual está en attendee_ids de la reunión. */
function PersonIcon({ width = 11, height = 11, className = "", ...rest }) {
  return (
    <svg
      aria-hidden={rest["aria-label"] ? undefined : "true"}
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      {...rest}
    >
      <circle cx="8" cy="5" r="2.6" />
      <path d="M3 14c0-2.9 2.2-5.2 5-5.2s5 2.3 5 5.2" strokeLinecap="round" />
    </svg>
  );
}
