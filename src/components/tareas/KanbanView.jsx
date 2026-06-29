import { isLate, fmtShort, ESTADOS, COL_META } from './constants'
import { Avatar } from './UserPickerSingle'
import { updateTaskStatus } from './taskStatus'

function KanbanCard({ task, usersMap, clientsById, onOpen, onChangeStatus }) {
  const late = isLate(task)
  const assignees = (task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])).map(id => usersMap.get(id)).filter(Boolean)
  const support = task.support_id ? usersMap.get(task.support_id) : null
  const logo = task.client_id ? clientsById?.get(task.client_id)?.logo_url : null

  return (
    <div
      className={`bg-white border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all group ${late ? 'border-red-200' : 'border-[#e0ddd4]'}`}
      onClick={() => onOpen(task)}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {late && <span className="text-red-400 flex-shrink-0">⚠</span>}
        {task.client ? (
          <>
            {logo ? (
              <img src={logo} alt={task.client} className="w-4 h-4 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]" />
            ) : (
              <span className="w-4 h-4 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-[#aaa] uppercase">{task.client[0]}</span>
            )}
            <p className="text-[14.5px] font-bold text-[#111] leading-tight truncate">{task.client}</p>
          </>
        ) : (
          <p className="text-[14.5px] font-bold text-[#111] leading-tight"><span className="text-[#bbb] font-normal">Sin cliente</span></p>
        )}
      </div>
      <p className="text-[14px] text-[#555] line-clamp-2 mb-2">{task.description}</p>
      {support && (
        <p className="text-[13px] text-[#888] mb-2">
          🤝 {support.first_name} {support.last_name}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {assignees.length > 0 ? (
          <div className="flex items-center gap-1">
            {assignees.slice(0, 3).map(a => (
              <Avatar key={a.user_id} user={a} size={18} />
            ))}
            {assignees.length > 3 && (
              <span className="text-[11px] font-mono text-[#888]">+{assignees.length - 3}</span>
            )}
            {assignees.length === 1 && (
              <span className="text-[13px] text-[#666] ml-0.5">{assignees[0].first_name} {assignees[0].last_name[0]}.</span>
            )}
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

export default function KanbanView({ team, tasks, usersMap, clientsById = new Map(), onOpenTask, onUpdated }) {
  if (!team) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[16px] font-medium text-[#888]">Selecciona un team para ver el Kanban</p>
      </div>
    )
  }

  const teamTasks = tasks.filter(t => t.team_id === team.id)

  async function handleChangeStatus(task, newStatus) {
    const { data, error } = await updateTaskStatus(task.id, newStatus)
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
                      clientsById={clientsById}
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
