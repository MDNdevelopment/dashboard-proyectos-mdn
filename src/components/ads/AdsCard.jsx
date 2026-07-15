import { STATUS, STATUSES, PRIORITY } from "./constants";
import StatusPill from "../common/StatusPill";
import ClientCell from "./ClientCell";
import { fmtDate, dateColor, inPeriod } from "./campaignSpendApi";

export default function AdsCard({
  campaign,
  canManage,
  usersMap,
  clientsById,
  periodo,
  onSelect,
  onStatusChange,
  onEdit,
  onDelete,
  inlineEditId,
  inlineEditValue,
  onInlineEditStart,
  onInlineEditChange,
  onInlineEditSave,
}) {
  const priority = PRIORITY[campaign.priority];
  // La táctica se ve en este período por su rango, pero no empezó en él (spansPeriod en AdsPage).
  const esContinua = periodo && !inPeriod(campaign.start_date, periodo);

  const isInlineEditing = inlineEditId === campaign.id;

  return (
    <tr
      onClick={() => onSelect(campaign)}
      className="border-b border-[#f0ede3] hover:bg-[#fafaf7] transition-colors group cursor-pointer"
    >
      {/* Client */}
      <td className="px-3 py-2.5 text-[14px] text-[#444] whitespace-nowrap">
        <ClientCell
          name={campaign.client}
          logoUrl={campaign.client_id ? clientsById?.get(campaign.client_id)?.logo_url : null}
        />
      </td>

      {/* Name — inline editable */}
      <td className="px-3 py-2.5 max-w-[180px]">
        {isInlineEditing ? (
          <input
            autoFocus
            className="input-base text-[14px] py-1 w-full"
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
            className={`text-[15px] font-semibold text-[#111] leading-snug ${canManage ? "cursor-text" : ""}`}
            title={campaign.notes || undefined}
          >
            {campaign.name}
            {campaign.notes && (
              <p className="text-[13px] font-normal text-[#999] truncate mt-0.5">
                {campaign.notes}
              </p>
            )}
          </div>
        )}
      </td>

      {/* Assignee */}
      <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
        {usersMap?.get(campaign.assignee) ?? campaign.assignee ?? "—"}
      </td>

      {/* Start date */}
      <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
        {fmtDate(campaign.start_date)}
        {esContinua && (
          <span className="block text-[11px] font-mono font-semibold text-[#c99400] mt-0.5">
            Táctica continua
          </span>
        )}
      </td>

      {/* End date */}
      <td
        className={`px-3 py-2.5 text-[14px] whitespace-nowrap ${dateColor(campaign.end_date)}`}
      >
        {fmtDate(campaign.end_date)}
      </td>

      {/* Priority */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-[13px] font-mono font-semibold text-[#555]">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${priority?.dot ?? "bg-[#bbb]"}`}
          />
          {campaign.priority}
        </span>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <StatusPill
          value={campaign.status}
          meta={STATUS}
          options={STATUSES}
          editable={canManage}
          onChange={(next) => onStatusChange(campaign.id, next)}
          size="sm"
        />
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
