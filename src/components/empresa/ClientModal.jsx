import { useState, useEffect, useRef, useMemo } from 'react'
import {
  createClient,
  updateClient,
  loadClientPrivate,
  upsertClientPrivate,
  cleanupClientAfterContractEnd,
  cancelPendingLineMove,
} from '../metricas/metricsApi'
import { SOCIAL_NETWORKS, MONTHS } from '../metricas/constants'
import AvatarUpload from './AvatarUpload'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { useAuth } from '../../context/AuthContext'
import { isFinancePrivileged } from '../../lib/permissions'
import UserPickerSingle from '../tareas/UserPickerSingle'
import UserPickerMulti from '../tareas/UserPickerMulti'
import { assignableUsers, flattenAssignable } from '../../utils/lineFilters'
import { EmployeeChip, EmployeeChipList } from '../common/EmployeeChip'
import DateInput from '../common/DateInput'
import MoverClienteModal from '../metricas/MoverClienteModal'
import { TASK_KEYS, TASK_LABELS } from '../../utils/fixedTasks'

/** Default: todas las tareas fijas activas para una cuenta nueva o sin configurar. */
function defaultFixedTasks() {
  return Object.fromEntries(TASK_KEYS.map((k) => [k, true]))
}

/**
 * Modal crear/editar/ver cliente (marca).
 * Convención: client=null → crear, client=objeto → editar/ver.
 * Props:
 *   client        — null = crear, objeto = editar/ver
 *   companyId     — string
 *   lines         — array de líneas disponibles para el selector
 *   employees     — array de empleados de la empresa (con department_id, position)
 *   readOnly      — bool: modo solo-lectura (default false)
 *   canManage     — bool: si el usuario puede editar (muestra botón "Editar" en readOnly)
 *   onRequestEdit — () => void: callback para salir del modo readOnly
 *   onClose()     — cierra el modal
 *   onSaved(row)  — recibe la fila guardada (para estado optimista en el padre)
 */
