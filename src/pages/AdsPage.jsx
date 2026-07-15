import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import AdsStats from "../components/ads/AdsStats";
import AdsList from "../components/ads/AdsList";
import AdsForm from "../components/ads/AdsForm";
import AdsDetail from "../components/ads/AdsDetail";
import AdsSpendView from "../components/ads/AdsSpendView";
import { loadClients } from "../components/metricas/metricsApi";
import { inPeriod, spansPeriod } from "../components/ads/campaignSpendApi";
import { MONTHS } from "../components/metricas/constants";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

const TABS = [
  { key: "tacticas", label: "Tácticas" },
  { key: "ads", label: "Ads" },
];

export default function AdsPage() {
  const { userProfile, can = () => true } = useAuth();
  const [tab, setTab] = useState("tacticas");
  const [periodo, setPeriodo] = useState(() => ({
    month: new Date().getMonth() + 1,
    year: CURRENT_YEAR,
  }));
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [usersMap, setUsersMap] = useState(new Map());
  const [clientsById, setClientsById] = useState(new Map());
  const adsSpendViewRef = useRef(null);
  const adsListRef = useRef(null);

  // Control de acceso config-driven — sin reglas configuradas: abierto a todos.
  const canManage = can("ads.manage");

  const filteredCampaigns = campaigns.filter(c => spansPeriod(c.start_date, c.end_date, periodo));

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    if (!userProfile?.company_id) return;
    supabase
      .from("users")
      .select("user_id, first_name, last_name")
      .eq("company_id", userProfile.company_id)
      .order("first_name")
      .then(({ data }) => {
        if (data) {
          setUsersMap(new Map(data.map(u => [u.user_id, `${u.first_name} ${u.last_name}`])));
        }
      });
  }, [userProfile?.company_id]);

  useEffect(() => {
    if (!userProfile?.company_id) return;
    loadClients(userProfile.company_id).then(({ data }) => {
      if (data) setClientsById(new Map(data.map(c => [c.id, c])));
    });
  }, [userProfile?.company_id]);

  async function fetchCampaigns() {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns(data ?? []);
    setLoading(false);
  }

  function handleCreated(campaign) {
    setCampaigns((prev) => [campaign, ...prev]);
  }

  function handleUpdated(updated) {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
    if (selectedCampaign?.id === updated.id) setSelectedCampaign(updated);
  }

  function handleDeleted(id) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    if (selectedCampaign?.id === id) setSelectedCampaign(null);
  }

  function handleEditFromDetail(campaign) {
    setSelectedCampaign(null);
    setEditingCampaign(campaign);
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h1 className="text-[26px] font-bold text-[#111] leading-tight">
                Campañas & Tácticas
              </h1>
              <p className="text-[15px] text-[#888] mt-0.5">
                {canManage
                  ? "Gestión de campañas, tácticas y pauta publicitaria"
                  : "Vista de campañas, tácticas y pauta publicitaria"}
              </p>
            </div>
            {canManage && (tab === "tacticas" ? (
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                >
                  <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                </svg>
                Nueva campaña
              </button>
            ) : (
              <button
                onClick={() => adsSpendViewRef.current?.openCreate()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                >
                  <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                </svg>
                Nuevo Ad
              </button>
            ))}
          </div>

          {/* Tabs + selector de periodo */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-1.5 rounded-lg text-[14px] font-semibold transition-colors ${
                    tab === t.key ? "bg-[#111] text-white" : "text-[#666] hover:bg-[#f5f3eb]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Selector mes/año — aplica a ambas tabs */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">
                Período
              </span>
              <select
                value={periodo.month}
                onChange={e => setPeriodo(p => ({ ...p, month: Number(e.target.value) }))}
                className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
              >
                {MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
              <select
                value={periodo.year}
                onChange={e => setPeriodo(p => ({ ...p, year: Number(e.target.value) }))}
                className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
              >
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {tab === "tacticas" ? (
            <>
              <AdsStats
                campaigns={filteredCampaigns}
                onResetFilters={() => adsListRef.current?.clearFilters()}
                onFilterStatus={(status) => adsListRef.current?.setFilterStatus(status)}
              />

              <AdsList
                ref={adsListRef}
                campaigns={filteredCampaigns}
                loading={loading}
                canManage={canManage}
                usersMap={usersMap}
                clientsById={clientsById}
                periodo={periodo}
                onSelect={setSelectedCampaign}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
                onEdit={(campaign) => setEditingCampaign(campaign)}
              />
            </>
          ) : (
            <AdsSpendView
              ref={adsSpendViewRef}
              companyId={userProfile?.company_id}
              canManage={canManage}
              periodo={periodo}
            />
          )}
        </div>
      </main>

      {showCreateForm && (
        <AdsForm
          campaign={null}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

      {editingCampaign && (
        <AdsForm
          campaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

      {selectedCampaign && (
        <AdsDetail
          campaign={selectedCampaign}
          usersMap={usersMap}
          onClose={() => setSelectedCampaign(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          canManage={canManage}
          onEdit={() => handleEditFromDetail(selectedCampaign)}
        />
      )}
    </>
  );
}
