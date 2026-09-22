"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LogIn, Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import { createBrowserClient } from "@supabase/ssr"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      console.log("[v0] Attempting client-side login with email:", email)

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        console.error("[v0] Login error:", signInError.message)
        setError(signInError.message || "Credenciales inválidas")
        setLoading(false)
        return
      }

      if (data.user) {
        console.log("[v0] Login successful, user:", data.user.id)
        console.log("[v0] Redirecting to home page...")
        // Marcamos el flag de "recien iniciado" para que la pagina
        // principal muestre el splash de bienvenida una sola vez tras
        // el login. Usamos sessionStorage (no localStorage) para que
        // se limpie al cerrar la pestana y NO vuelva a dispararse en
        // cada refresh manual.
        try {
          sessionStorage.setItem("lipgo:just-logged-in", "1")
        } catch {
          // Si sessionStorage no esta disponible (modo privado
          // restrictivo) seguimos sin splash en lugar de bloquear el
          // login.
        }
        // Redirect to home - AuthProvider will detect the session.
        // Si se llegó desde una URL protegida (p. ej. el QR de un montacarga:
        // /login?next=/equipo/abc) se vuelve allá en vez de soltar al usuario
        // en el inicio y obligarlo a escanear otra vez. Solo se aceptan rutas
        // internas: un `next` con host propio sería un redirect abierto.
        let destino = "/"
        try {
          const next = new URLSearchParams(window.location.search).get("next")
          if (next && next.startsWith("/") && !next.startsWith("//")) destino = next
        } catch {
          // sin querystring utilizable, se va al inicio
        }
        window.location.href = destino
      }
    } catch (err) {
      console.error("[v0] Exception during login:", err)
      setError("Error al iniciar sesión. Intente nuevamente.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <Image src="/lipgo-logo.png" alt="LIPGO CRM" width={200} height={60} className="h-16 w-auto mb-3" priority />
          <CardTitle className="text-2xl font-bold tracking-tight">
            LIPGO <span className="text-[var(--chart-1)]">CRM</span>
          </CardTitle>
          <CardDescription>Gestión comercial · Ingresa tus credenciales</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="sr-only">{showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}</span>
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                "Iniciando sesión..."
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Iniciar Sesión
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
