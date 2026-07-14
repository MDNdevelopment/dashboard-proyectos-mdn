import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import AttendeePicker from "./AttendeePicker";
import { createMeeting, updateMeeting } from "./meetingsApi";

/**
 * Modal unificado crear/editar — SOLO campos del formulario. Convención del proyecto: el
 * padre decide cuándo montar este componente — `meeting === null` es "crear", un objeto es
 * "editar" (undefined = no se monta). Las acciones de estado (marcar realizada, reagendar,
 * cancelar, eliminar) viven en `MeetingDetail.jsx` (vista de solo lectura, abierta antes de
 * llegar aquí) — mismo patrón que AdsDetail.jsx (acciones) → AdsForm.jsx (solo campos).
 */
export default function MeetingModal({ meeting, defaultDate, clients, employees, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const isEdit = meeting != null;

  const [title, setTitle] = useState(meeting?.title ?? "");
  const [clientId, setClientId] = useState(meeting?.client_id ?? "");
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(meeting?.starts_at ?? defaultDate));
  const [modality, setModality] = useState(meeting?.modality ?? "presencial");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [meetingUrl, setMeetingUrl] = useState(meeting?.meeting_url ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [attendeeIds, setAttendeeIds] = useState(meeting?.attendee_ids ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = title.trim() && startsAt;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const newStartsAt = new Date(startsAt).toISOString();
    const fields = {
      title: title.trim(),
      client_id: clientId || null,
      starts_at: newStartsAt,
      modality,
      location,
      meeting_url: meetingUrl,
      notes,
      attendee_ids: attendeeIds,
    };

    // Reagendar una reunión ya marcada "realizada" la vuelve a dejar pendiente —
    // el marcado manual describe si ESA fecha se cumplió, no la reunión en abstracto.
    // Comparamos por instante (no por string) para no confundir formatos de timestamptz.
    if (isEdit && meeting.status === "realizada" && new Date(newStartsAt).getTime() !== new Date(meeting.starts_at).getTime()) {
      fields.status = "programada";
    }

    const { data, error: err } = isEdit
      ? await updateMeeting(meeting.id, fields)
      : await createMeeting(userProfile?.company_id, fields, userProfile?.user_id);

    setSubmitting(false);
    if (err) {
      setError(isEdit ? "Error al actualizar la reunión." : "Error al crear la reunión.");
      return;
    }
    onSaved(data);
    onClose();
  }

  const labelClass = "block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="px-6 pt-6 pb-5 border-b border-[#ece9df] flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-[#111]">
            {isEdit ? "Editar reunión" : "Nueva reunión"}
          </h2>
          <button type="button" onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>Título</label>
            <input
              type="text"
              autoFocus
              className="input-base w-full"
              placeholder="Asunto de la reunión"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Cliente</label>
              <select
                className="input-base w-full"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Sin cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Fecha y hora</label>
              <input
                type="datetime-local"
                className="input-base w-full"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Modalidad</label>
            <div className="flex gap-1 bg-[#f5f3eb] border border-[#e0ddd4] rounded-xl p-1 w-fit mb-2.5">
              {[
                { key: "presencial", label: "Presencial" },
                { key: "videollamada", label: "Videollamada" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setModality(m.key)}
                  className={`px-3.5 py-1.5 rounded-lg text-[14px] font-semibold transition-colors ${
                    modality === m.key ? "bg-white text-[#111] shadow-sm" : "text-[#777] hover:text-[#111]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {modality === "presencial" ? (
              <input
                type="text"
                className="input-base w-full"
                placeholder="¿Dónde va a ser? (opcional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            ) : (
              <input
                type="url"
                className="input-base w-full"
                placeholder="Link de la reunión (opcional)"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
              />
            )}
          </div>

          <div>
            <label className={labelClass}>Participantes</label>
            <AttendeePicker employees={employees} selectedIds={attendeeIds} onChange={setAttendeeIds} />
          </div>

          <div>
            <label className={labelClass}>Notas (opcional)</label>
            <textarea
              className="input-base w-full resize-none"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#ece9df] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-semibold text-[#666] hover:bg-[#f5f3eb] px-4 py-2.5 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="bg-[#111] text-white text-[15px] font-bold px-5 py-2.5 rounded-xl hover:bg-[#222] transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {isEdit ? "Guardar cambios" : "Crear reunión"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Convierte un ISO string / Date a formato local "YYYY-MM-DDTHH:mm" para el input. */
function toLocalInputValue(value) {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
