import { useState, useEffect } from 'react'
import { createClient, updateClient } from '../metricas/metricsApi'
import { SOCIAL_NETWORKS, MONTHS } from '../metricas/constants'
import AvatarUpload from './AvatarUpload'

/**
 * Modal crear/editar cliente (marca).
 * Convención: client=null → crear, client=objeto → editar.
 * Props:
 *   client       — null = crear, objeto = editar
 *   companyId    — string
 *   lines        — array de líneas disponibles para el selector
 *   onClose()    — cierra el modal
 *   onSaved(row) — recibe la fila guardada (para estado optimista en el padre)
 */
export default function ClientModal({ client = null, companyId, lines = [], onClose, onSaved }) {
  const isEdit = client != null

  const [form, setForm] = useState(() => ({
    name:             client?.name             ?? '',
    logo_url:         client?.logo_url         ?? '',
    line_id:          client?.line_id          ?? '',
    payment_day:      client?.payment_day      ?? '',
    monthly_fee:      client?.monthly_fee      ?? '',
    website:          client?.website          ?? '',
    social_links:     client?.social_links     ?? [],
    contacts:         client?.contacts         ?? [],
    anniversary_date: client?.anniversary_date ?? '',
    mdn_since:        client?.mdn_since        ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // Escape para cerrar
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

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

    const payment_day = form.payment_day !== '' ? parseInt(form.payment_day, 10) : null
    if (payment_day !== null && (payment_day < 1 || payment_day > 31)) {
      setError('El día de pago debe estar entre 1 y 31.'); return
    }
    const monthly_fee = form.monthly_fee !== '' ? Number(form.monthly_fee) : null

    setSaving(true)
    setError(null)

    const payload = {
      name,
      logo_url:         form.logo_url || null,
      line_id:          form.line_id || null,
      website:          form.website.trim() || null,
      payment_day,
      monthly_fee,
      social_links:     form.social_links.filter(s => s.link.trim()),
      contacts:         form.contacts.filter(c => c.name.trim()),
      anniversary_date: form.anniversary_date || null,
      mdn_since:        form.mdn_since || null,
    }

    let data, err
    if (isEdit) {
      ;({ data, error: err } = await updateClient(client.id, payload))
    } else {
      ;({ data, error: err } = await createClient(companyId, payload))
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(data)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df] sticky top-0 bg-white z-10">
          <h2 className="text-[18px] font-bold text-[#111]">
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Logo del cliente */}
          <div className="flex flex-col items-center">
            <AvatarUpload
              user={{ first_name: form.name || 'C', last_name: '', avatar_url: form.logo_url || null }}
              onUploaded={url => set('logo_url', url)}
              publicId={client?.id ? `clientes/client_${client.id}` : undefined}
              uploadPreset={import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET_LOGOS}
              size={96}
              label="Logo del cliente"
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
              autoFocus
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
              onChange={e => set('line_id', e.target.value)}
            >
              <option value="">Sin línea</option>
              {lines.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Día de pago + Mensualidad — fila */}
          <div className="grid grid-cols-2 gap-4">
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
              />
            </div>
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
            />
          </div>

          {/* Aniversario + Cliente desde MDN */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Aniversario empresa
              </label>
              <input
                type="date"
                className="input-base"
                value={form.anniversary_date}
                onChange={e => set('anniversary_date', e.target.value)}
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
              />
            </div>
          </div>

          {/* Personas de la empresa */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
                Personas de la empresa
              </label>
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
                      />
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
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[11.5px] font-mono text-[#aaa] uppercase tracking-wide mb-1">Cargo</p>
                        <input
                          type="text"
                          className="input-base text-[13px]"
                          value={contact.role}
                          onChange={e => updateContact(i, 'role', e.target.value)}
                          placeholder="Ej. Gerente de marca"
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
                          />
                          <select
                            className="input-base text-[13px] flex-1 min-w-0"
                            value={contact.birth_month}
                            onChange={e => updateContact(i, 'birth_month', e.target.value)}
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
            </div>

            {form.social_links.length === 0 ? (
              <p className="text-[13.5px] text-[#bbb] py-2">Sin redes sociales configuradas.</p>
            ) : (
              <div className="space-y-2">
                {form.social_links.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="input-base w-36 flex-shrink-0 text-[13.5px]"
                      value={item.red}
                      onChange={e => updateSocialLink(i, 'red', e.target.value)}
                    >
                      {SOCIAL_NETWORKS.map(net => (
                        <option key={net} value={net}>{net}</option>
                      ))}
                    </select>
                    <input
                      type="url"
                      className="input-base flex-1 text-[13.5px]"
                      value={item.link}
                      onChange={e => updateSocialLink(i, 'link', e.target.value)}
                      placeholder="https://..."
                    />
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
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
