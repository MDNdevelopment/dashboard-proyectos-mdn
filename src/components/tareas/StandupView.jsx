import { useState } from 'react'
import { isoWeek, taskWeek, isClosed, isLate, isDragged, isBlocked, daysBetween, parseD, today, fmtShort, COL_META } from './constants'
import { Avatar } from './UserPickerSingle'

function FocusItem({ tarea, why, icon, usersMap, onOpen }) {
  const resp = tarea.responsable_id ? usersMap.get(tarea.responsable_id) : null
  return (
    <div
      className="flex items-start gap-3 p-3 bg-white rounded-xl border border-[#e0ddd4] hover:border-[#FFB800] cursor-pointer transition-colors"
      onClick={() => onOpen(tarea)}
    >
      <span className="text-[16px] flex-shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-[#111] truncate">{tarea.cliente || 'Sin cliente'}</p>
        <p className="text-[12px] text-[#555] line-clamp-2">{tarea.tarea}</p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: (COL_META[tarea.estatus]?.color ?? '#ccc') + '22', color: COL_META[tarea.estatus]?.color ?? '#888' }}
          >
            {why}
          </span>
          {resp && (
            <span className="flex items-center gap-1 text-[11px] text-[#888]">
              <Avatar user={resp} size={14} />
              {resp.first_name}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onOpen(tarea) }}
        className="text-[11px] font-semibold text-[#888] hover:text-[#111] transition-colors flex-shrink-0"
      >
        Abrir
      </button>
    </div>
  )
}

