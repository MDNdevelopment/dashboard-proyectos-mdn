import { useState } from "react";
import { supabase } from "../../supabase";
import { STATUS, STATUSES, PRIORITY } from "./constants";
import StatusPill from "../common/StatusPill";

export default function AdsDetail({
  campaign,
  usersMap,
  onClose,
  onUpdated,
  onDeleted,
  canManage,
  onEdit,
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const priority = PRIORITY[campaign.priority];

  async function handleStatusChange(nextStatus) {
    const { data, error } = await supabase
      .from("campaigns")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", campaign.id)
      .select()
      .single();
    if (!error && data) onUpdated(data);
  }

  const fmt = (d) =>
    d
      ? new Date(d + "T00:00:00").toLocaleDateString("es-VE", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaign.id);
    setDeleting(false);
    if (!error) {
      onDeleted(campaign.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#ece9df] flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-[19px] font-bold text-[#111] leading-snug mb-2">
              {campaign.name}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill
                value={campaign.status}
                meta={STATUS}
                options={STATUSES}
                editable={canManage}
                onChange={handleStatusChange}
              />
              <span className="flex items-center gap-1.5 text-[13px] font-mono font-semibold text-[#555]">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${priority?.dot}`}
                />
                {campaign.priority}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#999] hover:text-[#111] transition-colors p-1"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[14px]">
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                Cliente
              </p>
              <p className="text-[#333] font-medium">{campaign.client}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                Responsable
              </p>
              <p className="text-[#333] font-medium">
                {usersMap?.get(campaign.assignee) ?? campaign.assignee ?? "—"}
              </p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                Fecha inicio
              </p>
              <p className="text-[#333]">{fmt(campaign.start_date)}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5">
                Fecha fin
              </p>
              <p className="text-[#333]">{fmt(campaign.end_date)}</p>
            </div>
          </div>

          {campaign.notes && (
            <div className="mb-4">
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-1.5">
                Notas
              </p>
              <p className="text-[15px] text-[#444] whitespace-pre-wrap leading-relaxed bg-[#f5f3eb] rounded-xl p-3">
                {campaign.notes}
              </p>
            </div>
          )}

          {canManage && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={onEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#FFB800] text-[#111] text-[15px] font-bold hover:bg-[#e6a600] transition-colors"
              >
                Editar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`flex-1 py-2.5 rounded-xl text-[15px] font-bold transition-colors disabled:opacity-50 ${
                  confirming
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "border border-[#e0ddd4] text-[#555] hover:bg-[#f5f3eb]"
                }`}
              >
                {deleting
                  ? "Eliminando..."
                  : confirming
                    ? "¿Confirmar?"
                    : "Eliminar"}
              </button>
              {confirming && (
                <button
                  onClick={() => setConfirming(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
                >
                  No
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
