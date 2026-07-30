import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient, updateClient, loadClientPrivate, upsertClientPrivate } from '../metricas/metricsApi'
import { SOCIAL_NETWORKS, MONTHS } from '../metricas/constants'
import AvatarUpload from './AvatarUpload'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { useAuth } from '../../context/AuthContext'
import { isFinancePrivileged } from '../../lib/permissions'
import UserPickerSingle from '../tareas/UserPickerSingle'
import UserPickerMulti from '../tareas/UserPickerMulti'
import { teamMemberUsers } from '../../utils/lineFilters'
import { EmployeeChip, EmployeeChipList } from '../common/EmployeeChip'

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
    name:              client?.name              ?? '',
    logo_url:          client?.logo_url          ?? '',
    line_id:           client?.line_id           ?? '',
    payment_day:       client?.payment_day       ?? '',
    monthly_fee:       client?.monthly_fee       ?? '',
    campaign_budget:   client?.campaign_budget   ?? '',
    website:           client?.website           ?? '',
    social_links:      client?.social_links      ?? [],
    contacts:          client?.contacts          ?? [],
    anniversary_date:  client?.anniversary_date  ?? '',
    mdn_since:         client?.mdn_since         ?? '',
    social_manager_id: client?.social_manager_id ?? null,
    designer_id:       client?.designer_id       ?? null,
    audiovisual_ids:   client?.audiovisual_ids   ?? [],
    apoyo_ids:         client?.apoyo_ids         ?? [],
    phone:             '',
    instagram_email:   '',
  }))
  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({ value: form, baseline: initialForm.current, onClose })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  // Datos privados (teléfono / correo de Instagram) — solo nivel 3/4/admin.
  // Se cargan aparte porque viven en metric_client_private (RLS propia).
  useEffect(() => {
    if (!privileged || !isEdit) return
    let cancelled = false
    loadClientPrivate(client.id).then(({ data }) => {
      if (cancelled || !data) return
      const patch = { phone: data.phone ?? '', instagram_email: data.instagram_email ?? '' }
      setForm(f => ({ ...f, ...patch }))
      // También actualizar el baseline: este dato llega async después del
      // primer render, así que sin esto useUnsavedChanges marcaría "cambios
      // sin guardar" solo por haber abierto el modal.
      initialForm.current = { ...initialForm.current, ...patch }
    })
    return () => { cancelled = true }
  }, [privileged, isEdit, client?.id])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // Al cambiar de línea, resetear los empleados que ya no pertenecen a esa línea
  function handleLineChange(newLineId) {
    set('line_id', newLineId)
    // Limpiar asignaciones si cambia la línea
    set('social_manager_id', null)
    set('designer_id', null)
    set('audiovisual_ids', [])
  }

  // Escape para cerrar
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  // ── Redes sociales ────────────────────────────────────────────────────────────
  function addSocialLink() {
    set('social_links', [...form.social_links, { red: SOCIAL_NETWORKS[0], link: '' }])
  }

  function updateSocialLink(index, field, value) {
    const updated = form.social_links.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    )
    set('social_links', updated)
  }

  function removeSocialLink(index) {
    set('social_links', form.social_links.filter((_, i) => i !== index))
  }

  // ── Personas de la empresa ─────────────────────────────────────────────────────
  function addContact() {
    set('contacts', [...form.contacts, { name: '', role: '', birth_day: '', birth_month: '' }])
  }

  function updateContact(index, field, value) {
    const updated = form.contacts.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    )
    set('contacts', updated)
  }

  function removeContact(index) {
    set('contacts', form.contacts.filter((_, i) => i !== index))
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) { setError('El nombre del cliente es obligatorio.'); return }

    let payment_day = isEdit ? (client?.payment_day ?? null) : null
    let monthly_fee = isEdit ? (client?.monthly_fee ?? null) : null
    if (privileged) {
      payment_day = form.payment_day !== '' ? parseInt(form.payment_day, 10) : null
      if (payment_day !== null && (payment_day < 1 || payment_day > 31)) {
        setError('El día de pago debe estar entre 1 y 31.'); return
      }
      monthly_fee = form.monthly_fee !== '' ? Number(form.monthly_fee) : null
    }
    const campaign_budget = form.campaign_budget !== '' ? Number(form.campaign_budget) : null

    setSaving(true)
    setError(null)

    const payload = {
      name,
      logo_url:          form.logo_url || null,
      line_id:           form.line_id || null,
      website:           form.website.trim() || null,
      payment_day,
      monthly_fee,
      campaign_budget,
      social_links:      form.social_links.filter(s => s.link.trim()),
      contacts:          form.contacts.filter(c => c.name.trim()),
      anniversary_date:  form.anniversary_date || null,
      mdn_since:         form.mdn_since || null,
      social_manager_id: form.social_manager_id || null,
      designer_id:       form.designer_id || null,
      audiovisual_ids:   form.audiovisual_ids,
      apoyo_ids:         form.apoyo_ids,
    }

    let data, err
    if (isEdit) {
      ;({ data, error: err } = await updateClient(client.id, payload))
    } else {
      ;({ data, error: err } = await createClient(companyId, payload))
    }

    if (!err && privileged && data?.id) {
      const { error: privErr } = await upsertClientPrivate(data.id, {
        phone: form.phone.trim(),
        instagram_email: form.instagram_email.trim(),
      })
      if (privErr) err = privErr
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(data)
    onClose()
  }

  // ── Empleados filtrados por línea y departamento ───────────────────────────────
  const selectedLine = useMemo(
    () => lines.find(l => l.id === form.line_id) ?? null,
    [lines, form.line_id]
  )
  const lineEmployees = useMemo(
    () => teamMemberUsers(employees, selectedLine),
    [employees, selectedLine]
  )
  // dept_id 1 = Redes (Social), 3 = Diseño, 2 = Audiovisual
  const socialUsers      = useMemo(() => lineEmployees.filter(u => u.department_id === 1), [lineEmployees])
  const designerUsers    = useMemo(() => lineEmployees.filter(u => u.department_id === 3), [lineEmployees])
  const audiovisualUsers = useMemo(() => lineEmployees.filter(u => u.department_id === 2), [lineEmployees])

  // Para readOnly: resolver usuario por id
  const socialManagerUser  = employees.find(u => u.user_id === form.social_manager_id) ?? null
  const designerUser       = employees.find(u => u.user_id === form.designer_id) ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
    >
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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form id="client-form" onSubmit={readOnly ? e => e.preventDefault() : handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Logo del cliente */}
          <div className="flex flex-col items-center">
            <AvatarUpload
              user={{ first_name: form.name || 'C', last_name: '', avatar_url: form.logo_url || null }}
              onUploaded={readOnly ? undefined : url => set('logo_url', url)}
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
              onChange={e => set('name', e.target.value)}
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
            <select
              className="input-base"
              value={form.line_id}
              onChange={e => handleLineChange(e.target.value)}
              disabled={readOnly}
            >
              <option value="">Sin línea</option>
              {lines.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Equipo del cliente */}
          <div className="space-y-3">
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
              Equipo del cliente
            </label>

            {/* Social + Diseñador */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Social Asignado</p>
                {readOnly ? (
                  <EmployeeChip user={socialManagerUser} />
                ) : (
                  <UserPickerSingle
                    users={form.line_id ? socialUsers : []}
                    selectedId={form.social_manager_id}
                    onChange={id => set('social_manager_id', id)}
                    placeholder={form.line_id ? 'Seleccionar...' : 'Selecciona una línea primero'}
                    clearable
                  />
                )}
              </div>
              <div>
                <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Diseñador Asignado</p>
                {readOnly ? (
                  <EmployeeChip user={designerUser} />
                ) : (
                  <UserPickerSingle
                    users={form.line_id ? designerUsers : []}
                    selectedId={form.designer_id}
                    onChange={id => set('designer_id', id)}
                    placeholder={form.line_id ? 'Seleccionar...' : 'Selecciona una línea primero'}
                    clearable
                  />
                )}
              </div>
            </div>

            {/* Audiovisual */}
            <div>
              <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Audiovisual</p>
              {readOnly ? (
                <EmployeeChipList userIds={form.audiovisual_ids} employees={employees} />
              ) : (
                <UserPickerMulti
                  users={form.line_id ? audiovisualUsers : []}
                  selectedIds={form.audiovisual_ids}
                  onChange={ids => set('audiovisual_ids', ids)}
                  placeholder={form.line_id ? 'Agregar audiovisual...' : 'Selecciona una línea primero'}
                />
              )}
            </div>

            {/* Apoyo — cualquier empleado de la empresa */}
            <div>
              <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Apoyo</p>
              {readOnly ? (
                <EmployeeChipList userIds={form.apoyo_ids} employees={employees} />
              ) : (
                <UserPickerMulti
                  users={employees}
                  selectedIds={form.apoyo_ids}
                  onChange={ids => set('apoyo_ids', ids)}
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
                  onChange={e => set('payment_day', e.target.value)}
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
                  onChange={e => set('monthly_fee', e.target.value)}
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
              onChange={e => set('campaign_budget', e.target.value)}
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
              onChange={e => set('website', e.target.value)}
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
              <input
                type="date"
                className="input-base"
                value={form.anniversary_date}
                onChange={e => set('anniversary_date', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Cliente MDN desde
              </label>
              <input
                type="date"
                className="input-base"
                value={form.mdn_since}
                onChange={e => set('mdn_since', e.target.value)}
                disabled={readOnly}
              />
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
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
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
                  <div key={i} className="bg-[#faf9f5] rounded-xl p-3 space-y-2 border border-[#ece9df]">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input-base flex-1 text-[13.5px]"
                        value={contact.name}
                        onChange={e => updateContact(i, 'name', e.target.value)}
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
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 2l9 9M11 2L2 11" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Cargo</p>
                        <input
                          type="text"
                          className="input-base text-[13px]"
                          value={contact.role}
                          onChange={e => updateContact(i, 'role', e.target.value)}
                          placeholder="Ej. Gerente de marca"
                          disabled={readOnly}
                        />
                      </div>
                      <div>
                        <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Cumpleaños</p>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={31}
                            className="input-base text-[13px] !w-16 flex-shrink-0"
                            value={contact.birth_day}
                            onChange={e => updateContact(i, 'birth_day', e.target.value)}
                            placeholder="Día"
                            disabled={readOnly}
                          />
                          <select
                            className="input-base text-[13px] flex-1 min-w-0"
                            value={contact.birth_month}
                            onChange={e => updateContact(i, 'birth_month', e.target.value)}
                            disabled={readOnly}
                          >
                            <option value="">Mes</option>
                            {MONTHS.map((m, idx) => (
                              <option key={idx + 1} value={idx + 1}>{m}</option>
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
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
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
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                    <select
                      className="input-base w-full sm:w-32 flex-shrink-0 text-[13.5px]"
                      value={item.red}
                      onChange={e => updateSocialLink(i, 'red', e.target.value)}
                      disabled={readOnly}
                    >
                      {SOCIAL_NETWORKS.map(net => (
                        <option key={net} value={net}>{net}</option>
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
                          onChange={e => updateSocialLink(i, 'link', e.target.value)}
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
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 2l9 9M11 2L2 11" strokeLinecap="round"/>
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
                  <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Teléfono</p>
                  <input
                    type="tel"
                    className="input-base"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+58 412 0000000"
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Correo de Instagram</p>
                  <input
                    type="email"
                    className="input-base"
                    value={form.instagram_email}
                    onChange={e => set('instagram_email', e.target.value)}
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
    </div>
  )
}
