import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LineHubView from "./LineHubView";
import OperacionesView from "./OperacionesView";
import FinanzasView from "./FinanzasView";
import { loadReport, closeReport } from "./metricsApi";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const PREV_MONTH = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1;
const DEFAULT_YEAR = CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR;
const YEARS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i);

const VALID_TABS = ["hub", "operaciones", "finanzas"];

export default function LineView({ line, companyId, onLinesChange }) {
  const { can = () => true, userProfile } = useAuth();
  const canClose = can("reportes.close");

  // sub-tab, mes y año viven en la URL para sobrevivir a F5 y remounts.
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const subView = VALID_TABS.includes(rawTab) ? rawTab : "hub";

  const rawYear = Number(searchParams.get("year"));
  const year = rawYear >= 2020 && rawYear <= 2099 ? rawYear : DEFAULT_YEAR;

  const rawMonth = Number(searchParams.get("month"));
  // Clamp month: never allow a future month in the current year
  const clampedMonth = rawMonth >= 1 && rawMonth <= 12 ? rawMonth : PREV_MONTH;
  const month = (year === CURRENT_YEAR && clampedMonth > CURRENT_MONTH) ? CURRENT_MONTH : clampedMonth;

  function setParam(key, value) {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set(key, String(value));
      return p;
    }, { replace: true });
  }

  const SUB_TABS = [
    { key: "hub",         label: "Resumen"      },
    { key: "operaciones", label: "Operaciones"  },
    { key: "finanzas",    label: "Finanzas"     },
  ];

  // ── Estado de cierre del reporte (línea, año, mes) ────────────────────────
  // Operaciones y Finanzas comparten la misma fila de metric_reports, así que
  // "Cerrar reporte" bloquea ambas pestañas a la vez.
  const [reportMeta, setReportMeta] = useState(null); // fila de metric_reports o null
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(null);

  const loadMeta = useCallback(async () => {
    if (!line?.id) return;
    const { data } = await loadReport(line.id, year, month);
    setReportMeta(data ?? null);
  }, [line?.id, year, month]);

  // Recarga también al cambiar de sub-tab: si el usuario acaba de guardar en
  // Operaciones/Finanzas y vuelve, el botón/badge refleja el estado real.
  useEffect(() => { loadMeta(); }, [loadMeta, subView]);

  const isClosed = !!reportMeta?.closed_at;

  async function handleConfirmClose() {
    setClosing(true);
    setCloseError(null);
    const { data, error } = await closeReport(line.id, year, month, userProfile?.user_id ?? null);
    setClosing(false);
    if (error) {
      setCloseError(
        error.code === "PGRST116"
          ? "Primero guardá el reporte (Operaciones o Finanzas) antes de cerrarlo."
          : error.message
      );
      return;
    }
    setReportMeta(data);
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-5">
      {/* Header de línea */}
      <div className="flex items-center gap-3">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: line.color }} />
        <h2 className="text-[22px] font-bold text-[#111]">{line.name}</h2>
      </div>

      {/* Sub-tabs + selector mes/año */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit">
          {SUB_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setParam("tab", tab.key)}
              className={`px-4 py-1.5 rounded-lg text-[14px] font-semibold transition-all ${
                subView === tab.key
                  ? "bg-[#111] text-white"
                  : "text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Selector mes/año (excepto en Hub que muestra histórico) */}
        {subView !== "hub" && (
          <div className="flex items-center gap-2 ml-auto">
            <select
              className="input-base py-1 text-[14px]"
              value={month}
              onChange={e => setParam("month", e.target.value)}
            >
              {MONTHS.map((m, i) => {
                const monthNum = i + 1;
                if (year === CURRENT_YEAR && monthNum > CURRENT_MONTH) return null;
                return <option key={i} value={monthNum}>{m}</option>;
              })}
            </select>
            <select
              className="input-base py-1 text-[14px]"
              value={year}
              onChange={e => {
                const newYear = Number(e.target.value);
                setSearchParams(prev => {
                  const p = new URLSearchParams(prev);
                  p.set("year", String(newYear));
                  // Clamp month if switching to current year with a future month selected
                  if (newYear === CURRENT_YEAR && month > CURRENT_MONTH) {
                    p.set("month", String(CURRENT_MONTH));
                  }
                  return p;
                }, { replace: true });
              }}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            {isClosed ? (
              <span
                className="flex items-center gap-1.5 text-[12px] font-mono font-bold uppercase tracking-[0.08em] text-[#888] bg-[#f0ede3] border border-[#e0ddd4] rounded-full px-3 py-1"
                title={reportMeta?.closed_at ? `Cerrado el ${new Date(reportMeta.closed_at).toLocaleDateString()}` : ""}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="4" y="10" width="16" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10V7a4 4 0 018 0v3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Reporte cerrado
              </span>
            ) : canClose && (
              <button
                type="button"
                onClick={() => { setCloseError(null); setConfirmOpen(true); }}
                className="text-[13px] font-semibold text-[#888] hover:text-red-600 transition-colors"
              >
                Cerrar reporte
              </button>
            )}
          </div>
        )}
      </div>

      {/* Contenido del sub-view */}
      {subView === "hub" && (
        <LineHubView line={line} companyId={companyId} year={year} />
      )}
      {subView === "operaciones" && (
        <OperacionesView
          line={line}
          companyId={companyId}
          year={year}
          month={month}
          closed={isClosed}
        />
      )}
      {subView === "finanzas" && (
        <FinanzasView
          line={line}
          companyId={companyId}
          year={year}
          month={month}
          closed={isClosed}
        />
      )}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#e0ddd4] p-6 max-w-sm w-full space-y-4">
            <p className="text-[16px] font-bold text-[#111]">
              ¿Cerrar el reporte de {line.name} · {MONTHS[month - 1]} {year}?
            </p>
            <p className="text-[13px] text-[#888]">
              Esta acción es permanente: ni Operaciones ni Finanzas de este mes podrán
              volver a editarse, y no hay forma de reabrirlo desde la app.
            </p>
            {closeError && (
              <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {closeError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={closing}
                className="px-4 py-2 rounded-xl text-[14px] font-semibold text-[#666] hover:bg-[#f5f3eb] transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                disabled={closing}
                className="px-4 py-2 rounded-xl text-[14px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {closing ? "Cerrando..." : "Sí, cerrar permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