export default function StandupView({ team, tareas, teams, usersMap, onOpenTask }) {
  const [copied, setCopied] = useState(false)
  const wk = isoWeek(new Date())

  if (!team) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[14px] font-medium text-[#888]">Selecciona un team para ver el Stand-up</p>
      </div>
    )
  }

  const all = tareas.filter(t => t.team_id === team.id)
  const thisWeek = all.filter(t => taskWeek(t) === wk)
  const cerradas = thisWeek.filter(isClosed)
  const bloqueadas = all.filter(t => !isClosed(t) && isBlocked(t))
  const porRevisar = all.filter(t => !isClosed(t) && t.estatus === 'Por revisar')
  const arrastradas = all.filter(t => !isClosed(t) && !isBlocked(t) && (isLate(t) || (isDragged(t) && !porRevisar.find(x => x.id === t.id))))
  const apoyoList = all.filter(t => t.apoyo_id && !isClosed(t))

  function userName(id) {
    const u = usersMap.get(id)
    return u ? `${u.first_name} ${u.last_name}` : '—'
  }

  function buildReport() {
    const lines = []
    lines.push(`📋 Stand-up Team ${team.name} — Semana ${wk}`)
    lines.push('')
    lines.push(`✅ Cerradas esta semana: ${cerradas.length}/${thisWeek.length}`)
    if (cerradas.length) {
      cerradas.forEach(t => { lines.push(`  • ${t.cliente || '(sin cliente)'} — ${t.tarea}`) })
    }
    if (bloqueadas.length) {
      lines.push('')
      lines.push('🔴 Bloqueadas:')
      bloqueadas.forEach(t => { lines.push(`  • ${t.cliente || '(sin cliente)'} — ${t.tarea}`) })
    }
    if (porRevisar.length) {
      lines.push('')
      lines.push('🔵 Por revisar:')
      porRevisar.forEach(t => { lines.push(`  • ${t.cliente || '(sin cliente)'} — ${t.tarea}`) })
    }
    if (arrastradas.length) {
      lines.push('')
      lines.push('⏳ Pendientes arrastrados:')
      arrastradas.forEach(t => {
        const why = isLate(t) ? `Entrega vencida (${fmtShort(t.fecha_entrega)})` : `Arrastrada ${daysBetween(parseD(t.fecha_solicitud), today())} días`
        lines.push(`  • ${t.cliente || '(sin cliente)'} — ${t.tarea} (${why})`)
      })
    }
    if (apoyoList.length) {
      lines.push('')
      lines.push('🤝 Apoyo de dirección:')
      apoyoList.forEach(t => { lines.push(`  • ${t.cliente || '(sin cliente)'} — ${t.tarea} → ${userName(t.apoyo_id)}`) })
    }
    return lines.join('\n')
  }

  function copyReport() {
    navigator.clipboard.writeText(buildReport()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const hasFocus = bloqueadas.length + porRevisar.length + arrastradas.length + apoyoList.length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-bold text-[#111]">Stand-up · Team {team.name}</h2>
          <p className="text-[12.5px] text-[#888]">Semana {wk}</p>
        </div>
        <button
          onClick={copyReport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#e0ddd4] text-[13px] font-semibold text-[#555] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors"
        >
          {copied ? (
            <>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#16A34A" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              ¡Copiado!
            </>
          ) : (
            <>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              Copiar para WhatsApp
            </>
          )}
        </button>
      </div>

      {/* Week summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Planificadas', value: thisWeek.length, color: undefined },
          { label: 'Cerradas', value: cerradas.length, color: '#16A34A' },
          { label: 'Bloqueadas', value: bloqueadas.length, color: bloqueadas.length ? '#E14848' : undefined },
          { label: 'Apoyo dir.', value: apoyoList.length, color: apoyoList.length ? '#F0871F' : undefined },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3">
            <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1">{k.label}</p>
            <p className="text-[22px] font-bold leading-none" style={{ color: k.color ?? '#111' }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Focus lists */}
      {hasFocus === 0 && cerradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-8 text-center">
          <p className="text-[14px] font-medium text-[#888]">Sin movimiento esta semana</p>
          <p className="text-[12px] text-[#bbb] mt-1">Cuando se carguen tareas aparecerán aquí los puntos de foco</p>
        </div>
      ) : (
        <>
          {bloqueadas.length > 0 && (
            <section>
              <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#E14848] mb-2">🔴 Bloqueadas ({bloqueadas.length})</p>
              <div className="space-y-2">
                {bloqueadas.map(t => (
                  <FocusItem key={t.id} tarea={t} why="Bloqueado" icon="🔴" usersMap={usersMap} onOpen={onOpenTask} />
                ))}
              </div>
            </section>
          )}
          {porRevisar.length > 0 && (
            <section>
              <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#3B6FE0] mb-2">🔵 Por revisar ({porRevisar.length})</p>
              <div className="space-y-2">
                {porRevisar.map(t => (
                  <FocusItem key={t.id} tarea={t} why="Necesita revisión" icon="🔵" usersMap={usersMap} onOpen={onOpenTask} />
                ))}
              </div>
            </section>
          )}
          {arrastradas.length > 0 && (
            <section>
              <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#F0871F] mb-2">⏳ Arrastradas / atrasadas ({arrastradas.length})</p>
              <div className="space-y-2">
                {arrastradas.map(t => {
                  const why = isLate(t)
                    ? `Entrega vencida ${fmtShort(t.fecha_entrega)}`
                    : `Arrastrada ${daysBetween(parseD(t.fecha_solicitud), today())} días`
                  return <FocusItem key={t.id} tarea={t} why={why} icon="⏳" usersMap={usersMap} onOpen={onOpenTask} />
                })}
              </div>
            </section>
          )}
          {apoyoList.length > 0 && (
            <section>
              <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-2">🤝 Apoyo de dirección ({apoyoList.length})</p>
              <div className="space-y-2">
                {apoyoList.map(t => {
                  const apoyo = usersMap.get(t.apoyo_id)
                  const why = apoyo ? `Apoyo: ${apoyo.first_name} ${apoyo.last_name}` : 'Apoyo de dirección'
                  return <FocusItem key={t.id} tarea={t} why={why} icon="🤝" usersMap={usersMap} onOpen={onOpenTask} />
                })}
              </div>
            </section>
          )}
          {cerradas.length > 0 && (
            <section>
              <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#16A34A] mb-2">✅ Cerradas esta semana ({cerradas.length})</p>
              <div className="space-y-1">
                {cerradas.map(t => (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    className="flex items-center gap-3 px-3 py-2 bg-[#f0fdf4] border border-[#dcfce7] rounded-xl cursor-pointer hover:border-[#16A34A]/30 transition-colors"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#16A34A" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    <span className="text-[12.5px] font-medium text-[#111]">{t.cliente || '(sin cliente)'}</span>
                    <span className="text-[12px] text-[#555] flex-1 truncate">— {t.tarea}</span>
                    {t.fecha_cierre && <span className="text-[11px] font-mono text-[#888]">{fmtShort(t.fecha_cierre)}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Report preview */}
      <section className="bg-[#faf9f5] border border-[#e0ddd4] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e0ddd4] bg-white">
          <p className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">Reporte para WhatsApp</p>
          <button
            onClick={copyReport}
            className="text-[11.5px] font-semibold text-[#888] hover:text-[#111] transition-colors"
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
        <pre className="px-4 py-3 text-[12px] text-[#555] whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
          {buildReport()}
        </pre>
      </section>
    </div>
  )
}
