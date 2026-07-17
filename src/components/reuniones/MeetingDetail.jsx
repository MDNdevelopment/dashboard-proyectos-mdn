import { useState } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { markMeetingHeld, unmarkMeetingHeld, cancelMeeting, updateMeeting, deleteMeeting } from "./meetingsApi";

const STATUS_META = {
  programada: { label: "Programada", className: "bg-blue-50 text-blue-700" },
  realizada: { label: "Realizada", className: "bg-green-100 text-green-800" },
  cancelada: { label: "Cancelada", className: "bg-[#f3f3f3] text-[#999]" },
};

function fullName(u) {
  return `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim();
}
function initials(u) {
  return `${u?.first_name?.[0] ?? ""}${u?.last_name?.[0] ?? ""}`.toUpperCase();
}

/**
 * Vista de solo lectura de una reunión — se abre al hacer click en el calendario, antes de
 * entrar a edición (mismo patrón que AdsDetail.jsx → AdsForm.jsx). Muestra toda la info y,
 * si `canManage`, las acciones de estado (marcar realizada, reagendar, cancelar) más
 * Editar/Eliminar. El formulario de edición (MeetingModal) queda solo con los campos.
 */
export default function MeetingDetail({ meeting, employees, onClose, onSaved, onDeleted, onEdit, canManage }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reschedulePanelOpen, setReschedulePanelOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(() => toLocalInputValue(meeting.starts_at));
  const [minutaPanelOpen, setMinutaPanelOpen] = useState(false);
  const [minutaUrl, setMinutaUrl] = useState(meeting.minuta_url ?? "");

  const isPast = isBefore(startOfDay(new Date(meeting.starts_at)), startOfDay(new Date()));
  const isOverdueUnmarked = meeting.status === "programada" && isPast;
  const statusMeta = isOverdueUnmarked
    ? { label: "Vencida sin marcar", className: "bg-red-100 text-red-700" }
    : STATUS_META[meeting.status] ?? STATUS_META.programada;

  const attendees = employees.filter((u) => (meeting.attendee_ids ?? []).includes(u.user_id));
  const creator = employees.find((u) => u.user_id === meeting.created_by);

  /** Desmarcar es directo (sin pedir nada). */
  async function handleUnmarkHeld() {
    if (submitting) return;
    setSubmitting(true);
    const { data, error: err } = await unmarkMeetingHeld(meeting.id);
    setSubmitting(false);
    if (err) { setError("Error al actualizar el estado de la reunión."); return; }
    onSaved(data);
  }

  /** Marcar como realizada es inmediato (un solo click, sin esperar ningún link) — el
   * panel de minuta se abre después, ya marcada, como algo opcional que se puede completar
   * ahí mismo o más tarde. El link nunca bloquea el marcado. */
  async function handleMarkHeld() {
    if (submitting) return;
    setSubmitting(true);
    const { data, error: err } = await markMeetingHeld(meeting.id);
    setSubmitting(false);
    if (err) { setError("Error al actualizar el estado de la reunión."); return; }
    setMinutaPanelOpen(true);
    onSaved(data);
  }

  /** Guarda/edita el link de la minuta de una reunión ya marcada como realizada. */
  async function handleConfirmMinuta() {
    if (submitting) return;
    setSubmitting(true);
    const { data, error: err } = await updateMeeting(meeting.id, { minuta_url: minutaUrl });
    setSubmitting(false);
    if (err) { setError("Error al guardar el link de la minuta."); return; }
    setMinutaPanelOpen(false);
    onSaved(data);
  }

  async function handleReschedule() {
    if (!rescheduleDate || submitting) return;
    setSubmitting(true);
    const { data, error: err } = await updateMeeting(meeting.id, {
      starts_at: new Date(rescheduleDate).toISOString(),
      status: "programada",
    });
    setSubmitting(false);
    if (err) { setError("Error al reagendar la reunión."); return; }
    setReschedulePanelOpen(false);
    onSaved(data);
  }

  async function handleCancel() {
    if (submitting) return;
    setSubmitting(true);
    const { data, error: err } = await cancelMeeting(meeting.id);
    setSubmitting(false);
    if (err) { setError("Error al cancelar la reunión."); return; }
    onSaved(data);
  }

  async function handleDelete() {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setSubmitting(true);
    const { error: err } = await deleteMeeting(meeting.id);
    setSubmitting(false);
    if (err) { setError("Error al eliminar la reunión."); return; }
    onDeleted(meeting.id);
    onClose();
  }

  const labelClass = "font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-[#ece9df] flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-[19px] font-bold text-[#111] leading-snug mb-2">{meeting.title}</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold ${statusMeta.className}`}>
              {statusMeta.label}
            </span>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[14px]">
            <div>
              <p className={labelClass}>Cliente</p>
              <p className="text-[#333] font-medium">{meeting.client_name ?? "Sin cliente"}</p>
            </div>
            <div>
              <p className={labelClass}>Fecha y hora</p>
              <p className="text-[#333] font-medium capitalize">
                {format(new Date(meeting.starts_at), "EEEE d 'de' MMMM, HH:mm", { locale: es })}
              </p>
            </div>
            <div>
              <p className={labelClass}>Modalidad</p>
              <p className="text-[#333]">{meeting.modality === "videollamada" ? "Videollamada" : "Presencial"}</p>
            </div>
            <div>
              <p className={labelClass}>{meeting.modality === "videollamada" ? "Link" : "Lugar"}</p>
              {meeting.modality === "videollamada" && meeting.meeting_url ? (
                <a href={meeting.meeting_url} target="_blank" rel="noreferrer" className="text-[#111] underline break-all">
                  {meeting.meeting_url}
                </a>
              ) : (
                <p className="text-[#333]">{meeting.modality === "videollamada" ? meeting.meeting_url || "—" : meeting.location || "—"}</p>
              )}
            </div>
          </div>

          <div className="mb-4">
            <p className={`${labelClass} mb-1.5`}>Participantes</p>
            {attendees.length === 0 ? (
              <p className="text-[14px] text-[#999]">Sin participantes</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {attendees.map((u) => (
                  <div key={u.user_id} className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-[#faf9f5] border border-[#ece9df]">
                    <span aria-hidden="true" className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 overflow-hidden bg-[#eee]">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[#888]">{initials(u)}</span>
                      )}
                    </span>
                    <span className="text-[13px] font-medium text-[#333]">{fullName(u)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {meeting.status === "realizada" && (
            <div className="mb-4">
              <p className={`${labelClass} mb-1.5`}>Minuta</p>
              <div className="flex items-center gap-2 flex-wrap">
                {meeting.minuta_url ? (
                  <a href={meeting.minuta_url} target="_blank" rel="noreferrer" className="text-[14px] text-[#111] underline break-all">
                    {meeting.minuta_url}
                  </a>
                ) : (
                  <p className="text-[14px] text-[#999]">Sin minuta</p>
                )}
                {canManage && !minutaPanelOpen && (
                  <button
                    type="button"
                    onClick={() => setMinutaPanelOpen(true)}
                    className="text-[12px] font-semibold text-[#888] hover:text-[#111] transition-colors"
                  >
                    {meeting.minuta_url ? "Editar link" : "Agregar link"}
                  </button>
                )}
              </div>
            </div>
          )}

          {meeting.notes && (
            <div className="mb-4">
              <p className={`${labelClass} mb-1.5`}>Notas</p>
              <p className="text-[15px] text-[#444] whitespace-pre-wrap leading-relaxed bg-[#f5f3eb] rounded-xl p-3">
                {meeting.notes}
              </p>
            </div>
          )}

          {creator && (
            <p className="text-[12px] text-[#999] mb-4">Creada por {fullName(creator)}</p>
          )}

          {canManage && (
            <>
              {/* Acciones rápidas de estado */}
              <div className="flex items-center justify-center flex-wrap gap-1.5 mt-2 mb-4">
                {meeting.status !== "cancelada" && (
                  <ActionIcon
                    onClick={meeting.status === "realizada" ? handleUnmarkHeld : handleMarkHeld}
                    disabled={submitting}
                    label={meeting.status === "realizada" ? "Desmarcar realizada" : "Marcar realizada"}
                    colorClass="text-green-700 hover:bg-green-50"
                  >
                    <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </ActionIcon>
                )}
                <ActionIcon
                  onClick={() => setReschedulePanelOpen((o) => !o)}
                  disabled={submitting}
                  label="Reagendar"
                  colorClass="text-[#b45309] hover:bg-[#fef3c7]"
                >
                  <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
                  <path d="M1.5 6h13" strokeLinecap="round" />
                  <path d="M5 1v3M11 1v3" strokeLinecap="round" />
                </ActionIcon>
                {meeting.status !== "cancelada" && (
                  <ActionIcon
                    onClick={handleCancel}
                    disabled={submitting}
                    label="Cancelar reunión"
                    colorClass="text-[#666] hover:bg-[#f5f3eb]"
                  >
                    <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
                  </ActionIcon>
                )}
              </div>

              {reschedulePanelOpen && (
                <div className="flex items-end gap-2 mb-4 bg-[#fdf8ec] border border-[#f0e3b8] rounded-xl p-3">
                  <div className="flex-1">
                    <label htmlFor="reschedule-date" className={labelClass}>Nueva fecha y hora</label>
                    <input
                      id="reschedule-date"
                      type="datetime-local"
                      className="input-base w-full"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleReschedule}
                    disabled={!rescheduleDate || submitting}
                    className="bg-[#111] text-white text-[14px] font-bold px-3.5 py-2.5 rounded-xl hover:bg-[#222] transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    Confirmar
                  </button>
                </div>
              )}

              {minutaPanelOpen && (
                <div className="flex items-end gap-2 mb-4 bg-green-50 border border-green-200 rounded-xl p-3">
                  <div className="flex-1">
                    <label htmlFor="minuta-url" className={labelClass}>Link de la minuta (Google Drive)</label>
                    <input
                      id="minuta-url"
                      type="url"
                      placeholder="https://drive.google.com/…"
                      className="input-base w-full"
                      value={minutaUrl}
                      onChange={(e) => setMinutaUrl(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmMinuta}
                    disabled={submitting}
                    className="bg-[#111] text-white text-[14px] font-bold px-3.5 py-2.5 rounded-xl hover:bg-[#222] transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    Confirmar
                  </button>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onEdit(meeting)}
                  className="flex-1 py-2.5 rounded-xl bg-[#FFB800] text-[#111] text-[15px] font-bold hover:bg-[#e6a600] transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={submitting}
                  className={`flex-1 py-2.5 rounded-xl text-[15px] font-bold transition-colors disabled:opacity-50 ${
                    confirmingDelete
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "border border-[#e0ddd4] text-[#555] hover:bg-[#f5f3eb]"
                  }`}
                >
                  {submitting ? "Eliminando..." : confirmingDelete ? "¿Confirmar?" : "Eliminar"}
                </button>
                {confirmingDelete && (
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="px-4 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
                  >
                    No
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Botón de acción con ícono SVG de trazo fino + label visible (consistente con el resto
 * de la app — no emoji, y no solo ícono con tooltip: el texto queda a la vista). */
function ActionIcon({ onClick, disabled, label, colorClass, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40 ${colorClass}`}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-shrink-0">
        {children}
      </svg>
      {label}
    </button>
  );
}

/** Convierte un ISO string a formato local "YYYY-MM-DDTHH:mm" para el input datetime-local. */
function toLocalInputValue(value) {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
