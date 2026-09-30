import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { canAccessModule } from '../lib/permissions'
import { isAuthError } from '../lib/authError'
import {
  canUseViewAs,
  clearStoredViewAs,
  readStoredViewAs,
  setViewOnly,
  storeViewAs,
} from '../lib/viewAs'

const AuthContext = createContext(null)

// Columnas del perfil. Constante compartida por la carga del usuario real y por el
// modo "Ver como", que necesita exactamente la misma forma de objeto.
const USER_PROFILE_SELECT =
  'user_id, first_name, last_name, email, department_id, position_id, access_level, admin, tasks_view_all, company_id, avatar_url, receive_ticket_notifications, deleted_at, department:departments(department_name), position:positions(position_name)'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [realUserProfile, setRealUserProfile] = useState(null)
  // Modo "Ver como" (solo el dev, ver src/lib/viewAs.js): perfil que se suplanta
  // VISUALMENTE. null = desactivado.
  const [viewAsProfile, setViewAsProfile] = useState(null)
  const [modulePermissions, setModulePermissions] = useState({})
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  // true cuando la sesión se invalidó externamente (token expirado / rechazado).
  // Permite que LoginPage muestre el aviso "Tu sesión expiró".
  const [sessionExpired, setSessionExpired] = useState(false)
  // true cuando el perfil del usuario está archivado (deleted_at). Permite que
  // LoginPage muestre "Tu cuenta ha sido deshabilitada" en vez del error genérico.
  const [accountDisabled, setAccountDisabled] = useState(false)

  // Ref que guarda el userId cuyo perfil ya fue cargado. Evita re-fetches
  // redundantes (TOKEN_REFRESHED al refocar la pestaña) que causarían remounts.
  const loadedUserId = useRef(null)

  /**
   * Limpia el estado local y elimina el token corrupto de localStorage.
   * La redirección a /login la realiza ProtectedRoute al ver session === null.
   */
  function handleSessionExpired() {
    exitViewAs()
    setSessionExpired(true)
    setSession(null)
    setRealUserProfile(null)
    setModulePermissions({})
    setPermissionsLoaded(true)
    loadedUserId.current = null
    // signOut limpia el token de localStorage; no es necesario await.
    supabase.auth.signOut()
  }

  /**
   * Empleado archivado (soft delete): cierra la sesión y muestra un aviso
   * distinto al de "sesión expirada" en LoginPage.
   */
  function handleAccountDisabled() {
    exitViewAs()
    setAccountDisabled(true)
    setSession(null)
    setRealUserProfile(null)
    setModulePermissions({})
    setPermissionsLoaded(true)
    loadedUserId.current = null
    supabase.auth.signOut()
  }

  async function fetchUserProfile(userId, { retry = true } = {}) {
    loadedUserId.current = userId
    const { data, error } = await supabase
      .from('users')
      .select(USER_PROFILE_SELECT)
      .eq('user_id', userId)
      .single()
    if (error) {
      if (isAuthError(error)) {
        handleSessionExpired()
        return
      }
      // Error no-auth (p.ej. PGRST116 si el usuario no existe aún, o un 406
      // transitorio por una carrera con el refresh del token justo al cargar
      // la página): reintenta una vez antes de rendirse con perfil null.
      if (retry) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        return fetchUserProfile(userId, { retry: false })
      }
      setRealUserProfile(null)
      return
    }
    if (data?.deleted_at) {
      handleAccountDisabled()
      return
    }
    setRealUserProfile(data)
    if (data?.company_id) await fetchModulePermissions(data.company_id)
    return data
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
      if (isAuthError(error)) {
        handleSessionExpired()
        return
      }
      setPermissionsLoaded(true)
      return
    }
    if (data) {
      const map = {}
      data.forEach((row) => {
        map[row.module_key] = row.rules
      })
      setModulePermissions(map)
    }
    setPermissionsLoaded(true)
  }

  /**
   * Perfil efectivo: el que ve la aplicación entera. Suplantar aquí —y no exponer
   * un campo nuevo— propaga el modo "Ver como" a los 3 guards de ruta, a todos los
   * can() y a los checks sueltos de access_level/admin sin tocar ni un consumidor.
   * Quien necesite la identidad real (el gate del propio selector) usa realUserProfile.
   */
  const userProfile = viewAsProfile ?? realUserProfile

  /** Apaga el modo sin tocar los permisos (para logout / sesión caída). */
  function exitViewAs() {
    setViewAsProfile(null)
    setViewOnly(false)
    clearStoredViewAs()
  }

  /**
   * Carga el perfil del usuario a suplantar y activa el solo-lectura.
   * @param {string} targetUserId
   * @param {object|null} realProfile — perfil real ya cargado (en el arranque el
   *   estado todavía no está asentado, así que se pasa explícito).
   */
  async function applyViewAs(targetUserId, realProfile) {
    const authority = realProfile ?? realUserProfile
    // Gate real: sin esto, escribir la clave de sessionStorage a mano bastaría
    // para auto-suplantarse.
    if (!canUseViewAs(authority)) return { error: 'No autorizado' }
    if (targetUserId === authority.user_id) {
      exitViewAs()
      return {}
    }

    const { data, error } = await supabase
      .from('users')
      .select(USER_PROFILE_SELECT)
      .eq('user_id', targetUserId)
      .single()
    if (error || !data) return { error: 'No se pudo cargar ese usuario' }

    // El solo-lectura se activa ANTES de exponer el perfil suplantado: si un efecto
    // reaccionara al cambio de userProfile con una escritura, ya estaría bloqueada.
    setViewOnly(true)
    setViewAsProfile(data)
    storeViewAs(targetUserId)
    if (data.company_id && data.company_id !== authority.company_id) {
      await fetchModulePermissions(data.company_id)
    }
    return {}
  }

  function startViewAs(targetUserId) {
    return applyViewAs(targetUserId, null)
  }

  async function stopViewAs() {
    const previousCompany = viewAsProfile?.company_id
    exitViewAs()
    // Solo si se habían recargado los permisos de otra empresa hay que restaurarlos.
    if (previousCompany && previousCompany !== realUserProfile?.company_id) {
      await fetchModulePermissions(realUserProfile?.company_id)
    }
  }

  useEffect(() => {
    async function initSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
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
          const profile = await fetchUserProfile(session.user.id)
          // Modo "Ver como" sobrevive a un F5 dentro de la misma pestaña.
          const storedViewAs = readStoredViewAs()
          if (storedViewAs) {
            if (canUseViewAs(profile)) await applyViewAs(storedViewAs, profile)
            else clearStoredViewAs()
          }
        }
      } catch {
        // getSession() rechazó de forma inesperada; loading baja igualmente.
      }
      setLoading(false)
    }

    initSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        // Un nuevo login (o token refresh exitoso) limpia cualquier aviso previo.
        setSessionExpired(false)
        setAccountDisabled(false)
        // Solo re-fetchear si el usuario cambia (evita remounts por TOKEN_REFRESHED
        // al refocar la pestaña, que desmontaría las vistas y perdería datos sin guardar).
        // Mientras el perfil carga, loading vuelve a true: si no, ProtectedRoute/
        // RequireModule renderizan con userProfile/modulePermissions aún vacíos y
        // canAccessModule() deniega todo, mandando al usuario a "/" justo tras el login.
        if (session.user.id !== loadedUserId.current) {
          setLoading(true)
          fetchUserProfile(session.user.id).finally(() => setLoading(false))
        }
      } else {
        loadedUserId.current = null
        exitViewAs()
        setRealUserProfile(null)
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
    // Antes del signOut: si el flag de solo lectura sobreviviera, el siguiente
    // login quedaría con la app bloqueada sin banner que lo explique.
    exitViewAs()
    return supabase.auth.signOut()
  }

  function resetPassword(email) {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  /** Refresca el perfil REAL. No pisa la suplantación si el modo está activo. */
  async function refreshProfile() {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession()
    if (currentSession) await fetchUserProfile(currentSession.user.id)
  }

  /**
   * Verifica si el usuario actual puede acceder a un módulo.
   * Admin siempre pasa; sin reglas configuradas → acceso libre.
   */
  const can = useCallback(
    (moduleKey) => canAccessModule(moduleKey, userProfile, modulePermissions),
    [userProfile, modulePermissions],
  )

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        userProfile,
        realUserProfile,
        isViewingAs: viewAsProfile !== null,
        startViewAs,
        stopViewAs,
        modulePermissions,
        permissionsLoaded,
        sessionExpired,
        accountDisabled,
        signIn,
        signOut,
        resetPassword,
        refreshProfile,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
