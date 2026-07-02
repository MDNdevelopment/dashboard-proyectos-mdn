import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import LineHubView from "./LineHubView";
import OperacionesView from "./OperacionesView";
import FinanzasView from "./FinanzasView";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEARS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i);

export default function LineView({ line, companyId, onLinesChange }) {
  const [searchParams] = useSearchParams();
  const [subView, setSubView] = useState(() => {
    const tab = searchParams.get("tab");
    return ["hub", "operaciones", "finanzas"].includes(tab) ? tab : "hub";
  });
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);

  const SUB_TABS = [
    { key: "hub",         label: "Resumen"      },
    { key: "operaciones", label: "Operaciones"  },
    { key: "finanzas",    label: "Finanzas"     },
  ];

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
              onClick={() => setSubView(tab.key)}
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
              onChange={e => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              className="input-base py-1 text-[14px]"
              value={year}
              onChange={e => setYear(Number(e.target.value))}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
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
        />
      )}
      {subView === "finanzas" && (
        <FinanzasView
          line={line}
          companyId={companyId}
          year={year}
          month={month}
        />
      )}
    </div>
  );
}
