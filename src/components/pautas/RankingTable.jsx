import Avatar from '../Avatar'

/**
 * Tabla genérica de ranking por persona: Capturadas / Editadas, con un desglose chico
 * opcional por fila (`renderDesglose(row)`).
 */
export default function RankingTable({ title, subtitle, rows, usersById, empty, renderDesglose }) {
  const anyEstimado = rows.some((r) => r.estimado)
  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl p-5" data-tour="datos-ranking">
      <h2 className="text-[16px] font-semibold text-[#222] mb-0.5">{title}</h2>
      {subtitle && <p className="text-[12px] text-[#999] mb-3">{subtitle}</p>}
      {rows.length === 0 ? (
        <p className="text-[13px] text-[#a29b8c]">{empty}</p>
      ) : (
        <>
          <table className="w-full text-[13px] border-collapse" aria-label={title}>
            <thead>
              <tr className="bg-[#fafaf7] border-b border-[#ece9df]">
                <Th>#</Th>
                <Th>Persona</Th>
                <Th right>Capturadas</Th>
                <Th right>Editadas</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const user = usersById?.get(r.id) ?? {
                  user_id: r.id,
                  first_name: r.name,
                  last_name: '',
                  avatar_url: null,
                }
                const desglose = renderDesglose?.(r)
                return (
                  <tr key={r.id} className="border-b border-[#f0ede3] last:border-0">
                    <td className="px-3 py-2.5 font-mono text-[12px] text-[#999] w-8">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-[140px]">
                        <Avatar user={user} size={26} />
                        <span className="font-semibold text-[#111] truncate">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-mono font-bold text-[15px] text-[#3b6fd4]">
                        {r.estimado && '≈ '}
                        {r.capturadas}
                      </div>
                      {desglose?.capturadas && (
                        <div className="text-[11px] text-[#999] mt-0.5">{desglose.capturadas}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-mono font-bold text-[15px] text-[#1f8a43]">
                        {r.editadas}
                      </div>
                      {desglose?.editadas && (
                        <div className="text-[11px] text-[#999] mt-0.5">{desglose.editadas}</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {anyEstimado && (
            <p className="text-[11px] text-[#a29b8c] mt-2">
              ≈ pauta antigua sin captura por persona: se le atribuye el total de la pauta a cada
              recurso.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Th({ children, right }) {
  return (
    <th
      className={`font-mono font-bold uppercase tracking-[0.1em] text-[11px] text-[#888] px-3 py-2 ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}
