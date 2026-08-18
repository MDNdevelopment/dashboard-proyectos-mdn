import { useState, Fragment } from 'react'
import { supabase } from '../../supabase'
import { Avatar } from '../tareas/UserPickerSingle'
import {
  tasksForWeek,
  taskDeadline,
  taskAppliesToClient,
  TASK_LABELS,
  NETWORK_SHORT,
  clientNetworks,
} from '../../utils/fixedTasks'

const ORDER = ['si', 'no', 'na', null]
const STATUS_META = {
  si: { label: 'Entregado', dot: '#1f8a43', cls: 'bg-[#e9f7ec] border-[#bfe6c8] text-[#1f8a43]' },
  no: {
    label: 'No entregado',
    dot: '#c0392b',
    cls: 'bg-[#fdecec] border-[#f4c9c9] text-[#c0392b]',
  },
  na: { label: 'N/A', dot: '#a29b8c', cls: 'bg-[#f3f1ea] border-[#e6e2d8] text-[#a29b8c]' },
  null: { label: 'Pendiente', dot: '#d8d4c8', cls: 'bg-white border-[#e6e2d8] text-[#9a9488]' },
}

/** Label del estado; 'plataformas' usa "Completado"/"No completado" en vez de "Entregado". */
function statusLabel(status, isPlatform) {
  if (status === 'si') return isPlatform ? 'Completado' : 'Entregado'
  if (status === 'no') return isPlatform ? 'No completado' : 'No entregado'
  return STATUS_META[String(status)].label
}

const CONFLICT_TARGET = 'client_id,task_key,period_year,period_month,period_week,network'

/**
 * Grilla `cuenta × tarea` de la semana activa. Un clic tilda/cicla el estado
 * (pendiente → si → no → na → pendiente); si el estado queda en "si" se
 * despliega un input opcional para el enlace de la pieza/publicación.
 *
 * Props:
 *   lines, clients, companyUsers — roster ya acotado al alcance activo
 *   marks     — fixed_task_marks del mes (todas las semanas, ya filtradas por línea)
 *   weeks     — buildFixedWeeks(year, month)
 *   weekN     — semana activa
 *   canManage — si el usuario puede tildar (capability tareas.fijas.manage)
 *   onMarkChanged(mark) — { ...row } al crear/actualizar, o { id, _deleted:true } al borrar
 *   groupByLine — si true, agrupa las filas por línea con un encabezado por grupo
 */
