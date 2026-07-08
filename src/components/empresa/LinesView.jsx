import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabase";
import {
  loadLines,
  updateLine,
  deleteLine,
  loadClients,
  loadYearReports,
  addLineMember,
  removeLineMember,
} from "../metricas/metricsApi";
import { useAuth } from "../../context/AuthContext";
import { assignMemberToLine, lineOfMember, removeMemberFromLine } from "../../utils/lineMembers";
import { monthLineScore } from "../../utils/metricsScore";
import { MONTHS } from "../metricas/constants";
import ScoreDial, { scoreDialColor } from "../metricas/ScoreDial";
import LineModal from "./LineModal";
import LineMetasModal from "./LineMetasModal";
import LineFichaModal from "./LineFichaModal";
import ConfirmDeleteDialog from "../common/ConfirmDeleteDialog";

const _now = new Date();
const PREV_MONTH_DATE = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
const PREV_YEAR  = PREV_MONTH_DATE.getFullYear();   // año anterior cuando estamos en enero
const PREV_MONTH = PREV_MONTH_DATE.getMonth() + 1;  // 1–12

// ── Subcomponentes de la card ──────────────────────────────────────────────────

const DIAL_SIZE = 84;

/**
 * Dial radial de salud de la línea. Usa ScoreDial en tamaño chico.
 * Si no hay datos (score null), muestra "Sin datos".
 * Si recibe onClick, el dial (o el estado "Sin datos") se hace clickeable.
 */
