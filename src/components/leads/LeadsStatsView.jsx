import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { MONTHS } from "../metricas/constants";

const STATUS_LABELS = {
  pendiente: "Pendiente",
  contactado: "Contactado",
  cancelado: "Cancelado",
};

const STATUS_COLORS = {
  pendiente: "#FFB800",
  contactado: "#2e7d32",
  cancelado: "#999",
};

/**
 * Estadísticas del módulo Leads — se calculan client-side sobre los leads ya
 * cargados por LeadsPage (loadLeads no pagina, el volumen es bajo), sin
 * queries nuevas. Reutiliza el patrón de gráficos de recharts ya usado en
 * src/components/tickets/analytics/ (StatusPieChart, TicketsOverTimeChart).
 */
export default function LeadsStatsView({ leads }) {
  const total = leads.length;

  const pendienteCount = leads.filter((l) => l.status === "pendiente").length;
  const contactadoCount = leads.filter((l) => l.status === "contactado").length;
  const canceladoCount = leads.filter((l) => l.status === "cancelado").length;

  const pct = (count) => (total > 0 ? Math.round((count / total) * 100) : 0);

  const kpis = [
    { label: "Total leads", value: total, accent: "#111" },
    { label: "% Pendientes", value: `${pct(pendienteCount)}%`, accent: STATUS_COLORS.pendiente },
    { label: "% Contactados", value: `${pct(contactadoCount)}%`, accent: STATUS_COLORS.contactado },
    { label: "% Cancelados", value: `${pct(canceladoCount)}%`, accent: STATUS_COLORS.cancelado },
    // Tasa de conversión = % de leads que terminan contactados sobre el total.
    { label: "Tasa de conversión", value: `${pct(contactadoCount)}%`, accent: "#1565c0" },
  ];

  const statusData = useMemo(
    () => [
      { name: "pendiente", value: pendienteCount },
      { name: "contactado", value: contactadoCount },
      { name: "cancelado", value: canceladoCount },
    ].filter((d) => d.value > 0),
    [pendienteCount, contactadoCount, canceladoCount]
  );

  // Leads por mes: agrupa por "YYYY-MM" y ordena cronológicamente (patrón de
  // src/hooks/useTicketAnalytics.js: map[key] = (map[key] ?? 0) + 1).
  const monthlyData = useMemo(() => {
    const byMonth = {};
    for (const lead of leads) {
      const key = lead.created_at?.slice(0, 7); // "YYYY-MM"
      if (!key) continue;
      byMonth[key] = (byMonth[key] ?? 0) + 1;
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const [year, month] = key.split("-").map(Number);
        return { key, label: `${MONTHS[month - 1].slice(0, 3)} ${String(year).slice(-2)}`, count };
      });
  }, [leads]);

  // Servicios más solicitados: cuenta ocurrencias en el array `servicios` de cada lead.
  const serviciosData = useMemo(() => {
    const byServicio = {};
    for (const lead of leads) {
      for (const servicio of lead.servicios ?? []) {
        byServicio[servicio] = (byServicio[servicio] ?? 0) + 1;
      }
    }
    return Object.entries(byServicio)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  if (total === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[15px] text-[#888]">Aún no hay leads para generar estadísticas.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white border border-[#e0ddd4] rounded-2xl p-4">
            <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-1.5">
              {kpi.label}
            </p>
            <p className="text-[24px] sm:text-[28px] font-bold leading-none" style={{ color: kpi.accent }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
            Leads por estado
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusData.map((d) => ({ ...d, name: STATUS_LABELS[d.name] ?? d.name }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#ccc"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: "DM Mono, monospace" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
            Leads por mes
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
              />
              <Bar dataKey="count" name="Leads" fill="#FFB800" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {serviciosData.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 lg:col-span-2">
            <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
              Servicios más solicitados
            </p>
            <ResponsiveContainer width="100%" height={Math.max(120, serviciosData.length * 36)}>
              <BarChart
                data={serviciosData}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
              >
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#666" }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
                />
                <Bar dataKey="value" name="Leads" fill="#1565c0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
