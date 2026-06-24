import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from './UserPickerSingle'

export default function TeamManagerModal({ teams, teamMembers, users, onClose, onTeamsChanged }) {
  const { userProfile } = useAuth()
  const [activeTeamId, setActiveTeamId] = useState(teams[0]?.id ?? null)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Close on Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const activeTeam = teams.find(t => t.id === activeTeamId) ?? null
  const memberIds = teamMembers.filter(m => m.team_id === activeTeamId).map(m => m.user_id)
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase()
    return !q || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
  })

  async function createTeam(e) {
    e.preventDefault()
    const name = newTeamName.trim()
    if (!name) return
    setSaving(true); setError(null)
    const { data, error: err } = await supabase
      .from('teams')
      .insert({ name, company_id: userProfile?.company_id ?? '' })
      .select()
      .single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setNewTeamName(''); setCreating(false)
    setActiveTeamId(data.id)
    onTeamsChanged()
  }

  async function deleteTeam() {
    if (!activeTeam) return
    if (!confirm(`¿Eliminar el team "${activeTeam.name}"? Se eliminarán también sus miembros y sus tareas quedarán sin team.`)) return
    setSaving(true); setError(null)
    // delete members first, then team
    await supabase.from('team_members').delete().eq('team_id', activeTeamId)
    const { error: err } = await supabase.from('teams').delete().eq('id', activeTeamId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setActiveTeamId(teams.find(t => t.id !== activeTeamId)?.id ?? null)
    onTeamsChanged()
  }

  async function toggleMember(userId) {
    if (!activeTeamId) return
    setSaving(true); setError(null)
    if (memberIds.includes(userId)) {
      const { error: err } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', activeTeamId)
        .eq('user_id', userId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from('team_members')
        .insert({ team_id: activeTeamId, user_id: userId })
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    onTeamsChanged()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df]">
          <h2 className="text-[18px] font-bold text-[#111]">Gestión de Teams</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Left panel — team list */}
          <div className="w-full sm:w-[200px] flex-shrink-0 border-b sm:border-b-0 sm:border-r border-[#ece9df] p-3 flex flex-col gap-1 overflow-y-auto max-h-40 sm:max-h-none">
            {teams.map(t => (
              <button
                key={t.id}
                onClick={() => { setActiveTeamId(t.id); setSearch('') }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[15px] font-medium text-left transition-colors ${
                  t.id === activeTeamId
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'text-[#444] hover:bg-[#f5f3eb]'
                }`}
              >
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-[13px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-black/10">
                  {teamMembers.filter(m => m.team_id === t.id).length}
                </span>
              </button>
            ))}

            {/* Create team */}
            {creating ? (
              <form onSubmit={createTeam} className="mt-1">
                <input
                  autoFocus
                  className="input-base text-[14px] mb-1.5"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="Nombre del team..."
                />
                <div className="flex gap-1">
                  <button type="submit" disabled={saving} className="flex-1 px-2 py-1 rounded-lg bg-[#111] text-white text-[13px] font-bold disabled:opacity-50">
                    Crear
                  </button>
                  <button type="button" onClick={() => { setCreating(false); setNewTeamName('') }} className="px-2 py-1 rounded-lg border border-[#e0ddd4] text-[13px] text-[#555] hover:bg-[#f5f3eb]">
                    ✕
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-[14px] font-semibold text-[#888] hover:text-[#111] hover:bg-[#f5f3eb] transition-colors border border-dashed border-[#e0ddd4] mt-1"
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 1v10M1 6h10" strokeLinecap="round"/></svg>
                Nuevo team
              </button>
            )}
          </div>

          {/* Right panel — members */}
          <div className="flex-1 flex flex-col min-h-0 p-4">
            {activeTeam ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-[17px] font-bold text-[#111]">{activeTeam.name}</h3>
                    <p className="text-[14px] text-[#888]">{memberIds.length} miembro{memberIds.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={deleteTeam}
                    disabled={saving}
                    className="text-[14px] font-semibold text-red-400 hover:text-red-600 transition-colors"
                  >
                    Eliminar team
                  </button>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-lg px-3 py-2 mb-3">
                    {error}
                  </div>
                )}

                {/* Search */}
                <div className="relative mb-3">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="6.5" cy="6.5" r="5"/>
                    <path d="M10.5 10.5L14 14" strokeLinecap="round"/>
                  </svg>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar empleado..."
                    className="w-full bg-[#faf9f5] border border-[#e0ddd4] rounded-lg pl-8 pr-3 py-1.5 text-[14px] text-[#111] placeholder-[#bbb] outline-none focus:border-[#bbb] transition-colors"
                  />
                </div>

                {/* User list */}
                <div className="flex-1 overflow-y-auto space-y-0.5">
                  {filteredUsers.length === 0 ? (
                    <p className="text-[15px] text-[#bbb] text-center py-8">Sin resultados</p>
                  ) : (
                    filteredUsers.map(u => {
                      const isMember = memberIds.includes(u.user_id)
                      return (
                        <button
                          key={u.user_id}
                          type="button"
                          onClick={() => toggleMember(u.user_id)}
                          disabled={saving}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left ${
                            isMember ? 'bg-[#f0fdf4] hover:bg-[#dcfce7]' : 'hover:bg-[#f5f3eb]'
                          }`}
                        >
                          <Avatar user={u} size={32} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-medium text-[#111] truncate">
                              {u.first_name} {u.last_name}
                            </p>
                            <p className="text-[13px] font-mono text-[#888]">
                              {[u.position?.position_name, `Nivel ${u.access_level ?? '—'}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isMember ? 'border-[#16A34A] bg-[#16A34A]' : 'border-[#d1d5db] bg-white'
                          }`}>
                            {isMember && (
                              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                              </svg>
                            )}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className="text-[16px] font-medium text-[#888] mb-1">No hay teams creados</p>
                <p className="text-[14px] text-[#bbb]">Crea el primer team con el botón de la izquierda</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
