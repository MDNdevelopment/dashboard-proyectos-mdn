export default function StaffPerformanceTable({ data }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
      <p className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">Rendimiento del equipo IT</p>
      {data.length === 0 ? (
        <p className="text-[13px] text-[#aaa] text-center py-6">Sin datos</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#f0ede3]">
              <th className="text-left text-[10px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] pb-2">Agente</th>
              <th className="text-right text-[10px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] pb-2">Resueltos</th>
              <th className="text-right text-[10px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] pb-2">Tiempo prom</th>
            </tr>
          </thead>
          <tbody>
            {data
              .sort((a, b) => b.resolved - a.resolved)
              .map(agent => (
                <tr key={agent.name} className="border-b border-[#f9f8f4] last:border-0">
                  <td className="py-2.5 font-medium text-[#111]">{agent.name}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-[#111]">{agent.resolved}</td>
                  <td className="py-2.5 text-right font-mono text-[#555]">
                    {agent.avgHours > 0
                      ? agent.avgHours < 24
                        ? `${agent.avgHours.toFixed(1)}h`
                        : `${(agent.avgHours / 24).toFixed(1)}d`
                      : '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
