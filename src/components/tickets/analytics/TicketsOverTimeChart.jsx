import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function TicketsOverTimeChart({ data }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
      <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">Tickets por dia</p>
      {data.length === 0 ? (
        <p className="text-[15px] text-[#aaa] text-center py-8">Sin datos</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
              tickFormatter={d => d.slice(5)}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, fontFamily: 'DM Mono, monospace', borderRadius: 8, border: '1px solid #e0ddd4' }}
              labelFormatter={d => d}
            />
            <Bar dataKey="count" name="Tickets" fill="#FFB800" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
