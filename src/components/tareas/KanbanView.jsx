import { supabase } from '../../supabase'
import { isLate, fmtShort, ESTADOS, COL_META } from './constants'
import { Avatar } from './UserPickerSingle'

function KanbanCard({ tarea, usersMap, onOpen, onChangeEstatus }) {
  const late = isLate(tarea)
  const resp = tarea.responsable_id ? usersMap.get(tarea.responsable_id) : null
  const apoyo = tarea.apoyo_id ? usersMap.get(tarea.apoyo_id) : null

  return (
    <div
      className={`bg-white border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all group ${late ? 'border-red-200' : 'border-[#e0ddd4]'}`}
      onClick={() => onOpen(tarea)}
    >
      <p className="text-[12.5px] font-bold text-[#111] leading-tight mb-1">
        {late && <span className="text-red-400 mr-1">⚠</span>}
        {tarea.cliente || <span className="text-[#bbb] font-normal">Sin cliente</span>}
      </p>
      <p className="text-[12px] text-[#555] line-clamp-2 mb-2">{tarea.tarea}</p>
      {apoyo && (
        <p className="text-[11px] text-[#888] mb-2">
          🤝 {apoyo.first_name} {apoyo.last_name}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {resp ? (
          <div className="flex items-center gap-1.5">
            <Avatar user={resp} size={18} />
            <span className="text-[11px] text-[#666]">{resp.first_name} {resp.last_name[0]}.</span>
          </div>
        ) : <span />}
        {tarea.fecha_entrega && (
          <span className={`text-[11px] font-mono ${late ? 'text-red-500 font-bold' : 'text-[#999]'}`}>
            {late && '⚠ '}{fmtShort(tarea.fecha_entrega)}
          </span>
        )}
      </div>

      {/* Inline status changer */}
      <div className="mt-2 pt-2 border-t border-[#f0ede3]">
        <select
          className="w-full text-[11.5px] font-semibold border-none bg-transparent outline-none cursor-pointer"
          value={tarea.estatus}
          onClick={e => e.stopPropagation()}
          onChange={e => onChangeEstatus(tarea, e.target.value)}
          style={{ color: COL_META[tarea.estatus]?.color ?? '#888' }}
        >
          {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  )
}

export default function KanbanView({ team, tareas, usersMap, onOpenTask, onUpdated }) {
  if (!team) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[14px] font-medium text-[#888]">Selecciona un team para ver el Kanban</p>
      </div>
    )
  }

  const teamTareas = tareas.filter(t => t.team_id === team.id)

  async function handleChangeEstatus(tarea, nuevoEstatus) {
    const extra = nuevoEstatus === 'Terminado' ? { fecha_cierre: new Date().toISOString().slice(0, 10) } : { fecha_cierre: null }
    const { data, error } = await supabase
      .from('tareas')
      .update({ estatus: nuevoEstatus, ...extra })
      .eq('id', tarea.id)
      .select()
      .single()
    if (!error && data) onUpdated(data)
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {ESTADOS.map(estado => {
          const col = COL_META[estado]
          const cards = teamTareas.filter(t => t.estatus === estado)
          return (
            <div key={estado} className="w-64 flex-shrink-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: col.color }}
                />
                <span className="text-[12.5px] font-bold text-[#111]">{estado}</span>
                <span className="ml-auto text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#f0ede3] text-[#555]">
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[80px]">
                {cards.length === 0 ? (
                  <div className="border-2 border-dashed border-[#e0ddd4] rounded-xl p-4 text-center">
                    <p className="text-[11.5px] text-[#ccc]">Vacío</p>
                  </div>
                ) : (
                  cards.map(t => (
                    <KanbanCard
                      key={t.id}
                      tarea={t}
                      usersMap={usersMap}
                      onOpen={onOpenTask}
                      onChangeEstatus={handleChangeEstatus}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
