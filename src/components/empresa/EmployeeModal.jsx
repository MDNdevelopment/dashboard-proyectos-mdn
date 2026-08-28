import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import AvatarUpload from './AvatarUpload'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { useAuth } from '../../context/AuthContext'
import { isFinancePrivileged } from '../../lib/permissions'
import DateInput from '../common/DateInput'

/**
 * Modal editar empleado (solo edición — la creación es Fase 4).
 * Props: employee (objeto), departments, positions, onClose, onSaved(data)
 */
export default function EmployeeModal({ employee, departments, positions, onClose, onSaved }) {
  const { userProfile, can } = useAuth()
  const privileged = isFinancePrivileged(userProfile, can('empresa.empleados.sensible'))
  // Asignar nivel de acceso / admin queda reservado a admin: alguien con solo
  // 'empresa.empleados.manage' (p.ej. RRHH) puede crear/editar/archivar, pero no
  // otorgarse ni otorgar privilegios de administrador o niveles altos.
  const canAssignPrivileges = userProfile?.admin === true

  const [form, setForm] = useState(() => ({
    first_name: employee?.first_name ?? '',
    last_name: employee?.last_name ?? '',
    phone_number: employee?.phone_number ?? '',
    birth_date: employee?.birth_date ?? '',
    hire_date: employee?.hire_date ?? '',
    department_id: employee?.department_id ?? '',
    position_id: employee?.position_id ?? '',
    access_level: employee?.access_level ?? 1,
    admin: employee?.admin ?? false,
    on_probation: employee?.on_probation ?? false,
    avatar_url: employee?.avatar_url ?? '',
    monthly_salary: employee?.monthly_salary ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  // Al cambiar departamento, resetear cargo si ya no pertenece al nuevo dept.
  // String() porque e.target.value siempre es string pero Supabase puede devolver integer PKs.
  function setDept(deptId) {
    setForm((f) => {
      const filtered = positions.filter((p) => String(p.department_id) === String(deptId))
      const posIdStillValid = filtered.some((p) => String(p.position_id) === String(f.position_id))
      return {
        ...f,
        department_id: deptId,
        position_id: posIdStillValid ? f.position_id : (filtered[0]?.position_id ?? ''),
      }
    })
  }

  const initialForm = useRef(form)
  const { requestClose } = useUnsavedChanges({
    value: form,
    baseline: initialForm.current,
    onClose,
  })

  // Escape para cerrar
  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [requestClose])

  const filteredPositions = positions.filter(
    (p) => String(p.department_id) === String(form.department_id),
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('El nombre y apellido son obligatorios')
      return
    }
    setSaving(true)
    setError(null)

    const updatePayload = {
      user_id: employee.user_id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone_number: form.phone_number.trim() || null,
      birth_date: form.birth_date || null,
      hire_date: form.hire_date || null,
      department_id: form.department_id || null,
      position_id: form.position_id || null,
      access_level: Number(form.access_level),
      admin: form.admin,
      on_probation: form.on_probation,
      avatar_url: form.avatar_url || null,
    }
    // Sueldo: solo lo escribe quien tiene permisos financieros (el servidor
    // vuelve a validar esto — ver update-employee.js)
    if (privileged) {
      updatePayload.monthly_salary = form.monthly_salary !== '' ? Number(form.monthly_salary) : null
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    let res
    try {
      res = await fetch('/api/employees/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(updatePayload),
      })
    } catch {
      setError('No se pudo conectar con el servidor')
      setSaving(false)
      return
    }

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? 'No se pudo guardar el empleado')
      setSaving(false)
      return
    }

    onSaved(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <div className="flex items-center gap-3">
            <AvatarUpload
              user={{ ...employee, avatar_url: form.avatar_url }}
              onUploaded={(url) => set('avatar_url', url)}
              size={48}
              label=""
            />
            <div>
              <h2 className="text-[18px] font-bold text-[#111]">Editar empleado</h2>
              <p className="text-[14px] text-[#888] mt-0.5">{employee.email}</p>
            </div>
          </div>
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
          id="employee-form"
          onSubmit={handleSubmit}
          className="px-6 py-5 space-y-4 overflow-y-auto flex-1"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Nombre + Apellido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Nombre *
              </label>
              <input
                type="text"
                className="input-base"
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                placeholder="Nombre"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Apellido *
              </label>
              <input
                type="text"
                className="input-base"
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                placeholder="Apellido"
              />
            </div>
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
              Teléfono
            </label>
            <input
              type="text"
              className="input-base"
              value={form.phone_number}
              onChange={(e) => set('phone_number', e.target.value)}
              placeholder="+58 412 000 0000"
            />
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Fecha de nacimiento
              </label>
              <DateInput value={form.birth_date} onChange={(v) => set('birth_date', v)} />
            </div>
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Fecha de ingreso
              </label>
              <DateInput value={form.hire_date} onChange={(v) => set('hire_date', v)} />
            </div>
          </div>

          {/* Departamento + Cargo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Departamento
              </label>
              <select
                className="input-base"
                value={form.department_id}
                onChange={(e) => setDept(e.target.value)}
              >
                <option value="">Sin departamento</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.department_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Cargo
              </label>
              <select
                className="input-base"
                value={form.position_id}
                onChange={(e) => set('position_id', e.target.value)}
                disabled={!form.department_id}
              >
                <option value="">Sin cargo</option>
                {filteredPositions.map((p) => (
                  <option key={p.position_id} value={p.position_id}>
                    {p.position_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nivel de acceso — asignarlo es admin-only; RRHH con solo
              'empresa.empleados.manage' lo ve pero no lo edita (si además tiene
              'empresa.empleados.sensible'; si no, el campo se oculta). */}
          {canAssignPrivileges ? (
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Nivel de acceso
              </label>
              <select
                className="input-base"
                value={form.access_level}
                onChange={(e) => set('access_level', Number(e.target.value))}
              >
                <option value={1}>Nivel 1</option>
                <option value={2}>Nivel 2</option>
                <option value={3}>Nivel 3</option>
                <option value={4}>Nivel 4</option>
              </select>
            </div>
          ) : (
            privileged && (
              <div>
                <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                  Nivel de acceso
                </label>
                <p className="text-[15px] text-[#555]">Nivel {form.access_level}</p>
              </div>
            )
          )}

          {/* Sueldo mensual — solo nivel 4 / admin */}
          {privileged && (
            <div>
              <label className="block text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-1.5">
                Sueldo mensual (USD)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-base"
                value={form.monthly_salary}
                onChange={(e) => set('monthly_salary', e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Toggle admin — otorgar admin es admin-only */}
          {canAssignPrivileges && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.admin}
                onClick={() => set('admin', !form.admin)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                  form.admin ? 'bg-[#FFB800]' : 'bg-[#d8d4c8]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    form.admin ? 'translate-x-4' : ''
                  }`}
                />
              </button>
              <span className="text-[15px] text-[#555]">Administrador</span>
            </div>
          )}

          {/* Toggle período de prueba */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.on_probation}
              aria-label="En período de prueba"
              onClick={() => set('on_probation', !form.on_probation)}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                form.on_probation ? 'bg-[#FFB800]' : 'bg-[#d8d4c8]'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.on_probation ? 'translate-x-4' : ''
                }`}
              />
            </button>
            <span className="text-[15px] text-[#555]">En período de prueba</span>
          </div>
        </form>

        {/* Botones */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={requestClose}
            className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="employee-form"
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
