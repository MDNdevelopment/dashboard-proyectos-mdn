import { Delta } from './KpiMes'

/**
 * Videos (4K + Reel) vs. Fotos del mes: piezas capturadas y editadas por grupo, con delta
 * contra el mes anterior. Los números salen de `resumenMes`, así Video + Foto cuadra con los
 * KPI del mes y respeta la línea activa.
 */
export default function FotosVsVideos({ actual, anterior }) {
  const cols = [
    {
      key: 'video',
      title: 'Total de videos (4K + Reel)',
      cap: actual.capturadasVideo,
      edi: actual.editadasVideo,
      capAnt: anterior.capturadasVideo,
      ediAnt: anterior.editadasVideo,
      tone: 'text-[#3b6fd4]',
    },
    {
      key: 'foto',
      title: 'Total de fotos',
      cap: actual.capturadasFoto,
      edi: actual.editadasFoto,
      capAnt: anterior.capturadasFoto,
      ediAnt: anterior.editadasFoto,
      tone: 'text-[#1f8a43]',
    },
  ]
  return (
    <section
      className="bg-white border border-[#e0ddd4] rounded-xl p-5"
      aria-label="Videos vs. fotos del mes"
    >
      <h2 className="text-[16px] font-semibold text-[#222] mb-0.5">Videos vs. fotos</h2>
      <p className="text-[12px] text-[#999] mb-3">
        Piezas capturadas y editadas en el mes, con la comparación contra el mes anterior.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {cols.map((c) => {
          const pct = c.cap ? Math.min(100, Math.round((c.edi / c.cap) * 100)) : null
          return (
            <div
              key={c.key}
              className="rounded-xl border border-[#ece9df] bg-[#fcfbf7] px-4 py-3"
              aria-label={c.title}
            >
              <div className="text-[10.5px] font-mono uppercase tracking-wide text-[#999]">
                {c.title}
              </div>
              <div className={`font-mono font-bold text-[28px] leading-tight ${c.tone}`}>
                {c.cap}
              </div>
              <div className="text-[11px] text-[#999]">piezas capturadas</div>
              <div className="text-[11px] mt-0.5">
                <Delta cur={c.cap} ant={c.capAnt} mejorSi="sube" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono font-bold text-[18px] text-[#111]">{c.edi}</span>
                <span className="text-[11px] text-[#999]">editadas</span>
                <span className="ml-auto font-mono text-[12px] text-[#555]">
                  {pct === null ? '—' : `${pct}% editado`}
                </span>
              </div>
              <div className="h-[6px] bg-[#f0ede4] rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-[#1f8a43] rounded-full"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              <div className="text-[11px] mt-1">
                <Delta cur={c.edi} ant={c.ediAnt} mejorSi="sube" />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