export default function ClientModal({
  client = null,
  companyId,
  lines = [],
  allLines = lines,
  employees = [],
  readOnly = false,
  canManage = true,
  onRequestEdit,
  onClose,
  onSaved,
}) {
  const isEdit = client != null
  const { userProfile } = useAuth()
  const privileged = isFinancePrivileged(userProfile)

  const [form, setForm] = useState(() => ({
    name: client?.name ?? '',
    logo_url: client?.logo_url ?? '',
    line_id: client?.line_id ?? '',
    payment_day: client?.payment_day ?? '',
    monthly_fee: client?.monthly_fee ?? '',
    campaign_budget: client?.campaign_budget ?? '',
    website: client?.website ?? '',
    social_links: client?.social_links ?? [],
    contacts: client?.contacts ?? [],
    anniversary_date: client?.anniversary_date ?? '',
    mdn_since: client?.mdn_since ?? '',
    contract_end: client?.contract_end ?? '',
    social_manager_id: client?.social_manager_id ?? null,
    designer_id: client?.designer_id ?? null,
    audiovisual_ids: client?.audiovisual_ids ?? [],
    apoyo_ids: client?.apoyo_ids ?? [],
    fixed_tasks: { ...defaultFixedTasks(), ...(client?.fixed_tasks ?? {}) },
    phone: '',
    instagram_email: '',
  }))
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({
    value: form,
    baseline: initialForm.current,
    onClose,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showMover, setShowMover] = useState(false)
  // Cambio de línea diferido pendiente (se aplica el 1° del próximo mes vía cron).
  const [pendingMove, setPendingMove] = useState(() =>
    client?.pending_line_id ? { lineId: client.pending_line_id, at: client.line_change_at } : null,
  )

  async function handleCancelPending() {
    if (!client?.id) return
    const { error: err } = await cancelPendingLineMove(client.id)
    if (err) {
      setError(err.message)
      return
    }
    setPendingMove(null)
    onSaved({ ...client, pending_line_id: null, line_change_at: null })
  }

  // Cliente existente que YA pertenece a una línea: cambiar de línea es un "movimiento"
  // con implicaciones de dinero (prorrateo) y de reportes, no una simple edición de campo.
  // Por eso se hace por el flujo dedicado (MoverClienteModal), no por el dropdown.
  const hasLine = isEdit && !!client?.line_id

  // Datos privados (teléfono / correo de Instagram) — solo nivel 3/4/admin.
  // Se cargan aparte porque viven en metric_client_private (RLS propia).
  useEffect(() => {
    if (!privileged || !isEdit) return
    let cancelled = false
    loadClientPrivate(client.id).then(({ data }) => {
      if (cancelled || !data) return
      const patch = { phone: data.phone ?? '', instagram_email: data.instagram_email ?? '' }
      setForm((f) => ({ ...f, ...patch }))
      // También actualizar el baseline: este dato llega async después del
      // primer render, así que sin esto useUnsavedChanges marcaría "cambios
      // sin guardar" solo por haber abierto el modal.
      initialForm.current = { ...initialForm.current, ...patch }
    })
    return () => {
      cancelled = true
    }
  }, [privileged, isEdit, client?.id])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  // Al cambiar de línea, resetear los empleados que ya no sean asignables en la línea
  // nueva (miembros de esa línea + pool "Independientes", que es asignable en cualquiera).
  function handleLineChange(newLineId) {
    const newLine = allLines.find((l) => l.id === newLineId) ?? null
    const { members, crossLine } = assignableUsers(employees, newLine, allLines)
    const stillAssignable = new Set([...members, ...crossLine].map((u) => u.user_id))
    setForm((f) => ({
      ...f,
      line_id: newLineId,
      social_manager_id: stillAssignable.has(f.social_manager_id) ? f.social_manager_id : null,
      designer_id: stillAssignable.has(f.designer_id) ? f.designer_id : null,
      audiovisual_ids: f.audiovisual_ids.filter((id) => stillAssignable.has(id)),
    }))
  }

  // Escape para cerrar
  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  // ── Redes sociales ────────────────────────────────────────────────────────────
  function addSocialLink() {
    set('social_links', [...form.social_links, { red: SOCIAL_NETWORKS[0], link: '' }])
  }

  function updateSocialLink(index, field, value) {
    const updated = form.social_links.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    )
    set('social_links', updated)
  }

  function removeSocialLink(index) {
    set(
      'social_links',
      form.social_links.filter((_, i) => i !== index),
    )
  }

  // ── Personas de la empresa ─────────────────────────────────────────────────────
  function addContact() {
    set('contacts', [...form.contacts, { name: '', role: '', birth_day: '', birth_month: '' }])
  }

  function updateContact(index, field, value) {
    const updated = form.contacts.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    )
    set('contacts', updated)
  }

  function removeContact(index) {
    set(
      'contacts',
      form.contacts.filter((_, i) => i !== index),
    )
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError('El nombre del cliente es obligatorio.')
      return
    }

    let payment_day = isEdit ? (client?.payment_day ?? null) : null
    let monthly_fee = isEdit ? (client?.monthly_fee ?? null) : null
    if (privileged) {
      payment_day = form.payment_day !== '' ? parseInt(form.payment_day, 10) : null
      if (payment_day !== null && (payment_day < 1 || payment_day > 31)) {
        setError('El día de pago debe estar entre 1 y 31.')
        return
      }
      monthly_fee = form.monthly_fee !== '' ? Number(form.monthly_fee) : null
    }
    const campaign_budget = form.campaign_budget !== '' ? Number(form.campaign_budget) : null

    setSaving(true)
    setError(null)

    const payload = {
      name,
      logo_url: form.logo_url || null,
      line_id: form.line_id || null,
      website: form.website.trim() || null,
      payment_day,
      monthly_fee,
      campaign_budget,
      social_links: form.social_links.filter((s) => s.link.trim()),
      contacts: form.contacts
        .filter((c) => c.name.trim())
        .map((c) => ({
          ...c,
          // Nunca guardar '' — rompía el cron de cumpleaños (''::int). Vacío = null.
          birth_day: c.birth_day === '' || c.birth_day == null ? null : Number(c.birth_day),
          birth_month: c.birth_month === '' || c.birth_month == null ? null : Number(c.birth_month),
        })),
      anniversary_date: form.anniversary_date || null,
      mdn_since: form.mdn_since || null,
      contract_end: form.contract_end || null,
      social_manager_id: form.social_manager_id || null,
      designer_id: form.designer_id || null,
      audiovisual_ids: form.audiovisual_ids,
      apoyo_ids: form.apoyo_ids,
      fixed_tasks: form.fixed_tasks,
    }

    let data, err
    if (isEdit) {
      ;({ data, error: err } = await updateClient(client.id, payload))
    } else {
      ;({ data, error: err } = await createClient(companyId, payload))
    }

    // Si se fijó/cambió el fin de contrato, limpiar los reportes ya guardados de los
    // meses posteriores al mes de fin (ahí la cuenta ya no debe aparecer).
    if (!err && payload.contract_end && payload.contract_end !== (client?.contract_end ?? null)) {
      const targetId = isEdit ? client.id : data?.id
      if (targetId) {
        const { error: cleanErr } = await cleanupClientAfterContractEnd(
          companyId,
          targetId,
          payload.contract_end,
        )
        if (cleanErr) err = cleanErr
      }
    }

    if (!err && privileged && data?.id) {
      const { error: privErr } = await upsertClientPrivate(data.id, {
        phone: form.phone.trim(),
        instagram_email: form.instagram_email.trim(),
      })
      if (privErr) err = privErr
    }

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved(data)
    onClose()
  }

  // ── Empleados filtrados por línea y departamento ───────────────────────────────
  const selectedLine = useMemo(
    () => lines.find((l) => l.id === form.line_id) ?? null,
    [lines, form.line_id],
  )
  const lineEmployees = useMemo(
    () => flattenAssignable(assignableUsers(employees, selectedLine, allLines)),
    [employees, selectedLine, allLines],
  )
  // dept_id 1 = Redes (Social), 3 = Diseño, 2 = Audiovisual
  const socialUsers = useMemo(
    () => lineEmployees.filter((u) => u.department_id === 1),
    [lineEmployees],
  )
  const designerUsers = useMemo(
    () => lineEmployees.filter((u) => u.department_id === 3),
    [lineEmployees],
  )
  const audiovisualUsers = useMemo(
    () => lineEmployees.filter((u) => u.department_id === 2),
    [lineEmployees],
  )

  // Para readOnly: resolver usuario por id
  const socialManagerUser = employees.find((u) => u.user_id === form.social_manager_id) ?? null
  const designerUser = employees.find((u) => u.user_id === form.designer_id) ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">
            {readOnly ? 'Detalle del cliente' : isEdit ? 'Editar cliente' : 'Nuevo cliente'}
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
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form
          id="client-form"
          onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit}
          className="px-6 py-5 space-y-5 overflow-y-auto flex-1"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Logo del cliente */}
          <div className="flex flex-col items-center">
            <AvatarUpload
              user={{
                first_name: form.name || 'C',
                last_name: '',
                avatar_url: form.logo_url || null,
              }}
              onUploaded={readOnly ? undefined : (url) => set('logo_url', url)}
              publicId={client?.id ? `clientes/client_${client.id}` : undefined}
              uploadPreset={import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET_LOGOS}
              size={96}
              label="Logo del cliente"
              disabled={readOnly}
            />
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Nombre *
            </label>
            <input
              type="text"
              className="input-base"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nombre del cliente / marca"
              autoFocus={!readOnly}
              disabled={readOnly}
            />
          </div>

          {/* Línea */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Línea operativa
            </label>
            {hasLine ? (
              // La cuenta ya tiene línea: se muestra fija y se cambia por el flujo "Mover de línea"
              // (prorratea el ingreso del mes y migra el operativo). Evita cambios silenciosos.
              <div className="flex items-center gap-2">
                <div className="input-base flex-1 flex items-center text-[#333]">
                  {lines.find((l) => l.id === form.line_id)?.name ?? 'Sin línea'}
                </div>
                {!readOnly && privileged && !pendingMove && (
                  <button
                    type="button"
                    onClick={() => setShowMover(true)}
                    className="flex-shrink-0 px-3 py-2 rounded-xl text-[13.5px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
                  >
                    Mover de línea…
                  </button>
                )}
              </div>
            ) : null}
            {hasLine && pendingMove && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[#FFB80055] bg-[#FFB80014] px-3 py-2">
                <span className="text-[13px] text-[#7a5b00]">
                  Programado: pasa a{' '}
                  <span className="font-semibold">
                    {lines.find((l) => l.id === pendingMove.lineId)?.name ?? 'otra línea'}
                  </span>{' '}
                  el {pendingMove.at}
                </span>
                {!readOnly && privileged && (
                  <button
                    type="button"
                    onClick={handleCancelPending}
                    className="flex-shrink-0 text-[12.5px] font-semibold text-[#b45309] hover:underline"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {!hasLine && (
              <select
                className="input-base"
                value={form.line_id}
                onChange={(e) => handleLineChange(e.target.value)}
                disabled={readOnly}
              >
                <option value="">Sin línea</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Equipo del cliente */}
          <div className="space-y-3">
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
              Equipo del cliente
            </label>

            {/* Social + Diseñador */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                  Social Asignado
                </p>
                {readOnly ? (
                  <EmployeeChip user={socialManagerUser} />
                ) : (
                  <UserPickerSingle
                    users={form.line_id ? socialUsers : []}
                    selectedId={form.social_manager_id}
                    onChange={(id) => set('social_manager_id', id)}
                    placeholder={form.line_id ? 'Seleccionar...' : 'Selecciona una línea primero'}
                    clearable
                  />
                )}
              </div>
              <div>
                <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                  Diseñador Asignado
                </p>
                {readOnly ? (
                  <EmployeeChip user={designerUser} />
                ) : (
                  <UserPickerSingle
                    users={form.line_id ? designerUsers : []}
                    selectedId={form.designer_id}
                    onChange={(id) => set('designer_id', id)}
                    placeholder={form.line_id ? 'Seleccionar...' : 'Selecciona una línea primero'}
                    clearable
                  />
                )}
              </div>
            </div>

            {/* Audiovisual */}
            <div>
              <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                Audiovisual
              </p>
              {readOnly ? (
                <EmployeeChipList userIds={form.audiovisual_ids} employees={employees} />
              ) : (
                <UserPickerMulti
                  users={form.line_id ? audiovisualUsers : []}
                  selectedIds={form.audiovisual_ids}
                  onChange={(ids) => set('audiovisual_ids', ids)}
                  placeholder={
                    form.line_id ? 'Agregar audiovisual...' : 'Selecciona una línea primero'
                  }
                />
              )}
            </div>

            {/* Apoyo — cualquier empleado de la empresa */}
            <div>
              <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                Apoyo
              </p>
              {readOnly ? (
                <EmployeeChipList userIds={form.apoyo_ids} employees={employees} />
              ) : (
                <UserPickerMulti
                  users={employees}
                  selectedIds={form.apoyo_ids}
                  onChange={(ids) => set('apoyo_ids', ids)}
                  placeholder="Agregar apoyo..."
                />
              )}
            </div>
          </div>

          {/* Día de pago + Mensualidad — solo nivel 4 / admin */}
          {privileged && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                  Día de pago
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="input-base"
                  value={form.payment_day}
                  onChange={(e) => set('payment_day', e.target.value)}
                  placeholder="1–31"
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                  Mensualidad (USD)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input-base"
                  value={form.monthly_fee}
                  onChange={(e) => set('monthly_fee', e.target.value)}
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
            </div>
          )}

          {/* Presupuesto mensual para campañas (Ads) — visible para todos */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Presupuesto mensual campañas (USD)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="input-base"
              value={form.campaign_budget}
              onChange={(e) => set('campaign_budget', e.target.value)}
              placeholder="0.00"
              disabled={readOnly}
            />
          </div>

          {/* Sitio web */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Sitio web
            </label>
            <input
              type="url"
              className="input-base"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://..."
              disabled={readOnly}
            />
          </div>

          {/* Aniversario + Cliente desde MDN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Aniversario empresa
              </label>
              <DateInput
                value={form.anniversary_date}
                onChange={(v) => set('anniversary_date', v)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Cliente MDN desde
              </label>
              <DateInput
                value={form.mdn_since}
                onChange={(v) => set('mdn_since', v)}
                disabled={readOnly}
              />
            </div>
          </div>

          {/* Fin de contrato */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Fin de contrato
            </label>
            <DateInput
              value={form.contract_end}
              onChange={(v) => set('contract_end', v)}
              disabled={readOnly}
            />
            <p className="text-[12px] text-[#999] mt-1">
              Último mes bajo contrato. Desde el mes siguiente la cuenta deja de aparecer en los
              reportes (los meses ya cerrados no se modifican).
            </p>
          </div>

          {/* Tareas fijas aplicables — qué tareas recurrentes se tildan para esta cuenta
              en Gestión de Tareas → Tareas Fijas. Default: todas activas. */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Tareas fijas aplicables
            </label>
            <div className="flex flex-wrap gap-2">
              {TASK_KEYS.map((key) => {
                const active = form.fixed_tasks[key] !== false
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={readOnly}
                    onClick={() => set('fixed_tasks', { ...form.fixed_tasks, [key]: !active })}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-all ${
                      active
                        ? 'bg-[#e9f7ec] border-[#bfe6c8] text-[#1f8a43]'
                        : 'bg-[#f3f1ea] border-[#e6e2d8] text-[#a29b8c]'
                    } ${readOnly ? 'cursor-default' : ''}`}
                  >
                    {TASK_LABELS[key]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Personas de la empresa */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                Personas de la empresa
              </label>
              {!readOnly && (
                <button
                  type="button"
                  onClick={addContact}
                  className="flex items-center gap-1 text-[13px] font-semibold text-[#FAB51A] hover:text-[#d49800] transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                  </svg>
                  Agregar
                </button>
              )}
            </div>

            {form.contacts.length === 0 ? (
              <p className="text-[13.5px] text-[#bbb] py-2">Sin personas agregadas.</p>
            ) : (
              <div className="space-y-2">
                {form.contacts.map((contact, i) => (
                  <div
                    key={i}
                    className="bg-[#faf9f5] rounded-xl p-3 space-y-2 border border-[#ece9df]"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input-base flex-1 text-[13.5px]"
                        value={contact.name}
                        onChange={(e) => updateContact(i, 'name', e.target.value)}
                        placeholder="Nombre completo..."
                        disabled={readOnly}
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeContact(i)}
                          className="flex-shrink-0 text-[#ccc] hover:text-red-400 transition-colors p-1"
                          aria-label="Quitar persona"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 13 13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M2 2l9 9M11 2L2 11" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                          Cargo
                        </p>
                        <input
                          type="text"
                          className="input-base text-[13px]"
                          value={contact.role}
                          onChange={(e) => updateContact(i, 'role', e.target.value)}
                          placeholder="Ej. Gerente de marca"
                          disabled={readOnly}
                        />
                      </div>
                      <div>
                        <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                          Cumpleaños
                        </p>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={31}
                            className="input-base text-[13px] !w-16 flex-shrink-0"
                            value={contact.birth_day}
                            onChange={(e) => updateContact(i, 'birth_day', e.target.value)}
                            placeholder="Día"
                            disabled={readOnly}
                          />
                          <select
                            className="input-base text-[13px] flex-1 min-w-0"
                            value={contact.birth_month}
                            onChange={(e) => updateContact(i, 'birth_month', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="">Mes</option>
                            {MONTHS.map((m, idx) => (
                              <option key={idx + 1} value={idx + 1}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Redes sociales */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                Redes sociales
              </label>
              {!readOnly && (
                <button
                  type="button"
                  onClick={addSocialLink}
                  className="flex items-center gap-1 text-[13px] font-semibold text-[#FAB51A] hover:text-[#d49800] transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 1v10M1 6h10" strokeLinecap="round" />
                  </svg>
                  Agregar
                </button>
              )}
            </div>

            {form.social_links.length === 0 ? (
              <p className="text-[13.5px] text-[#bbb] py-2">Sin redes sociales configuradas.</p>
            ) : (
              <div className="space-y-2">
                {form.social_links.map((item, i) => (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2"
                  >
                    <select
                      className="input-base w-full sm:w-32 flex-shrink-0 text-[13.5px]"
                      value={item.red}
                      onChange={(e) => updateSocialLink(i, 'red', e.target.value)}
                      disabled={readOnly}
                    >
                      {SOCIAL_NETWORKS.map((net) => (
                        <option key={net} value={net}>
                          {net}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {readOnly && item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0 text-[13.5px] text-[#3B6FE0] hover:underline truncate"
                        >
                          {item.link}
                        </a>
                      ) : (
                        <input
                          type="url"
                          className="input-base flex-1 min-w-0 text-[13.5px]"
                          value={item.link}
                          onChange={(e) => updateSocialLink(i, 'link', e.target.value)}
                          placeholder="https://..."
                          disabled={readOnly}
                        />
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeSocialLink(i)}
                          className="flex-shrink-0 text-[#ccc] hover:text-red-400 transition-colors p-1"
                          aria-label="Quitar red"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 13 13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M2 2l9 9M11 2L2 11" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Datos privados (cuenta de Instagram) — solo nivel 3/4/admin */}
          {privileged && (
            <div className="bg-[#FFB80014] border border-[#FFB80055] rounded-xl p-4">
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-3">
                Datos privados (cuenta de Instagram)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                    Teléfono
                  </p>
                  <input
                    type="tel"
                    className="input-base"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="+58 412 0000000"
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">
                    Correo de Instagram
                  </p>
                  <input
                    type="email"
                    className="input-base"
                    value={form.instagram_email}
                    onChange={(e) => set('instagram_email', e.target.value)}
                    placeholder="cuenta@ejemplo.com"
                    disabled={readOnly}
                  />
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Acciones */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-[#ece9df]">
          {readOnly ? (
            <>
              <button
                type="button"
                onClick={requestClose}
                className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
              >
                Cerrar
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={onRequestEdit}
                  className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
                >
                  Editar
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={requestClose}
                className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="client-form"
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </>
          )}
        </div>
      </div>

      {showMover && (
        <MoverClienteModal
          client={client}
          lines={lines}
          employees={employees}
          companyId={companyId}
          onClose={() => setShowMover(false)}
          onMoved={(updated) => {
            setShowMover(false)
            if (updated) onSaved(updated)
            onClose()
          }}
        />
      )}
    </div>
  )
}
