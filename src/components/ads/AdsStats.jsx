export default function AdsStats({ campaigns }) {
  const total = campaigns.length
  const uniqueClients = new Set(campaigns.map(c => c.client)).size
  const inProgress = campaigns.filter(c => c.status === 'En Curso').length
  const inReview = campaigns.filter(c => c.status === 'Revisión').length
  const completed = campaigns.filter(c => c.status === 'Finalizado' || c.status === 'Aprobado').length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  const cards = [
    {
      label: 'Total tácticas',
      value: total,
      sub: `${uniqueClients} cliente${uniqueClients !== 1 ? 's' : ''}`,
      accent: '#111',
    },
    {
      label: 'En Curso',
      value: inProgress,
      sub: 'activas',
      accent: '#f57f17',
    },
    {
      label: 'En Revisión',
      value: inReview,
      sub: 'pendientes de aprobación',
      accent: '#7b1fa2',
    },
    {
      label: 'Completadas',
      value: completed,
      sub: 'aprobadas + finalizadas',
      accent: '#2e7d32',
    },
    {
      label: 'Avance Global',
      value: `${progress}%`,
      sub: null,
      accent: '#1565c0',
      progress: progress,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map(card => (
        <div
          key={card.label}
          className="bg-white border border-[#e0ddd4] rounded-2xl p-4"
        >
          <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-1.5">
            {card.label}
          </p>
          <p className="text-[28px] font-bold leading-none" style={{ color: card.accent }}>
            {card.value}
          </p>
          {card.sub && (
            <p className="text-[13px] text-[#999] mt-1">{card.sub}</p>
          )}
          {card.progress != null && (
            <div className="mt-2 h-1.5 bg-[#f0ede3] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${card.progress}%`, backgroundColor: card.accent }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
