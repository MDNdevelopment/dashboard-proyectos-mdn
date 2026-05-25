import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { STATUS } from '../constants'

const STATUS_COLORS = {
  abierto:     '#1565c0',
  en_progreso: '#f57f17',
  resuelto:    '#2e7d32',
}

const LABEL_MAP = {
  abierto:     STATUS.abierto.label,
  en_progreso: STATUS.en_progreso.label,
  resuelto:    STATUS.resuelto.label,
}

export default function StatusPieChart({ data }) {
  const named = data.map(d => ({ ...d, name: LABEL_MAP[d.name] ?? d.name }))

  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
      <p className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">Estado</p>
      {data.length === 0 ? (
        <p className="text-[13px] text-[#aaa] text-center py-8">Sin datos</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={named}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
            >
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#ccc'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, fontFamily: 'DM Mono, monospace', borderRadius: 8, border: '1px solid #e0ddd4' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, fontFamily: 'DM Mono, monospace' }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
