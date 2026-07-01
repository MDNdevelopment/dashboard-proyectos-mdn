import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../supabase'
import { MODULES, capabilitiesForModule } from '../../config/modules'

// ──────────────────────────────────────────────
// Tipos de condición disponibles
// ──────────────────────────────────────────────
const COND_TYPES = [
  { value: 'department', label: 'Departamento' },
  { value: 'min_level',  label: 'Nivel mínimo' },
  { value: 'user',       label: 'Usuario específico' },
  { value: 'position',   label: 'Cargo / Posición' },
]

// Tipos permitidos en el bloque de Exclusiones (solo identidad, no nivel)
const DENY_COND_TYPES = [
  { value: 'department', label: 'Departamento' },
  { value: 'user',       label: 'Usuario específico' },
  { value: 'position',   label: 'Cargo / Posición' },
]

const NIVEL_LABELS = { 1: 'Nivel 1', 2: 'Nivel 2', 3: 'Nivel 3', 4: 'Nivel 4' }

function emptyCondition() {
  return { type: 'department', ids: [], value: 1 }
}
function emptyDenyCond() {
  return { type: 'department', ids: [] }
}
function emptyGroup() {
  return { all: [emptyCondition()] }
}
function emptyRules() {
  return { rules: [], deny: [] }
}

