import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { canAccessModule } from '../lib/permissions'
import { isAuthError } from '../lib/authError'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState(null)
  const [modulePermissions, setModulePermissions] = useState({})
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  // true cuando la sesión se invalidó externamente (token expirado / rechazado).
  // Permite que LoginPage muestre el aviso "Tu sesión expiró".
  const [sessionExpired, setSessionExpired] = useState(false)

  // Ref que guarda el userId cuyo perfil ya fue cargado. Evita re-fetches
  // redundantes (TOKEN_REFRESHED al refocar la pestaña) que causarían remounts.
  const loadedUserId = useRef(null)

  /**
   * Limpia el estado local y elimina el token corrupto de localStorage.
   * La redirección a /login la realiza ProtectedRoute al ver session === null.
   */
  function handleSessionExpired() {
    setSessionExpired(true)
    setSession(null)
    setUserProfile(null)
    setModulePermissions({})
    setPermissionsLoaded(true)
    loadedUserId.current = null
    // signOut limpia el token de localStorage; no es necesario await.
    supabase.auth.signOut()
  }

  async function fetchUserProfile(userId) {
    loadedUserId.current = userId
    const { data, error } = await supabase
      .from('users')
      .select('user_id, first_name, last_name, email, department_id, position_id, access_level, admin, tasks_view_all, company_id, avatar_url, receive_ticket_notifications, department:departments(department_name), position:positions(position_name)')
      .eq('user_id', userId)
      .single()
    if (error) {
      if (isAuthError(error)) { handleSessionExpired(); return }
      // Error no-auth (p.ej. PGRST116 si el usuario no existe aún): perfil null.
      setUserProfile(null)
      return
    }
    setUserProfile(data)
    if (data?.company_id) await fetchModulePermissions(data.company_id)
  }

  async function fetchModulePermissions(companyId) {
    if (!companyId) {
      setPermissionsLoaded(true)
      return
    }
    const { data, error } = await supabase
      .from('module_permissions')
      .select('module_key, rules')
      .eq('company_id', companyId)
    if (error) {
      if (isAuthError(error)) { handleSessionExpired(); return }
      setPermissionsLoaded(true)
      return
    }
    if (data) {
      const map = {}
      data.forEach(row => { map[row.module_key] = row.rules })
      setModulePermissions(map)
    }
    setPermissionsLoaded(true)
  }

  useEffect(() => {
    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          // Validar el token contra el servidor antes de confiar en él.
          // getSession() solo lee localStorage y valida la expiración localmente,
          // siendo vulnerable a desfase de reloj y tokens revocados en el servidor.
          // getUser() hace una llamada real y detecta estos casos.
          const { error: userError } = await supabase.auth.getUser()
          if (userError && isAuthError(userError)) {
            handleSessionExpired()
            setLoading(false)
            return
          }
          setSession(session)
          await fetchUserProfile(session.user.id)
        }
      } catch {
        // getSession() rechazó de forma inesperada; loading baja igualmente.
      }
      setLoading(false)
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        // Un nuevo login (o token refresh exitoso) limpia cualquier aviso de expiración.
        setSessionExpired(false)
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

    // Re-validar al volver a la pestaña: cubre al usuario que la deja abierta
    // horas y vuelve con el token ya muerto, sin esperar a que falle una query.
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      supabase.auth.getUser().then(({ error }) => {
        if (error && isAuthError(error)) handleSessionExpired()
      })
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
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
      sessionExpired,
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
