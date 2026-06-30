import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadLines, seedMetricsIfEmpty, exportMetrics, importMetrics } from "../components/metricas/metricsApi";
import { visibleLinesForUser } from "../utils/lineMembers";
import { supabase } from "../supabase";
import DashboardView from "../components/metricas/DashboardView";
import LineView from "../components/metricas/LineView";

function pathToKey(pathname) {
  if (pathname.startsWith("/reportes/linea/")) return "linea";
  return "dashboard";
}

export default function MetricasPage() {
  const { userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { lineId } = useParams();

  // Solo nivel 3+ o admin pueden ver Métricas.
  const canView = userProfile?.access_level >= 3 || userProfile?.admin === true;
  const activeKey = pathToKey(location.pathname);

  const [lines, setLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState(null);

  // Redirige si no tiene acceso (nivel 3+ o admin requerido)
  useEffect(() => {
    if (userProfile != null && !canView) {
      navigate("/", { replace: true });
    }
  }, [canView, userProfile, navigate]);

  const fetchLines = useCallback(async () => {
    if (!userProfile?.company_id) return;
    const { data } = await loadLines(userProfile.company_id);
    // Nivel 4+ y admin ven todas las líneas; nivel 3 solo ve las suyas.
    setLines(visibleLinesForUser(data ?? [], userProfile));
    setLoadingLines(false);
  }, [userProfile]);

  // Seed automático + carga de líneas
  useEffect(() => {
    if (!userProfile?.company_id) return;
    (async () => {
      setSeeding(true);
      await seedMetricsIfEmpty(userProfile.company_id);
      setSeeding(false);
      await fetchLines();
    })();
  }, [userProfile?.company_id, fetchLines]);

  // Canal realtime: recarga líneas y clientes si cambian
  useEffect(() => {
    if (!userProfile?.company_id) return;
    const channel = supabase
      .channel("metricas-lines")
      .on("postgres_changes", { event: "*", schema: "public", table: "metric_lines" }, fetchLines)
      .on("postgres_changes", { event: "*", schema: "public", table: "metric_clients" }, fetchLines)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userProfile?.company_id, fetchLines]);

  // ── Helpers de toast ──────────────────────────────────────────────────────
  function showToast(msg, type = "") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  }

  // ── Export / Import ───────────────────────────────────────────────────────
  async function handleExport() {
    const payload = await exportMetrics(userProfile.company_id);
    if (!payload) { showToast("Error al exportar los datos.", "error"); return; }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metricas-mdn-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exportación lista.");
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = await importMetrics(userProfile.company_id, payload);
      if (result.error) { showToast(result.error, "error"); return; }
      await fetchLines();
      showToast("Importación completada.");
    } catch {
      showToast("El archivo no es válido.", "error");
    }
    e.target.value = "";
  }

  if (!userProfile) {
    return (
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  const isLineView = activeKey === "linea";
  const activeLine = isLineView ? lines.find(l => l.id === lineId) : null;

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">Métricas</h1>
            <p className="text-[15px] text-[#888] mt-0.5">
              Reportes mensuales · Líneas operativas
            </p>
          </div>
          {/* Botones export/import */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e0ddd4] bg-white text-[13.5px] font-medium text-[#555] hover:bg-[#f5f3eb] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M8 1v9M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12v2h12v-2" strokeLinecap="round"/>
              </svg>
              Exportar
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e0ddd4] bg-white text-[13.5px] font-medium text-[#555] hover:bg-[#f5f3eb] transition-colors cursor-pointer">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M8 11V2M5 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12v2h12v-2" strokeLinecap="round"/>
              </svg>
              Importar
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
          </div>
        </div>

        {/* Tab switcher — líneas como tabs */}
        {(loadingLines || seeding) ? (
          <div className="flex items-center gap-2 mb-6 text-[14px] text-[#888]">
            <div className="w-4 h-4 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
            Preparando líneas...
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
            <button
              onClick={() => navigate("/reportes")}
              className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                activeKey === "dashboard"
                  ? "bg-[#111] text-white"
                  : "text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]"
              }`}
            >
              Dashboard
            </button>
            {lines.map(line => (
              <button
                key={line.id}
                onClick={() => navigate(`/reportes/linea/${line.id}`)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                  activeKey === "linea" && lineId === line.id
                    ? "bg-[#111] text-white"
                    : "text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: activeKey === "linea" && lineId === line.id ? "white" : line.color }}
                />
                {line.name}
              </button>
            ))}
          </div>
        )}

        {/* Contenido */}
        {!loadingLines && !seeding && (
          <>
            {activeKey === "dashboard" && (
              <DashboardView companyId={userProfile.company_id} lines={lines} />
            )}
            {activeKey === "linea" && activeLine && (
              <LineView
                line={activeLine}
                companyId={userProfile.company_id}
                onLinesChange={fetchLines}
              />
            )}
            {activeKey === "linea" && !activeLine && lines.length > 0 && (
              <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
                <p className="text-[17px] font-semibold text-[#888]">Línea no encontrada</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-[14.5px] font-medium shadow-lg z-50 transition-all ${
            toast.type === "error"
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-white border border-[#e0ddd4] text-[#111]"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </main>
  );
}