export default function FixedTasksGrid({
  lines,
  clients,
  companyUsers,
  marks,
  weeks,
  weekN,
  year,
  month,
  companyId,
  canManage,
  userId,
  onMarkChanged,
  groupByLine,
}) {
  const [savingKey, setSavingKey] = useState(null)
  const [error, setError] = useState(null)

  const week = weeks.find((w) => w.n === weekN)
  const cols = week ? tasksForWeek(weekN, weeks) : []
  const usersById = new Map(companyUsers.map((u) => [u.user_id, u]))

  function findMark(clientId, taskKey, network = '') {
    return marks.find(
      (m) =>
        m.client_id === clientId &&
        m.task_key === taskKey &&
        m.period_week === weekN &&
        (m.network ?? '') === network,
    )
  }

  async function cycleStatus(client, taskKey, network = '') {
    if (!canManage || !week) return
    const key = `${client.id}:${taskKey}:${network}`
    const current = findMark(client.id, taskKey, network)
    const idx = ORDER.indexOf(current?.status ?? null)
    const next = ORDER[(idx + 1) % ORDER.length]
    setSavingKey(key)
    setError(null)

    if (next === null) {
      if (current) {
        const { error: err } = await supabase.from('fixed_task_marks').delete().eq('id', current.id)
        if (err) setError(err.message)
        else onMarkChanged({ id: current.id, _deleted: true })
      }
      setSavingKey(null)
      return
    }

    const payload = {
      company_id: companyId,
      client_id: client.id,
      line_id: client.line_id,
      task_key: taskKey,
      period_year: year,
      period_month: month,
      period_week: weekN,
      network,
      status: next,
      link: next === 'si' ? (current?.link ?? null) : null,
      marked_by: userId,
      marked_at: new Date().toISOString(),
    }
    const { data, error: err } = await supabase
      .from('fixed_task_marks')
      .upsert(payload, { onConflict: CONFLICT_TARGET })
      .select()
      .single()
    if (err) setError(err.message)
    else onMarkChanged(data)
    setSavingKey(null)
  }

  async function setLink(client, taskKey, value, network = '') {
    const current = findMark(client.id, taskKey, network)
    if (!current) return
    setError(null)
    const { data, error: err } = await supabase
      .from('fixed_task_marks')
      .update({ link: value || null })
      .eq('id', current.id)
      .select()
      .single()
    if (err) setError(err.message)
    else onMarkChanged(data)
  }

  if (!week) return null

  const groups = groupByLine ? lines : [{ id: '__single__', name: null }]

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-hidden mb-4">
      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-[13px] px-4 py-2.5">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[560px] sm:min-w-[880px]">
          <thead>
            <tr className="bg-[#faf8f2] border-b border-[#eee9dd]">
              <th className="sticky left-0 z-[2] bg-[#faf8f2] text-left text-[12px] font-mono uppercase tracking-wide text-[#a29b8c] font-medium px-2 py-3 min-w-[110px] sm:px-4 sm:min-w-[250px]">
                Cuenta
              </th>
              {cols.map((taskKey) => {
                const dl = taskDeadline(taskKey, week, year, month)
                return (
                  <th
                    key={taskKey}
                    className="text-center px-1.5 py-2.5 min-w-[112px] sm:px-2 sm:min-w-[152px] bg-[#faf8f2] align-bottom"
                  >
                    <div className="text-[13px] font-semibold text-[#333] leading-tight">
                      {TASK_LABELS[taskKey]}
                    </div>
                    {dl.date && (
                      <div className="text-[12px] font-mono text-[#b98900] mt-1">
                        {dl.date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} ·
                        5:00pm
                      </div>
                    )}
                    <div className="text-[10.5px] text-[#b3ac9d] mt-0.5">{dl.rule}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const rows = groupByLine
                ? clients.filter((c) => c.line_id === group.id)
                : [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es'))
              if (groupByLine && rows.length === 0) return null
              return (
                <Fragment key={group.id}>
                  {rows.map((client) => (
                    <tr key={client.id} className="border-b border-[#f2efe6] hover:bg-[#fcfbf6]">
                      <td className="sticky left-0 z-[1] bg-white px-2 py-2.5 min-w-[110px] sm:px-4 sm:min-w-[250px]">
                        <div className="text-[13px] sm:text-[14px] font-medium text-[#222] leading-tight mb-0 sm:mb-1.5">
                          {client.name}
                        </div>
                        <div className="hidden sm:flex items-center gap-3 flex-wrap">
                          {client.social_manager_id && usersById.get(client.social_manager_id) && (
                            <span
                              className="inline-flex items-center gap-1.5"
                              title={`Social: ${usersById.get(client.social_manager_id).first_name}`}
                            >
                              <Avatar user={usersById.get(client.social_manager_id)} size={20} />
                            </span>
                          )}
                          {client.designer_id && usersById.get(client.designer_id) && (
                            <span
                              className="inline-flex items-center gap-1.5"
                              title={`Diseñador: ${usersById.get(client.designer_id).first_name}`}
                            >
                              <Avatar user={usersById.get(client.designer_id)} size={20} />
                            </span>
                          )}
                        </div>
                      </td>
                      {cols.map((taskKey) => {
                        const applies = taskAppliesToClient(client.fixed_tasks, taskKey)
                        if (!applies) {
                          return (
                            <td key={taskKey} className="px-1.5 sm:px-2 py-2 text-center align-top">
                              <div
                                className="w-full h-[38px] rounded-lg border border-dashed border-[#e0dccf] bg-[#f7f5ef] flex items-center justify-center text-[#c3bcac]"
                                title="No aplica a esta cuenta (configurado en su ficha)"
                              >
                                —
                              </div>
                            </td>
                          )
                        }
                        if (taskKey === 'plataformas') {
                          const nets = clientNetworks(client)
                          return (
                            <td key={taskKey} className="px-1.5 sm:px-2 py-2 text-center align-top">
                              {nets.length === 0 ? (
                                <div
                                  className="h-[38px] flex items-center justify-center text-[12px] text-[#c3bcac]"
                                  title="Esta cuenta no tiene redes sociales cargadas en su ficha"
                                >
                                  sin redes
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {nets.map((network) => {
                                    const mark = findMark(client.id, 'plataformas', network)
                                    const status = mark?.status ?? null
                                    const sm = STATUS_META[String(status)]
                                    const key = `${client.id}:plataformas:${network}`
                                    return (
                                      <button
                                        key={network}
                                        type="button"
                                        disabled={!canManage || savingKey === key}
                                        onClick={() => cycleStatus(client, 'plataformas', network)}
                                        title={`${network} · ${statusLabel(status, true)}`}
                                        className={`min-w-[38px] h-[30px] px-1.5 rounded-md border flex items-center justify-center gap-1 text-[11px] font-semibold transition-all ${sm.cls} ${
                                          canManage
                                            ? 'cursor-pointer hover:opacity-80'
                                            : 'cursor-default'
                                        }`}
                                      >
                                        <span
                                          className="w-[6px] h-[6px] rounded-full"
                                          style={{ background: sm.dot }}
                                        />
                                        {NETWORK_SHORT[network] ?? network}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </td>
                          )
                        }
                        const mark = findMark(client.id, taskKey)
                        const status = mark?.status ?? null
                        const meta = STATUS_META[String(status)]
                        const key = `${client.id}:${taskKey}`
                        return (
                          <td key={taskKey} className="px-1.5 sm:px-2 py-2 text-center align-top">
                            <div className="flex flex-col gap-1.5">
                              <button
                                type="button"
                                disabled={!canManage || savingKey === key}
                                onClick={() => cycleStatus(client, taskKey)}
                                className={`w-full h-[38px] rounded-lg border flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-all ${meta.cls} ${
                                  canManage ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                                }`}
                              >
                                <span
                                  className="w-[7px] h-[7px] rounded-full"
                                  style={{ background: meta.dot }}
                                />
                                {statusLabel(status, false)}
                              </button>
                              {status === 'si' && canManage && (
                                <input
                                  type="url"
                                  placeholder="Pegar enlace…"
                                  defaultValue={mark?.link ?? ''}
                                  onBlur={(e) => setLink(client, taskKey, e.target.value.trim())}
                                  className="input-base text-[11.5px] py-1 px-2"
                                />
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-t border-[#eee9dd] text-[12.5px] text-[#777]">
        <span className="font-mono uppercase tracking-wide text-[#a29b8c] text-[11px]">
          {canManage
            ? 'Un clic para tildar · vuelve a hacer clic para cambiar el estado'
            : 'Solo lectura'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#1f8a43]" /> Entregado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#c0392b]" /> No entregado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#a29b8c]" /> N/A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#d8d4c8]" /> Pendiente
        </span>
      </div>
    </div>
  )
}