function HealthDial({ score, month, onClick, lineName }) {
  const monthLabel =
    month != null ? MONTHS[month - 1].slice(0, 3).toUpperCase() : null;
  const dialColor = score != null ? scoreDialColor(score) : "#d1cec7";

  const inner = (
    <div className="flex flex-col items-center flex-shrink-0">
      {score != null ? (
        <>
          <ScoreDial
            score={score}
            color={dialColor}
            size={DIAL_SIZE}
            showScale={false}
          />
          <p className="text-[10.5px] font-mono text-[#aaa] mt-1 uppercase tracking-wide text-center">
            Salud{monthLabel ? ` · ${monthLabel}` : ""}
          </p>
        </>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-full border-4 border-[#f0ede3]"
          style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
        >
          <p className="text-[10px] font-mono text-[#ccc] uppercase tracking-wide text-center leading-tight">
            Sin
            <br />
            datos
          </p>
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Ver reporte de ${lineName}`}
        title={`Ver reporte de ${lineName}`}
        className="hover:opacity-75 transition-opacity focus:outline-none"
      >
        {inner}
      </button>
    );
  }
  return inner;
}

const LOGO_LIMIT = 5;

/**
 * Fila de logos apilados de los clientes de la línea.
 * Muestra hasta LOGO_LIMIT avatares con logo_url o inicial; el resto como chip "+N".
 */
function BrandLogos({ clients, color }) {
  const visible = clients.slice(0, LOGO_LIMIT);
  const overflow = clients.length - LOGO_LIMIT;

  // Genera un color de fondo semitransparente coherente con la línea
  const fallbackBg = color + "22";

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2">
        {visible.map((c) => (
          <div
            key={c.id}
            title={c.name}
            className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{ background: c.logo_url ? undefined : fallbackBg }}
          >
            {c.logo_url ? (
              <img
                src={c.logo_url}
                alt={c.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-bold" style={{ color }}>
                {(c.name?.[0] ?? "?").toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-[11px] font-mono text-[#aaa] ml-1">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/**
 * Gestión de líneas operativas y sus miembros (empleados).
 * Permite:
 *   - Crear / renombrar / eliminar líneas (LineModal + ConfirmDeleteDialog)
 *   - Asignar / mover empleados desde la ficha de cada línea (LineFichaModal)
 */
export default function LinesView({ companyId, canManage = true }) {
  const navigate = useNavigate();
  const { can = () => true } = useAuth();
  const [lines, setLines] = useState([]);
  const [clients, setClients] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lineModal, setLineModal] = useState(undefined); // undefined=cerrado, null=crear, obj=editar
  const [metasModal, setMetasModal] = useState(null); // null=cerrado, obj=línea a editar metas
  const [fichaModal, setFichaModal] = useState(null); // null=cerrado, lineId cuya ficha se muestra
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // ── Carga ─────────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    const [linesRes, clientsRes, reportsRes] = await Promise.all([
      loadLines(companyId),
      loadClients(companyId),
      loadYearReports(companyId, PREV_YEAR),
    ]);
    setLines(linesRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setReports(reportsRes.data ?? []);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [companyId, fetchAll]);

  // ── Realtime ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("empresa-lineas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "metric_lines" },
        fetchAll,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "metric_clients" },
        fetchAll,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "metric_reports" },
        fetchAll,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "metric_line_members" },
        fetchAll,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, fetchAll]);

  // ── Asignar empleado a una línea (llamado desde LineFichaModal) ───────────────
  async function handleAssignMember(lineId, userId) {
    if (!userId) return;
    const oldLine = lineOfMember(lines, userId);
    if (oldLine && oldLine.id !== lineId) {
      await removeLineMember(oldLine.id, userId);
    }
    await addLineMember(lineId, userId);
    setLines((prev) => assignMemberToLine(prev, lineId, userId).updated);
  }

  // ── Quitar empleado de una línea (llamado desde LineFichaModal) ───────────────
  async function handleRemoveMember(lineId, userId) {
    await removeLineMember(lineId, userId);
    setLines((prev) => removeMemberFromLine(prev, lineId, userId).updated);
  }

  // ── Estado optimista: líneas guardadas desde LineModal ────────────────────────
  function handleLineSaved(row) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === row.id);
      if (idx >= 0)
        return prev.map((l) => (l.id === row.id ? { ...l, ...row } : l));
      return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  // ── Eliminar línea ────────────────────────────────────────────────────────────
  async function handleDeleteLine() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error: err } = await deleteLine(confirmDelete.id);
    setDeleting(false);
    if (err) {
      setError(err.message);
      setConfirmDelete(null);
      return;
    }
    setLines((prev) => prev.filter((l) => l.id !== confirmDelete.id));
    setConfirmDelete(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <p className="text-[15px] text-[#888] max-w-xl">
          Gestiona las líneas operativas y asigna empleados a cada una. Al
          asignar un empleado a una línea, se mueve automáticamente si ya
          pertenecía a otra.
        </p>
        {canManage && (
          <button
            onClick={() => setLineModal(null)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FAB51A] text-[#111] font-bold text-[14.5px] hover:bg-[#e8a315] transition-colors flex-shrink-0 ml-4"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M6.5 1v11M1 6.5h11" strokeLinecap="round" />
            </svg>
            Nueva línea
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {lines.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[16px] font-semibold text-[#888] mb-1">
            Sin líneas
          </p>
          <p className="text-[14px] text-[#bbb]">
            Creá la primera línea operativa para comenzar.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lines.map((line) => {
            const memberCount = (line.member_user_ids ?? []).length;
            const lineClients = clients.filter((c) => c.line_id === line.id);
            const clientCount = lineClients.length;
            const { score, month } = monthLineScore(
              reports.filter((r) => r.line_id === line.id),
              PREV_MONTH,
            );

            return (
              <div
                key={line.id}
                className="bg-white rounded-2xl border border-[#e0ddd4] overflow-hidden cursor-pointer hover:border-[#d0ccc0] transition-colors"
                onClick={(e) => {
                  // Los controles de gestión (botones) no abren la ficha
                  if (e.target.closest("button, select, a, input")) return;
                  setFichaModal(line.id);
                }}
              >
                {/* Card header: nombre y color */}
                <div
                  className="px-5 py-3 border-b border-[#f0ede3]"
                  style={{ background: line.color + "14" }}
                >
                  <button
                    type="button"
                    onClick={() => setFichaModal(line.id)}
                    aria-label={`Ver ficha de ${line.name}`}
                    className="flex items-center gap-2 min-w-0 text-left"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: line.color }}
                    />
                    <span className="text-[15.5px] font-bold text-[#111] hover:underline decoration-[#ccc] underline-offset-2">
                      {line.name}
                    </span>
                  </button>
                </div>

                {/* Cuerpo de la card */}
                <div className="px-5 py-4 space-y-4">
                  {/* Estadísticas: Empleados + Marcas + Dial de salud */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-6">
                      <div>
                        <p className="text-[28px] font-bold text-[#111] leading-none">
                          {memberCount}
                        </p>
                        <p className="text-[12px] font-mono text-[#aaa] mt-1 uppercase tracking-wide">
                          Empleados
                        </p>
                      </div>
                      <div>
                        <p className="text-[28px] font-bold text-[#111] leading-none">
                          {clientCount}
                        </p>
                        <p className="text-[12px] font-mono text-[#aaa] mt-1 uppercase tracking-wide">
                          Marcas
                        </p>
                      </div>
                    </div>
                    <HealthDial
                      score={score}
                      month={month}
                      lineName={line.name}
                      onClick={
                        can("reportes")
                          ? () => navigate(`/reportes/linea/${line.id}?tab=hub`)
                          : undefined
                      }
                    />
                  </div>

                  {/* Logos de marcas */}
                  {lineClients.length > 0 && (
                    <BrandLogos clients={lineClients} color={line.color} />
                  )}

                  {/* Acciones como links de texto (solo canManage) */}
                  {canManage && (
                    <div className="flex items-center gap-3 text-[13px] pt-1 border-t border-[#f5f3eb]">
                      <button
                        onClick={() => setMetasModal(line)}
                        aria-label="Configurar metas"
                        className="text-[#999] hover:text-[#111] transition-colors"
                      >
                        Configurar metas
                      </button>
                      <span className="text-[#ddd]">·</span>
                      <button
                        onClick={() => setLineModal(line)}
                        aria-label="Editar línea"
                        className="text-[#999] hover:text-[#111] transition-colors"
                      >
                        Editar
                      </button>
                      <span className="text-[#ddd]">·</span>
                      <button
                        onClick={() =>
                          setConfirmDelete({ id: line.id, name: line.name })
                        }
                        aria-label="Eliminar línea"
                        className="text-[#999] hover:text-red-400 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal línea */}
      {lineModal !== undefined && (
        <LineModal
          line={lineModal}
          companyId={companyId}
          sortOrder={lines.length}
          onClose={() => setLineModal(undefined)}
          onSaved={handleLineSaved}
        />
      )}

      {/* Ficha de línea — pasa la línea fresca desde el estado */}
      {fichaModal &&
        (() => {
          const freshLine = lines.find((l) => l.id === fichaModal) ?? null;
          return freshLine ? (
            <LineFichaModal
              line={freshLine}
              companyId={companyId}
              canManage={canManage}
              onAssignMember={(userId) =>
                handleAssignMember(freshLine.id, userId)
              }
              onRemoveMember={canManage ? (userId) =>
                handleRemoveMember(freshLine.id, userId) : undefined
              }
              onClose={() => setFichaModal(null)}
            />
          ) : null;
        })()}

      {/* Modal metas de línea */}
      {metasModal && (
        <LineMetasModal
          line={metasModal}
          onClose={() => setMetasModal(null)}
          onSaved={(row) => {
            handleLineSaved(row);
            setMetasModal(null);
          }}
        />
      )}

      {/* Diálogo eliminar línea */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          itemName={confirmDelete.name}
          itemLabel="línea"
          onConfirm={handleDeleteLine}
          onCancel={() => setConfirmDelete(null)}
          confirming={deleting}
        />
      )}
    </div>
  );
}