// ──────────────────────────────────────────────
// MultiSelect pequeño (chips)
// ──────────────────────────────────────────────
function ChipSelect({ options, selected, onChange, placeholder, wrapperClass = '' }) {
  const [open, setOpen] = useState(false)

  function toggle(id) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }

  const selectedLabels = options
    .filter(o => selected.includes(o.value))
    .map(o => o.label)

  return (
    <div className={`relative ${wrapperClass}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 bg-white border border-[#d4d0c8] rounded-lg text-[13.5px] text-[#444] hover:border-[#aaa] transition-colors text-left"
      >
        <span className="flex-1 truncate">
          {selectedLabels.length === 0
            ? <span className="text-[#aaa]">{placeholder}</span>
            : selectedLabels.join(', ')}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[160px] bg-white border border-[#d4d0c8] rounded-xl shadow-lg overflow-y-auto max-h-56">
          {options.length === 0 && (
            <p className="px-3 py-2 text-[13px] text-[#aaa]">Sin opciones</p>
          )}
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="flex items-center gap-2 w-full px-3 py-2 text-[13.5px] text-[#333] hover:bg-[#f5f3eb] transition-colors text-left"
            >
              <span className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center ${selected.includes(opt.value) ? 'bg-[#111] border-[#111]' : 'border-[#ccc]'}`}>
                {selected.includes(opt.value) && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                    <path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Una condición dentro de un grupo
// Layout mobile: 2 filas (tipo+× / valor)
// Layout sm+: fila única con flex-wrap
// ──────────────────────────────────────────────
function ConditionRow({ cond, onChange, onRemove, departments, users, positions, condTypes = COND_TYPES }) {
  function update(patch) { onChange({ ...cond, ...patch }) }

  return (
    <div className="flex flex-col gap-2">
      {/* Fila 1: tipo + botón eliminar */}
      <div className="flex items-center gap-2">
        {/* Selector de tipo */}
        <select
          value={cond.type}
          onChange={e => update({ type: e.target.value, ids: [], value: 1 })}
          className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-[#d4d0c8] rounded-lg text-[13.5px] text-[#444] focus:outline-none focus:border-[#999] transition-colors"
        >
          {condTypes.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {/* Eliminar condición */}
        <button
          type="button"
          onClick={onRemove}
          title="Eliminar condición"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#bbb] hover:text-[#e00] hover:bg-[#fff0f0] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Fila 2: selector de valor (ocupa todo el ancho) */}
      {cond.type === 'department' && (
        <ChipSelect
          options={departments.map(d => ({ value: d.department_id, label: d.department_name }))}
          selected={cond.ids ?? []}
          onChange={ids => update({ ids })}
          placeholder="Seleccionar..."
          wrapperClass="w-full"
        />
      )}

      {cond.type === 'min_level' && (
        <select
          value={cond.value ?? 1}
          onChange={e => update({ value: Number(e.target.value) })}
          className="w-full sm:w-auto px-3 py-1.5 bg-white border border-[#d4d0c8] rounded-lg text-[13.5px] text-[#444] focus:outline-none focus:border-[#999]"
        >
          {[1, 2, 3, 4].map(n => (
            <option key={n} value={n}>{NIVEL_LABELS[n]}</option>
          ))}
        </select>
      )}

      {cond.type === 'user' && (
        <ChipSelect
          options={users.map(u => ({ value: u.user_id, label: `${u.first_name} ${u.last_name}` }))}
          selected={cond.ids ?? []}
          onChange={ids => update({ ids })}
          placeholder="Seleccionar usuario..."
          wrapperClass="w-full"
        />
      )}

      {cond.type === 'position' && (
        <ChipSelect
          options={positions.map(p => ({ value: p.position_id, label: p.position_name }))}
          selected={cond.ids ?? []}
          onChange={ids => update({ ids })}
          placeholder="Seleccionar cargo..."
          wrapperClass="w-full"
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Un grupo AND
// ──────────────────────────────────────────────
function GroupBlock({ group, groupIndex, onChange, onRemove, isOnly, departments, users, positions }) {
  function updateCond(i, patch) {
    const next = group.all.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    onChange({ all: next })
  }
  function removeCond(i) {
    const next = group.all.filter((_, idx) => idx !== i)
    onChange({ all: next })
  }
  function addCond() {
    onChange({ all: [...group.all, emptyCondition()] })
  }

  return (
    <div className="relative bg-[#fafaf7] border border-[#e8e4d8] rounded-xl p-3 sm:p-4">
      {/* Header del grupo */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <span className="text-[11px] sm:text-[12px] font-mono font-bold tracking-widest uppercase text-[#999]">
          Grupo {groupIndex + 1} — todo lo siguiente
        </span>
        {!isOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[12px] text-[#bbb] hover:text-[#e00] font-medium transition-colors flex-shrink-0"
          >
            Eliminar grupo
          </button>
        )}
      </div>

      {/* Condiciones (AND) */}
      <div className="space-y-2">
        {group.all.map((cond, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="flex items-center gap-2 my-1.5">
                <div className="h-px flex-1 bg-[#e0ddd4]" />
                <span className="text-[11px] font-mono font-bold text-[#bbb] uppercase tracking-widest">Y</span>
                <div className="h-px flex-1 bg-[#e0ddd4]" />
              </div>
            )}
            <ConditionRow
              cond={cond}
              onChange={patch => updateCond(i, patch)}
              onRemove={() => removeCond(i)}
              departments={departments}
              users={users}
              positions={positions}
            />
          </div>
        ))}
      </div>

      {/* Agregar condición */}
      <button
        type="button"
        onClick={addCond}
        className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#666] hover:text-[#111] transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
        </svg>
        Agregar condición (Y)
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────
// Sección de una capacidad (acceso, tab, o acción)
// ──────────────────────────────────────────────
function CapabilitySection({
  capKey, label, isManage,
  rules, onChange, onSave, saving,
  departments, users, positions,
}) {
  const hasRules = rules.rules.length > 0
  const deny     = rules.deny ?? []
  const hasDeny  = deny.length > 0

  // Handlers para grupos de permiso
  function addGroup() {
    onChange({ ...rules, rules: [...rules.rules, emptyGroup()] })
  }
  function updateGroup(i, g) {
    onChange({ ...rules, rules: rules.rules.map((r, idx) => idx === i ? g : r) })
  }
  function removeGroup(i) {
    onChange({ ...rules, rules: rules.rules.filter((_, idx) => idx !== i) })
  }

  // Handlers para exclusiones (deny)
  function addDeny() {
    onChange({ ...rules, deny: [...deny, emptyDenyCond()] })
  }
  function updateDeny(i, patch) {
    onChange({ ...rules, deny: deny.map((c, idx) => idx === i ? { ...c, ...patch } : c) })
  }
  function removeDeny(i) {
    onChange({ ...rules, deny: deny.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-[#f0ede3] last:border-b-0">
      {/* Cabecera de capacidad — apila en mobile, inline en sm+ */}
      <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Izquierda: badge tipo + nombre */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {isManage ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f0e6ff] text-[11.5px] font-bold text-[#7c3aed] uppercase tracking-wide flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 2l3 3-8 8H3v-3L11 2Z" strokeLinejoin="round"/>
              </svg>
              Modificar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#e8f4ff] text-[11.5px] font-bold text-[#1d6fa8] uppercase tracking-wide flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="8" r="6.5"/>
                <path d="M8 7v4M8 5v.5" strokeLinecap="round"/>
              </svg>
              Ver
            </span>
          )}
          <span className="text-[14px] font-semibold text-[#222] truncate">{label}</span>
          <span className="hidden sm:inline text-[12px] font-mono text-[#ccc] truncate">{capKey}</span>
        </div>

        {/* Derecha: chips de estado + botón guardar */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {hasRules ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fff3cd] text-[11.5px] font-semibold text-[#8a6300]">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2" strokeLinecap="round"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>
              {rules.rules.length} {rules.rules.length === 1 ? 'regla' : 'reglas'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e8f5e9] text-[11.5px] font-semibold text-[#2e7d32]">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="6.5"/><path d="M5 8.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Acceso libre
            </span>
          )}
          {hasDeny && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f6ece8] text-[11.5px] font-semibold text-[#a35a4d]">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="6.5"/><path d="M5 8h6" strokeLinecap="round"/></svg>
              {deny.length} {deny.length === 1 ? 'exclusión' : 'exclusiones'}
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1 bg-[#111] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Grupos OR (reglas de permiso) */}
      <div className="space-y-3">
        {!hasRules && (
          <p className="text-[13.5px] text-[#aaa] py-1">
            Sin restricciones — todos los usuarios autenticados tienen acceso.
          </p>
        )}

        {rules.rules.map((group, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="flex items-center gap-3 my-3">
                <div className="h-px flex-1 bg-[#e0ddd4]" />
                <span className="px-3 py-1 bg-[#f5f3eb] text-[12px] font-mono font-bold text-[#888] uppercase tracking-widest rounded-full">O</span>
                <div className="h-px flex-1 bg-[#e0ddd4]" />
              </div>
            )}
            <GroupBlock
              group={group}
              groupIndex={i}
              onChange={g => updateGroup(i, g)}
              onRemove={() => removeGroup(i)}
              isOnly={rules.rules.length === 1}
              departments={departments}
              users={users}
              positions={positions}
            />
          </div>
        ))}

        {/* Agregar grupo (OR) */}
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-2 text-[13px] font-medium text-[#555] border border-dashed border-[#d4d0c8] rounded-lg px-4 py-2 w-full hover:border-[#999] hover:text-[#111] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
          </svg>
          {hasRules ? 'Agregar grupo alternativo (O)' : 'Agregar restricción'}
        </button>
      </div>

      {/* ── Bloque de Exclusiones (solo en capacidades de vista; manage las hereda) ── */}
      {!isManage && <div className="mt-3 pt-3 border-t border-[#f0ede3]">
        {deny.length === 0 ? (
          /* Estado vacío: disparador discreto de una sola línea */
          <button
            type="button"
            onClick={addDeny}
            className="flex items-center gap-2 text-[12.5px] text-[#a35a4d] hover:text-[#8a463b] transition-colors group"
          >
            <span className="w-5 h-5 rounded-full bg-[#f6ece8] flex items-center justify-center flex-shrink-0 group-hover:bg-[#ecdcd6] transition-colors">
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
              </svg>
            </span>
            Excluir a alguien
          </button>
        ) : (
          /* Estado poblado: contenedor cálido compacto */
          <div className="bg-[#faf6f4] border border-[#ecdcd6] rounded-xl p-3">
            {/* Label compacto */}
            <div className="flex items-center gap-1.5 mb-2.5">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#a35a4d" strokeWidth="2" className="flex-shrink-0">
                <circle cx="8" cy="8" r="6.5"/><path d="M5 8h6" strokeLinecap="round"/>
              </svg>
              <span className="text-[11px] font-mono font-semibold uppercase tracking-widest text-[#a35a4d]">
                Exclusiones
              </span>
            </div>

            {/* Filas deny */}
            <div className="space-y-2">
              {deny.map((cond, i) => (
                <div key={i}>
                  {i > 0 && (
                    <div className="flex items-center gap-2 my-1.5">
                      <div className="h-px flex-1 bg-[#eaddd7]" />
                      <span className="text-[10px] font-mono text-[#c4a49e]">o</span>
                      <div className="h-px flex-1 bg-[#eaddd7]" />
                    </div>
                  )}
                  <ConditionRow
                    cond={cond}
                    onChange={patch => updateDeny(i, patch)}
                    onRemove={() => removeDeny(i)}
                    departments={departments}
                    users={users}
                    positions={positions}
                    condTypes={DENY_COND_TYPES}
                  />
                </div>
              ))}
            </div>

            {/* Botón agregar inline */}
            <button
              type="button"
              onClick={addDeny}
              className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-[#a35a4d] hover:text-[#8a463b] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
              </svg>
              Agregar exclusión
            </button>
          </div>
        )}
      </div>}
    </div>
  )
}

// ──────────────────────────────────────────────
// Card por módulo — agrupa sus capacidades
// ──────────────────────────────────────────────
function ModuleCard({ module, rules, onChangeCapability, onSave, savingKey, departments, users, positions }) {
  const capabilities = capabilitiesForModule(module)
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-xl overflow-hidden">
      {/* Header del módulo — clickeable para expandir/colapsar */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-3 sm:px-5 sm:py-3.5 bg-[#fafaf7] flex items-center gap-3 text-left hover:bg-[#f5f3eb] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] sm:text-[15.5px] font-bold text-[#111]">{module.label}</h3>
          <p className="text-[12.5px] sm:text-[13px] text-[#888]">{module.description}</p>
        </div>
        <span className="text-[12px] font-mono text-[#ccc] flex-shrink-0">
          {capabilities.length} {capabilities.length === 1 ? 'cap.' : 'caps.'}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#aaa" strokeWidth="2"
          className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3 5.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Sección por capacidad — solo visible cuando está abierto */}
      {open && (
        <div className="border-t border-[#e0ddd4]">
          {capabilities.map(cap => (
            <CapabilitySection
              key={cap.key}
              capKey={cap.key}
              label={cap.label}
              isManage={cap.isManage ?? false}
              rules={rules[cap.key] ?? emptyRules()}
              onChange={r => onChangeCapability(cap.key, r)}
              onSave={() => onSave(cap.key)}
              saving={savingKey === cap.key}
              departments={departments}
              users={users}
              positions={positions}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Vista principal
// ──────────────────────────────────────────────
export default function PermisosView({ companyId }) {
  const [rules, setRules]           = useState({})   // { [capabilityKey]: { rules:[...] } }
  const [departments, setDepartments] = useState([])
  const [users, setUsers]             = useState([])
  const [positions, setPositions]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [savingKey, setSavingKey]     = useState(null)  // capabilityKey que se está guardando
  const [toast, setToast]             = useState(null)  // { type:'ok'|'err', msg }

  // Inicializar reglas vacías para todas las capacidades de todos los módulos
  const initRules = useCallback((dbRows) => {
    const base = {}
    MODULES.forEach(mod => {
      capabilitiesForModule(mod).forEach(cap => {
        base[cap.key] = emptyRules()
      })
    })
    dbRows.forEach(row => {
      // Normalizar: garantizar que deny siempre sea array (retrocompat con filas viejas)
      const config = row.rules ?? {}
      base[row.module_key] = { rules: config.rules ?? [], deny: config.deny ?? [] }
    })
    return base
  }, [])

  useEffect(() => {
    if (!companyId) return
    async function load() {
      setLoading(true)
      const [mpRes, deptRes, usersRes, posRes] = await Promise.all([
        supabase.from('module_permissions').select('module_key, rules').eq('company_id', companyId),
        supabase.from('departments').select('department_id, department_name').eq('company_id', companyId).order('department_name'),
        supabase.from('users').select('user_id, first_name, last_name').eq('company_id', companyId).order('first_name'),
        supabase.from('positions').select('position_id, position_name').eq('company_id', companyId).order('position_name'),
      ])
      setRules(initRules(mpRes.data ?? []))
      setDepartments(deptRes.data ?? [])
      setUsers(usersRes.data ?? [])
      setPositions(posRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [companyId, initRules])

  function updateCapabilityRules(capKey, newRules) {
    setRules(prev => {
      const next = { ...prev, [capKey]: newRules }
      // Propagar deny a la contraparte manage (ver → modificar)
      const manageKey = capKey + '.manage'
      if (!capKey.endsWith('.manage') && prev[manageKey] !== undefined) {
        next[manageKey] = { ...prev[manageKey], deny: newRules.deny }
      }
      return next
    })
  }

  async function saveCapability(capKey) {
    setSavingKey(capKey)
    const upserts = [{ company_id: companyId, module_key: capKey, rules: rules[capKey] }]
    // Al guardar una capacidad de vista, persistir también la contraparte manage
    const manageKey = capKey + '.manage'
    if (!capKey.endsWith('.manage') && rules[manageKey] !== undefined) {
      upserts.push({ company_id: companyId, module_key: manageKey, rules: rules[manageKey] })
    }
    const { error } = await supabase
      .from('module_permissions')
      .upsert(upserts, { onConflict: 'company_id,module_key' })
    setSavingKey(null)
    if (error) {
      showToast('err', `Error al guardar: ${error.message}`)
    } else {
      showToast('ok', 'Permisos guardados correctamente.')
    }
  }

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 sm:px-5 py-3 rounded-xl shadow-lg text-[13px] sm:text-[14px] font-semibold transition-all max-w-[90vw] text-center ${
          toast.type === 'ok' ? 'bg-[#111] text-white' : 'bg-[#e00] text-white'
        }`}>
          {toast.type === 'ok'
            ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="8" cy="8" r="6.5"/><path d="M5 8.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v4M8 11v.5" strokeLinecap="round"/></svg>
          }
          {toast.msg}
        </div>
      )}

      {/* Descripción */}
      <div className="bg-[#fffbeb] border border-[#ffe58f] rounded-xl px-3 py-3 sm:px-5 sm:py-4 flex gap-3">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#8a6300" strokeWidth="1.8" className="flex-shrink-0 mt-0.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5v.5" strokeLinecap="round"/></svg>
        <div>
          <p className="text-[14px] font-semibold text-[#8a6300] mb-1">Cómo funcionan los permisos</p>
          <p className="text-[13px] sm:text-[13.5px] text-[#a07800] leading-relaxed">
            Cada módulo tiene capacidades: <strong>acceso</strong> (entrar al módulo),{' '}
            <strong>ver</strong> (ver una sección) y <strong>modificar</strong> (crear, editar o
            eliminar). Por capacidad podés crear <strong>grupos de condiciones</strong>: el usuario accede si
            cumple <strong>cualquier grupo completo</strong> (lógica <strong>O</strong>). Dentro de cada
            grupo, todas las condiciones deben cumplirse (lógica <strong>Y</strong>). Sin reglas = acceso
            libre.{' '}
            Usá el bloque de <strong>Exclusiones</strong> para bloquear a departamentos, usuarios o cargos
            específicos (ej. «todo el mundo menos Diseño»): si alguien cumple <strong>cualquier</strong>{' '}
            exclusión, no puede acceder aunque las reglas lo permitan.{' '}
            Los administradores siempre tienen acceso, sin excepción.
          </p>
        </div>
      </div>

      {/* Cards por módulo */}
      {MODULES.map(mod => (
        <ModuleCard
          key={mod.key}
          module={mod}
          rules={rules}
          onChangeCapability={updateCapabilityRules}
          onSave={saveCapability}
          savingKey={savingKey}
          departments={departments}
          users={users}
          positions={positions}
        />
      ))}
    </div>
  )
}
