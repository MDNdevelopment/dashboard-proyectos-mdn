import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import AdsStats from "../components/ads/AdsStats";
import AdsList from "../components/ads/AdsList";
import AdsForm from "../components/ads/AdsForm";
import AdsDetail from "../components/ads/AdsDetail";

export default function AdsPage() {
  const { userProfile } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [usersMap, setUsersMap] = useState(new Map());

  const canManage =
    userProfile?.access_level >= 3 || userProfile?.admin === true;

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
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[24px] font-bold text-[#111] leading-tight">
                Campañas & Tácticas
              </h1>
              <p className="text-[13px] text-[#888] mt-0.5">
                {canManage
                  ? "Gestión de campañas y tácticas publicitarias"
                  : "Vista de campañas y tácticas"}
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-2 bg-[#111] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
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
            )}
          </div>

          <AdsStats campaigns={campaigns} />

          <AdsList
            campaigns={campaigns}
            loading={loading}
            canManage={canManage}
            usersMap={usersMap}
            onSelect={setSelectedCampaign}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
            onEdit={(campaign) => setEditingCampaign(campaign)}
          />
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
