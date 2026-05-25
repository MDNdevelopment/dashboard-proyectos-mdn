import { STATUS, PRIORITY, STATUS_CYCLE } from "./constants";

function dateColor(dateStr) {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "text-red-600 font-semibold";
  if (diff <= 3) return "text-[#f57f17] font-semibold";
  return "text-[#333]";
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdsCard({
  campaign,
  index,
  canManage,
  usersMap,
  onSelect,
  onStatusCycle,
  onEdit,
  onDelete,
  inlineEditId,
  inlineEditValue,
  onInlineEditStart,
  onInlineEditChange,
  onInlineEditSave,
}) {
  const status = STATUS[campaign.status];
  const priority = PRIORITY[campaign.priority];

  function handleStatusClick(e) {
    e.stopPropagation();
    if (!canManage) return;
    const idx = STATUS_CYCLE.indexOf(campaign.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onStatusCycle(campaign.id, next);
  }

  const isInlineEditing = inlineEditId === campaign.id;

  return (
    <tr className="border-b border-[#f0ede3] hover:bg-[#fafaf7] transition-colors group">
      {/* # */}
      <td className="px-3 py-2.5 text-[11px] font-mono text-[#aaa]">
        {index + 1}
      </td>

      {/* Start date */}
      <td className="px-3 py-2.5 text-[12px] text-[#555] whitespace-nowrap">
        {fmtDate(campaign.start_date)}
      </td>

      {/* Name — inline editable */}
      <td className="px-3 py-2.5 max-w-[180px]">
        {isInlineEditing ? (
          <input
            autoFocus
            className="input-base text-[12px] py-1 w-full"
            value={inlineEditValue}
            onChange={(e) => onInlineEditChange(e.target.value)}
            onBlur={() => onInlineEditSave(campaign.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onInlineEditSave(campaign.id);
              if (e.key === "Escape") onInlineEditStart(null, "");
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            onClick={
              canManage
                ? (e) => {
                    e.stopPropagation();
                    onInlineEditStart(campaign.id, campaign.name);
                  }
                : undefined
            }
            className={`text-[13px] font-semibold text-[#111] leading-snug ${canManage ? "cursor-text" : ""}`}
            title={campaign.notes || undefined}
          >
            {campaign.name}
            {campaign.notes && (
              <p className="text-[11px] font-normal text-[#999] truncate mt-0.5">
                {campaign.notes}
              </p>
            )}
          </div>
        )}
      </td>

      {/* Client */}
      <td className="px-3 py-2.5 text-[12px] text-[#444] whitespace-nowrap">
        {campaign.client}
      </td>

      {/* Assignee */}
      <td className="px-3 py-2.5 text-[12px] text-[#555] whitespace-nowrap">
        {usersMap?.get(campaign.assignee) ?? campaign.assignee ?? "—"}
      </td>

      {/* End date */}
      <td
        className={`px-3 py-2.5 text-[12px] whitespace-nowrap ${dateColor(campaign.end_date)}`}
      >
        {fmtDate(campaign.end_date)}
      </td>

      {/* Priority */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#555]">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${priority?.dot ?? "bg-[#bbb]"}`}
          />
          {campaign.priority}
        </span>
      </td>

      {/* Status — clickable badge */}
      <td className="px-3 py-2.5">
        <button
          onClick={handleStatusClick}
          title={canManage ? "Clic para avanzar estado" : undefined}
          className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg whitespace-nowrap transition-opacity ${
            status?.bg ?? "bg-[#f5f3eb]"
          } ${status?.text ?? "text-[#555]"} ${canManage ? "hover:opacity-75 cursor-pointer" : "cursor-default"}`}
        >
          {status?.label ?? campaign.status}
        </button>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(campaign);
            }}
            className="p-1.5 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-all"
            title="Ver detalle"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="8" cy="8" r="6.5" />
              <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {canManage && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(campaign);
                }}
                className="p-1.5 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-all"
                title="Editar"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M11 2l3 3-8 8H3v-3l8-8z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(campaign);
                }}
                className="p-1.5 rounded-lg text-[#999] hover:text-red-600 hover:bg-red-50 transition-all"
                title="Eliminar"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    d="M3 4h10M6 4V2.5h4V4M5 4v8.5h6V4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
