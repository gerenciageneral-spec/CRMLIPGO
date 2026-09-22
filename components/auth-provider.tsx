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
  selectedEmpresaId: null,
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
  const [selectedEmpresaId, setSelectedEmpresaIdState] = useState<number | null>(null)
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
        if (response.status !== 401) console.warn("[v0] Failed to fetch accessible empresas:", response.status)
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
      // Try to restore selected empresa from localStorage first
      const storedEmpresaId = localStorage.getItem('selectedEmpresaId')
      if (storedEmpresaId) {
        setSelectedEmpresaIdState(parseInt(storedEmpresaId, 10))
      } else if (profile.empresa_id) {
        // If no stored value, use the user's profile empresa_id as default
        setSelectedEmpresaIdState(profile.empresa_id)
      }
      fetchAccessibleEmpresas()
    }
  }, [profile, fetchAccessibleEmpresas])
  
  const handleSignOut = async () => {
    // Clear selected empresa from localStorage so next login uses profile default
    localStorage.removeItem('selectedEmpresaId')
    setSelectedEmpresaIdState(null)
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
