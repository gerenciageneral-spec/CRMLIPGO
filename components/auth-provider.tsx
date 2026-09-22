"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"
import type { UserProfile } from "@/lib/auth-actions"

export interface AccessibleEmpresa {
  id: number
  nombre: string
}

/**
 * Empresa sobre la que opera el CRM: Harinera Indupan.
 *
 * Es el punto de partida, no un valor fijo. Todo el sistema se construyo
 * multiempresa (cada tabla lleva `idempresa`, cada consulta filtra por el), y
 * el dia que entre otra empresa basta con darle acceso al usuario: el selector
 * de la barra superior aparece solo cuando hay mas de una.
 */
export const EMPRESA_POR_DEFECTO = 1

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  // Empresa selection
  accessibleEmpresas: AccessibleEmpresa[]
  selectedEmpresaId: number | null
  selectedEmpresaNombre: string | null
  setSelectedEmpresaId: (id: number) => void
  loadingEmpresas: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  accessibleEmpresas: [],
  selectedEmpresaId: EMPRESA_POR_DEFECTO,
  selectedEmpresaNombre: null,
  setSelectedEmpresaId: () => {},
  loadingEmpresas: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastProfileId, setLastProfileId] = useState<string | null>(null)
  
  // Empresa selection state
  const [accessibleEmpresas, setAccessibleEmpresas] = useState<AccessibleEmpresa[]>([])
  // EMPRESA POR DEFECTO desde el primer render, no null.
  //
  // El CRM opera sobre una sola empresa (Harinera Indupan, id 1). Arrancar en
  // null obligaba a cada modulo a esperar a que /api/accessible-empresas
  // respondiera; si esa llamada tardaba o fallaba, `empresaId` se quedaba sin
  // valor, las consultas no se lanzaban y la pantalla quedaba cargando para
  // siempre sin decir por que.
  //
  // El dia que entre una segunda empresa, el selector la sobrescribe: esto es
  // solo el punto de partida, no un valor fijo. Por eso sigue habiendo
  // localStorage, selector y acceso por perfil.
  const [selectedEmpresaId, setSelectedEmpresaIdState] = useState<number | null>(EMPRESA_POR_DEFECTO)
  const [loadingEmpresas, setLoadingEmpresas] = useState(true)

  // SIN adaptador de cookies a propósito.
  //
  // La versión anterior implementaba get/set/remove con un parseo manual de
  // document.cookie. Esa es la API de las versiones antiguas de @supabase/ssr;
  // la 0.8 espera getAll/setAll y simplemente ignoraba aquel objeto. El
  // resultado era que la sesión se guardaba en un formato que el servidor no
  // sabía leer: el usuario entraba, pero cada server action lo veía como
  // anónimo, ningún módulo cargaba y el menú salía vacío.
  //
  // createBrowserClient ya maneja las cookies solo, y en el formato que el
  // cliente de servidor espera. No hay que ayudarle.
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  )

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const response = await fetch(`/api/user-profile?userId=${userId}`)
      if (!response.ok) {
        console.error("[v0] Failed to fetch profile:", response.statusText)
        return null
      }
      const profile = await response.json()
      return profile
    } catch (error) {
      console.error("[v0] Error fetching profile from API:", error)
      return null
    }
  }

  const fetchAccessibleEmpresas = useCallback(async () => {
    try {
      setLoadingEmpresas(true)
      const response = await fetch('/api/accessible-empresas')
      if (!response.ok) {
        // 401 = aún no hay sesión (pantalla de login / hidratación inicial):
        // estado esperado, no un error — un console.error aquí dispara el
        // overlay rojo del modo desarrollo y tapa toda la pantalla.
        if (response.status !== 401) console.warn("[crm] no se pudieron leer las empresas:", response.status)
        // Se deja la de por defecto para que el selector no quede vacio y los
        // modulos puedan seguir consultando.
        setAccessibleEmpresas((prev) =>
          prev.length ? prev : [{ id: EMPRESA_POR_DEFECTO, nombre: "Harinera Indupan" }],
        )
        return
      }
      const data = await response.json()
      if (data.success && data.data) {
        setAccessibleEmpresas(data.data)
        // Only set default empresa if none selected AND no profile empresa_id was set
        // The default from profile.empresa_id is set in the useEffect below
      }
    } catch (error) {
      console.error("[v0] Error fetching accessible empresas:", error)
    } finally {
      setLoadingEmpresas(false)
    }
  }, [])

  const setSelectedEmpresaId = useCallback((id: number) => {
    setSelectedEmpresaIdState(id)
    // Store in localStorage for persistence
    localStorage.setItem('selectedEmpresaId', id.toString())
  }, [])

  // Get selected empresa nombre
  const selectedEmpresaNombre = useMemo(() => {
    const empresa = accessibleEmpresas.find(e => e.id === selectedEmpresaId)
    return empresa?.nombre || null
  }, [accessibleEmpresas, selectedEmpresaId])

  useEffect(() => {
    let isLoadingProfile = false
    let isInitializing = true

    const getSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error("[v0] AuthProvider: Session error:", error)
        }

        setUser(session?.user ?? null)

        if (session?.user && !isLoadingProfile) {
          isLoadingProfile = true
          const userProfile = await fetchUserProfile(session.user.id)
          setProfile(userProfile)
          setLastProfileId(session.user.id)
          isLoadingProfile = false
        } else if (!session?.user) {
          setProfile(null)
          setLastProfileId(null)
        }
      } catch (error: any) {
        if (error?.message?.includes("Refresh Token") || error?.name === "AuthApiError") {
          setUser(null)
          setProfile(null)
        } else {
          console.error("[v0] Auth session error:", error)
        }
      } finally {
        setLoading(false)
        isInitializing = false
      }
    }

    getSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip redundant updates on initial load
      if (isInitializing) {
        return
      }

      // Only update user if it actually changed
      setUser((prevUser) => {
        if (prevUser?.id === session?.user?.id) {
          return prevUser
        }
        return session?.user ?? null
      })

      // Only load profile if the user ID changed
      if (session?.user?.id && lastProfileId !== session.user.id) {
        if (!isLoadingProfile) {
          isLoadingProfile = true
          try {
            const userProfile = await fetchUserProfile(session.user.id)
            setProfile(userProfile)
            setLastProfileId(session.user.id)
          } catch (error) {
            console.error("[v0] Error loading profile:", error)
          } finally {
            isLoadingProfile = false
          }
        }
      } else if (!session?.user) {
        setProfile(null)
        setLastProfileId(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, lastProfileId])

  // Load accessible empresas when profile is loaded
  useEffect(() => {
    if (profile) {
      // Orden de preferencia: lo que el usuario eligio la ultima vez, luego
      // la empresa de su perfil, y si no hay nada, la de por defecto.
      //
      // Nunca se deja en null: un `empresaId` sin valor hace que los modulos
      // no lancen sus consultas y la pantalla se quede cargando sin explicar
      // por que.
      const guardada = Number(localStorage.getItem('selectedEmpresaId'))
      setSelectedEmpresaIdState(
        Number.isFinite(guardada) && guardada > 0
          ? guardada
          : profile.empresa_id || EMPRESA_POR_DEFECTO,
      )
      fetchAccessibleEmpresas()
    }
  }, [profile, fetchAccessibleEmpresas])
  
  const handleSignOut = async () => {
    // Clear selected empresa from localStorage so next login uses profile default
    localStorage.removeItem('selectedEmpresaId')
    setSelectedEmpresaIdState(EMPRESA_POR_DEFECTO)
    setAccessibleEmpresas([])
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      signOut: handleSignOut,
      accessibleEmpresas,
      selectedEmpresaId,
      selectedEmpresaNombre,
      setSelectedEmpresaId,
      loadingEmpresas,
    }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
