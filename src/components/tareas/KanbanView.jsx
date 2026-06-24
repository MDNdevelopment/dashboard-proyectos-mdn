import { supabase } from '../../supabase'
import { isLate, fmtShort, ESTADOS, COL_META } from './constants'
import { Avatar } from './UserPickerSingle'

function KanbanCard({ task, usersMap, onOpen, onChangeStatus }) {
  const late = isLate(task)
  const assignee = task.assignee_id ? usersMap.get(task.assignee_id) : null
  const support = task.support_id ? usersMap.get(task.support_id) : null

  return (
    <div
      className={`bg-white border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all group ${late ? 'border-red-200' : 'border-[#e0ddd4]'}`}
      onClick={() => onOpen(task)}
    >
      <p className="text-[14.5px] font-bold text-[#111] leading-tight mb-1">
        {late && <span className="text-red-400 mr-1">⚠</span>}
        {task.client || <span className="text-[#bbb] font-normal">Sin cliente</span>}
      </p>
      <p className="text-[14px] text-[#555] line-clamp-2 mb-2">{task.description}</p>
      {support && (
        <p className="text-[13px] text-[#888] mb-2">
          🤝 {support.first_name} {support.last_name}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {assignee ? (
          <div className="flex items-center gap-1.5">
            <Avatar user={assignee} size={18} />
            <span className="text-[13px] text-[#666]">{assignee.first_name} {assignee.last_name[0]}.</span>
          </div>
        ) : <span />}
        {task.due_date && (
          <span className={`text-[13px] font-mono ${late ? 'text-red-500 font-bold' : 'text-[#999]'}`}>
            {late && '⚠ '}{fmtShort(task.due_date)}
          </span>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-[#f0ede3]">
        <select
          className="w-full text-[13.5px] font-semibold border-none bg-transparent outline-none cursor-pointer"
          value={task.status}
          onClick={e => e.stopPropagation()}
          onChange={e => onChangeStatus(task, e.target.value)}
          style={{ color: COL_META[task.status]?.color ?? '#888' }}
        >
          {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  )
}

export default function KanbanView({ team, tasks, usersMap, onOpenTask, onUpdated }) {
  if (!team) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[16px] font-medium text-[#888]">Selecciona un team para ver el Kanban</p>
      </div>
    )
  }

  const teamTasks = tasks.filter(t => t.team_id === team.id)

  async function handleChangeStatus(task, newStatus) {
    const extra = newStatus === 'Terminado'
      ? { closed_date: new Date().toISOString().slice(0, 10) }
      : { closed_date: null }
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: newStatus, ...extra })
      .eq('id', task.id)
      .select()
      .single()
    if (!error && data) onUpdated(data)
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {ESTADOS.map(status => {
          const col = COL_META[status]
          const cards = teamTasks.filter(t => t.status === status)
          return (
            <div key={status} className="w-64 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                <span className="text-[14.5px] font-bold text-[#111]">{status}</span>
                <span className="ml-auto text-[13px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#f0ede3] text-[#555]">
                  {cards.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {cards.length === 0 ? (
                  <div className="border-2 border-dashed border-[#e0ddd4] rounded-xl p-4 text-center">
                    <p className="text-[13.5px] text-[#ccc]">Vacío</p>
                  </div>
                ) : (
                  cards.map(t => (
                    <KanbanCard
                      key={t.id}
                      task={t}
                      usersMap={usersMap}
                      onOpen={onOpenTask}
                      onChangeStatus={handleChangeStatus}
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
