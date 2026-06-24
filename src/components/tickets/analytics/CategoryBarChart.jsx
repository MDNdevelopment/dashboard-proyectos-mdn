import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CATEGORY } from '../constants'

export default function CategoryBarChart({ data }) {
  const named = data.map(d => ({ ...d, name: CATEGORY[d.name]?.label ?? d.name }))

  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
      <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">Por categoria</p>
      {data.length === 0 ? (
        <p className="text-[15px] text-[#aaa] text-center py-8">Sin datos</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={named} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 10, fontFamily: 'DM Mono, monospace', fill: '#888' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={70}
              tick={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fill: '#555' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, fontFamily: 'DM Mono, monospace', borderRadius: 8, border: '1px solid #e0ddd4' }}
            />
            <Bar dataKey="value" name="Tickets" fill="#FFB800" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
