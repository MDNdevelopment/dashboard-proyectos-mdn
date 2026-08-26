import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ESTADOS } from './constants'
import {
  createCnp,
  updateCnp,
  softDeleteCnp,
  setTeamCheck,
  setPrintApproval,
  closeBlockedReason,
} from './cnpApi'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import UserPickerSingle from '../tareas/UserPickerSingle'
import { teamMemberUsers } from '../../utils/lineFilters'
import DateInput from '../common/DateInput'

const EMPTY = {
  client_id: '',
  title: '',
  content: '',
  assignee_id: null,
  refs: [],
  notes: '',
  due_date: '',
  is_print: false,
  status: 'Pendiente',
}

function newRef() {
  return { id: crypto.randomUUID(), url: '', note: '' }
}

export default function CnpModal({
  cnp = null,
  team = null,
  clients = [],
  users = [],
  onClose,
  onCreated,
  onUpdated,
}) {
  const { userProfile, can = () => true } = useAuth()
  const isEdit = cnp != null
  const canApprovePrint = can('cnp.print.approve')

  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        client_id: cnp.client_id ?? '',
        title: cnp.title ?? '',
        content: cnp.content ?? '',
        assignee_id: cnp.assignee_id ?? null,
        refs: cnp.refs ?? [],
        notes: cnp.notes ?? '',
        due_date: cnp.due_date ?? '',
        is_print: cnp.is_print ?? false,
        status: cnp.status ?? 'Pendiente',
      }
    }
    return { ...EMPTY }
  })
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({
    value: form,
    baseline: initialForm.current,
    onClose,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [checkBusy, setCheckBusy] = useState(false)
  // El doble check (team_checked_at/print_approved_at) se actualiza en Supabase pero el
  // prop `cnp` es un snapshot fijo del momento en que se abrió el modal — sin este estado
  // local, el checkbox de "Revisión del equipo" parecía no responder al marcarlo (el valor
  // en pantalla nunca reflejaba la respuesta del servidor).
  const [liveCnp, setLiveCnp] = useState(cnp)

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const teamMembers = teamMemberUsers(users, team)

  const lineClients = team?.is_general ? clients : clients.filter((c) => c.line_id === team?.id)

  const blockedReason = isEdit ? closeBlockedReason({ ...liveCnp, ...form }) : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.client_id) {
      setError('Selecciona un cliente')
      return
    }
    if (!form.title?.trim()) {
      setError('El título es obligatorio')
      return
    }
    if (!form.assignee_id) {
      setError('Selecciona un responsable')
      return
    }
    if (form.status === 'Terminado' && blockedReason) {
      setError(blockedReason)
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      company_id: userProfile?.company_id ?? '',
      line_id: team?.id ?? null,
      client_id: form.client_id,
      title: form.title.trim(),
      content: form.content || null,
      assignee_id: form.assignee_id,
      refs: (form.refs ?? []).filter((r) => r.url?.trim()),
      notes: form.notes || null,
      due_date: form.due_date || null,
      is_print: form.is_print,
      status: form.status,
      created_by: isEdit ? cnp.created_by : (userProfile?.user_id ?? null),
    }

    if (isEdit) {
      const { data, error: err } = await updateCnp(cnp.id, payload)
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      onUpdated(data)
    } else {
      const { data, error: err } = await createCnp(payload)
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      onCreated(data)
    }
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el CNP "${cnp.title}"? No se puede deshacer.`)) return
    const { error: err } = await softDeleteCnp(cnp.id)
    if (err) {
      setError(err.message)
      return
    }
    onUpdated({ ...cnp, _deleted: true })
    onClose()
  }

  async function toggleTeamCheck(checked) {
    setCheckBusy(true)
    const { data, error: err } = await setTeamCheck(cnp.id, checked, userProfile?.user_id ?? null)
    setCheckBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setLiveCnp(data)
    onUpdated(data)
  }

  async function togglePrintApproval(approved) {
    setCheckBusy(true)
    const { data, error: err } = await setPrintApproval(
      cnp.id,
      approved,
      userProfile?.user_id ?? null,
    )
    setCheckBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setLiveCnp(data)
    // La aprobación de impresión dispara en la BD el cambio de status a "Terminado" y la
    // notificación al creador (trigger notify_cnp_print_approved) — reflejar el status
    // devuelto en el formulario para no dejarlo desincronizado del select de abajo.
    if (data.status !== form.status) set('status', data.status)
    onUpdated(data)
  }

  function addRef() {
    set('refs', [...(form.refs ?? []), newRef()])
  }
  function updateRef(id, patch) {
    set(
      'refs',
      (form.refs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    )
  }
  function removeRef(id) {
    set(
      'refs',
      (form.refs ?? []).filter((r) => r.id !== id),
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {isEdit ? 'Editar CNP' : 'Nuevo CNP'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form id="cnp-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="cnp-client"
                className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5"
              >
                Cliente *
              </label>
              <select
                id="cnp-client"
                className="input-base"
                value={form.client_id}
                onChange={(e) => set('client_id', e.target.value)}
                required
              >
                <option value="">Seleccionar cliente...</option>
                {lineClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {lineClients.length === 0 && (
                <p className="text-[12.5px] text-[#bbb] mt-1">
                  No hay clientes en esta línea. Agrégalos en <strong>Empresa → Clientes</strong>.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Título *
              </label>
              <input
                className="input-base"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Ej. Creatina con sello de calidad"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Contenido / copy
                <span className="ml-1 font-normal normal-case text-[#bbb]">(opcional)</span>
              </label>
              <textarea
                className="input-base"
                rows={4}
                value={form.content}
                onChange={(e) => set('content', e.target.value)}
                placeholder="Pega aquí el copy tal cual llega por WhatsApp..."
              />
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Responsable *
              </label>
              <UserPickerSingle
                users={teamMembers}
                selectedId={form.assignee_id}
                onChange={(id) => set('assignee_id', id)}
                placeholder="Asignar diseñador..."
                clearable={false}
              />
              {teamMembers.length === 0 && (
                <p className="text-[12.5px] text-[#bbb] mt-1">
                  No hay miembros en esta línea. Agrégalos en <strong>Empresa → Líneas</strong>.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                  Referencias
                  <span className="ml-1 font-normal normal-case text-[#bbb]">(opcional)</span>
                </label>
                <button
                  type="button"
                  onClick={addRef}
                  className="flex items-center gap-1 text-[13px] font-semibold text-[#555] hover:text-[#111] transition-colors"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.8"
                  >
                    <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                  </svg>
                  Agregar
                </button>
              </div>
              {(form.refs ?? []).length === 0 ? (
                <p className="text-[13px] text-[#bbb]">Sin referencias.</p>
              ) : (
                <div className="space-y-2">
                  {form.refs.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <input
                        className="input-base flex-1"
                        value={r.url}
                        onChange={(e) => updateRef(r.id, { url: e.target.value })}
                        placeholder="https://instagram.com/p/..."
                      />
                      <button
                        type="button"
                        onClick={() => removeRef(r.id)}
                        className="text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0"
                        aria-label="Quitar referencia"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Notas
                <span className="ml-1 font-normal normal-case text-[#bbb]">(opcional)</span>
              </label>
              <textarea
                className="input-base"
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Ej. Válido del 14/08 al 17/08, solo en divisas, 2 por persona..."
              />
            </div>

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Fecha de entrega
                <span className="ml-1 font-normal normal-case text-[#bbb]">(opcional)</span>
              </label>
              <DateInput value={form.due_date} onChange={(v) => set('due_date', v)} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[#ece9df] bg-[#fafaf8] px-3 py-2.5">
              <div>
                <p className="text-[15px] font-medium text-[#111]">¿Es impreso?</p>
                <p className="text-[12.5px] text-[#888]">
                  Requiere doble aprobación antes de cerrarse.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_print}
                onClick={() => set('is_print', !form.is_print)}
                className={`inline-flex items-center flex-shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                  form.is_print ? 'bg-[#FFB800]' : 'bg-[#e0ddd4]'
                }`}
              >
                <span
                  className={`inline-block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    form.is_print ? 'translate-x-[20px]' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isEdit && form.is_print && (
              <div className="rounded-xl border border-[#ece9df] p-3 space-y-2">
                <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                  Doble check de impresión
                </p>
                <label className="flex items-center gap-2.5 text-[14.5px] text-[#333]">
                  <input
                    type="checkbox"
                    checked={Boolean(liveCnp.team_checked_at)}
                    disabled={checkBusy}
                    onChange={(e) => toggleTeamCheck(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#111] cursor-pointer"
                  />
                  Revisión del equipo
                  {liveCnp.team_checked_at && (
                    <span className="text-[12px] font-mono text-[#aaa]">
                      —{' '}
                      {new Date(liveCnp.team_checked_at).toLocaleString('es-VE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  )}
                </label>
                <label
                  className={`flex items-center gap-2.5 text-[14.5px] ${
                    !liveCnp.team_checked_at || !canApprovePrint ? 'text-[#bbb]' : 'text-[#333]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(liveCnp.print_approved_at)}
                    disabled={checkBusy || !liveCnp.team_checked_at || !canApprovePrint}
                    onChange={(e) => togglePrintApproval(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#111] cursor-pointer disabled:cursor-not-allowed"
                  />
                  Aprobación de impresión
                  <span className="text-[12px] text-[#bbb]">— solo Paola / Stephanie</span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Estatus
              </label>
              <select
                className="input-base"
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {form.status === 'Terminado' && blockedReason && (
                <p className="text-[12.5px] text-[#F0871F] mt-1">{blockedReason}</p>
              )}
            </div>
          </form>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-[#ece9df]">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              className="text-[15px] font-semibold text-red-500 hover:text-red-700 transition-colors"
            >
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="cnp-form"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear CNP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
