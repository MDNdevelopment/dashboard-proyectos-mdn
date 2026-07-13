import { useState } from "react";
import {
  fmtMonth,
  isClosed,
  isLate,
  isBlocked,
  fmtShort,
  taskLight,
} from "./constants";
import { Avatar } from "./UserPickerSingle";
import { tasksForVisibleLines } from "../../utils/lineFilters";

const RED = "#E14848";
const YELLOW = "#FFB800";
const INDIGO = "#6366F1";

function TaskItem({ task, why, color, usersMap, onOpen }) {
  const assignees = (task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])).map(id => usersMap.get(id)).filter(Boolean);
  return (
    <div
      className="flex items-start gap-3 p-3 bg-[#faf9f5] rounded-xl border border-[#e0ddd4] hover:border-[#ccc] hover:bg-[#f5f3eb] cursor-pointer transition-colors"
      onClick={() => onOpen(task)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-[#555] truncate">
          {task.client || "Sin cliente"}
        </p>
        <p className="text-[14px] text-[#555] line-clamp-2">
          {task.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[12.5px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: color + "33", color }}
          >
            {why}
          </span>
          {assignees.length > 0 && (
            <span className="flex items-center gap-1 text-[13px] text-[#888]">
              {assignees.slice(0, 2).map(a => (
                <Avatar key={a.user_id} user={a} size={14} />
              ))}
              {assignees.length === 1
                ? assignees[0].first_name
                : `${assignees[0].first_name} +${assignees.length - 1}`}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen(task);
        }}
        className="text-[13px] font-semibold text-[#888] hover:text-[#111] transition-colors flex-shrink-0 mt-0.5"
      >
        Abrir
      </button>
    </div>
  );
}

export default function StandupView({
  team,
  teams = [],
  allLines = false,
  tasks,
  usersMap,
  monthIdx,
  onOpenTask,
}) {
  const [fLine, setFLine] = useState("");

  if (!team && !allLines) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[16px] font-medium text-[#888]">
          Selecciona un team para ver el Stand-up
        </p>
      </div>
    );
  }

  const all = allLines
    ? tasksForVisibleLines(tasks, teams).filter((t) => !fLine || t.team_id === fLine)
    : tasks.filter((t) => t.team_id === team.id);
  const red = all.filter((t) => !isClosed(t) && taskLight(t) === "red");
  const yellow = all.filter((t) => !isClosed(t) && taskLight(t) === "yellow");
  const direction = all.filter((t) => !isClosed(t) && t.support_id);

  const scopeName = allLines
    ? (fLine ? teams.find((t) => t.id === fLine)?.name ?? "Todos los teams" : "Todos los teams")
    : team.name;

  function reason(t) {
    if (isBlocked(t)) return "Paralizado";
    if (isLate(t)) return `Retrasado (${fmtShort(t.due_date)})`;
    return t.status; // 'Por revisar' | 'Pendiente'
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[19px] font-bold text-[#111]">
            Stand-up · {scopeName}
          </h2>
          <p className="text-[14.5px] text-[#888]">{fmtMonth(monthIdx)}</p>
        </div>
        {allLines && (
          <select
            value={fLine}
            onChange={(e) => setFLine(e.target.value)}
            className="input-base text-[14.5px] py-2 w-full sm:w-56"
          >
            <option value="">Línea: todas</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Leyenda */}
      <div className="bg-white rounded-xl border border-[#e0ddd4] px-5 py-3 flex items-center gap-5 flex-wrap">
        {/* Rojo */}
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: RED }}
          />
          <span className="text-[14.5px] font-bold text-[#111]">Rojo</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {["Paralizado", "Retrasado"].map((label) => (
            <span
              key={label}
              className="text-[14px] font-medium text-[#555] bg-[#f0eee6] px-2.5 py-0.5 rounded-full"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Separador */}
        <div className="w-px h-5 bg-[#e0ddd4] mx-1 flex-shrink-0" />

        {/* Amarillo */}
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: YELLOW }}
          />
          <span className="text-[14.5px] font-bold text-[#111]">Amarillo</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {["Por revisar", "Pendiente"].map((label) => (
            <span
              key={label}
              className="text-[14px] font-medium text-[#555] bg-[#f0eee6] px-2.5 py-0.5 rounded-full"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Separador */}
        <div className="w-px h-5 bg-[#e0ddd4] mx-1 flex-shrink-0" />

        {/* Dirección */}
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: INDIGO }}
          />
          <span className="text-[14.5px] font-bold text-[#111]">Dirección</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[14px] font-medium text-[#555] bg-[#f0eee6] px-2.5 py-0.5 rounded-full">
            Apoyo solicitado
          </span>
        </div>
      </div>

      {/* Cards de semáforo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card Amarilla */}
        <div
          className="bg-white rounded-xl border p-4 space-y-2"
          style={{ borderColor: YELLOW }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: YELLOW }}
            />
            <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#555]">
              Pendientes — Por revisar ({yellow.length})
            </p>
          </div>
          <div className="h-64 overflow-y-auto space-y-2 pr-0.5">
            {yellow.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-[14.5px] text-[#aaa] text-center">Sin tareas</p>
              </div>
            ) : (
              yellow.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  why={reason(t)}
                  color={YELLOW}
                  usersMap={usersMap}
                  onOpen={onOpenTask}
                />
              ))
            )}
          </div>
        </div>

        {/* Card Roja */}
        <div
          className="bg-white rounded-xl border p-4 space-y-2"
          style={{ borderColor: RED }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: RED }}
            />
            <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#555]">
              Paralizadas — Retrasadas ({red.length})
            </p>
          </div>
          <div className="h-64 overflow-y-auto space-y-2 pr-0.5">
            {red.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-[14.5px] text-[#aaa] text-center">Sin tareas</p>
              </div>
            ) : (
              red.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  why={reason(t)}
                  color={RED}
                  usersMap={usersMap}
                  onOpen={onOpenTask}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Card Dirección */}
      <div
        className="bg-white rounded-xl border p-4 space-y-2"
        style={{ borderColor: INDIGO }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: INDIGO }}
          />
          <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#555]">
            Asignadas a dirección ({direction.length})
          </p>
        </div>
        <div className="h-64 overflow-y-auto space-y-2 pr-0.5">
          {direction.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[14.5px] text-[#aaa] text-center">Sin tareas asignadas a dirección</p>
            </div>
          ) : (
            direction.map((t) => {
              const supportUser = usersMap.get(t.support_id);
              const supportName = supportUser ? supportUser.first_name : "Dirección";
              return (
                <TaskItem
                  key={t.id}
                  task={t}
                  why={`Apoyo: ${supportName}`}
                  color={INDIGO}
                  usersMap={usersMap}
                  onOpen={onOpenTask}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
