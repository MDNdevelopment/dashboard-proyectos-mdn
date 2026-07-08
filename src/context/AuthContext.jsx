import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { canAccessModule } from '../lib/permissions'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState(null)
  const [modulePermissions, setModulePermissions] = useState({})
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  // Ref que guarda el userId cuyo perfil ya fue cargado. Evita re-fetches
  // redundantes (TOKEN_REFRESHED al refocar la pestaña) que causarían remounts.
  const loadedUserId = useRef(null)

  async function fetchUserProfile(userId) {
    loadedUserId.current = userId
    const { data } = await supabase
      .from('users')
      .select('user_id, first_name, last_name, email, department_id, position_id, access_level, admin, tasks_view_all, company_id, avatar_url, receive_ticket_notifications, department:departments(department_name), position:positions(position_name)')
      .eq('user_id', userId)
      .single()
    setUserProfile(data)
    if (data?.company_id) await fetchModulePermissions(data.company_id)
  }

  async function fetchModulePermissions(companyId) {
    if (!companyId) {
      setPermissionsLoaded(true)
      return
    }
    const { data } = await supabase
      .from('module_permissions')
      .select('module_key, rules')
      .eq('company_id', companyId)
    if (data) {
      const map = {}
      data.forEach(row => { map[row.module_key] = row.rules })
      setModulePermissions(map)
    }
    setPermissionsLoaded(true)
  }

  useEffect(() => {
    // Await del perfil antes de bajar loading, para que RequireModule no
    // evalúe can() con userProfile=null y redirija a '/' en carga fría.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) await fetchUserProfile(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        // Solo re-fetchear si el usuario cambia (evita remounts por TOKEN_REFRESHED
        // al refocar la pestaña, que desmontaría las vistas y perdería datos sin guardar).
        if (session.user.id !== loadedUserId.current) {
          fetchUserProfile(session.user.id)
        }
      } else {
        loadedUserId.current = null
        setUserProfile(null)
        setModulePermissions({})
        setPermissionsLoaded(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  function signOut() {
    return supabase.auth.signOut()
  }

  function resetPassword(email) {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  async function refreshProfile() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (currentSession) await fetchUserProfile(currentSession.user.id)
  }

  /**
   * Verifica si el usuario actual puede acceder a un módulo.
   * Admin siempre pasa; sin reglas configuradas → acceso libre.
   */
  const can = useCallback(
    (moduleKey) => canAccessModule(moduleKey, userProfile, modulePermissions),
    [userProfile, modulePermissions]
  )

  return (
    <AuthContext.Provider value={{
      session, loading, userProfile, modulePermissions, permissionsLoaded,
      signIn, signOut, resetPassword, refreshProfile,
      can,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
