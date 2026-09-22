"use client"

// Banner "¿Quieres instalar LIPGO CRM?" para escritorio y movil.
// - Escritorio/Android (Chromium): captura `beforeinstallprompt` y al pulsar
//   "Sí, instalar" dispara el instalador nativo (crea el acceso directo con el
//   icono de LIPgo definido en el manifest).
// - Si el navegador aun no expone ese evento (o no lo soporta: iOS/Safari,
//   Firefox), mostramos instrucciones claras para instalar manualmente.
// Registra ademas el service worker (requisito de instalabilidad) y recuerda
// el descarte del usuario por un tiempo para no ser insistente.

import { useEffect, useState } from "react"
import Image from "next/image"
import { Download, Share, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const DISMISS_KEY = "lipgo-pwa-dismissed-at"
const DISMISS_DAYS = 14

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type Plataforma = "ios" | "android" | "chromium-desktop" | "otro"

function estaInstalada() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  )
}

function detectarPlataforma(): Plataforma {
  if (typeof navigator === "undefined") return "otro"
  const ua = navigator.userAgent
  const iPhone = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ se identifica como Mac; lo distinguimos por la pantalla tactil.
  const iPad = /Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1
  if (iPhone || iPad) return "ios"
  if (/Android/.test(ua)) return "android"
  // Chromium de escritorio (Chrome/Edge/Brave/Opera), no Firefox ni Safari.
  const chromium = /Chrome|Chromium|Edg|OPR/.test(ua) && !/Firefox/.test(ua)
  if (chromium) return "chromium-desktop"
  return "otro"
}

function descartadoReciente() {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    if (!v) return false
    return Date.now() - Number(v) < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

function recordarDescarte() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [plataforma, setPlataforma] = useState<Plataforma>("otro")

  useEffect(() => {
    // Registrar el service worker (habilita la instalacion de la PWA).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

    if (estaInstalada() || descartadoReciente()) return

    setPlataforma(detectarPlataforma())

    // Algunos navegadores disparan beforeinstallprompt antes de montar React;
    // un pequeño capturador global (ver layout) lo deja en window.__lipgoBIP.
    const preCaptured = (window as any).__lipgoBIP as BeforeInstallPromptEvent | null
    if (preCaptured) setDeferred(preCaptured)

    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener("beforeinstallprompt", onBIP)
    window.addEventListener("lipgo-bip", onBIP as EventListener)

    // Mostrar el banner de todas formas tras un momento: si el evento nativo
    // no llega, damos instrucciones para instalar manualmente.
    const timer = setTimeout(() => setVisible(true), 1500)

    const onInstalled = () => {
      setVisible(false)
      recordarDescarte()
    }
    window.addEventListener("appinstalled", onInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP)
      window.removeEventListener("lipgo-bip", onBIP as EventListener)
      window.removeEventListener("appinstalled", onInstalled)
      clearTimeout(timer)
    }
  }, [])

  const cerrar = () => {
    setVisible(false)
    recordarDescarte()
  }

  const instalar = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    setVisible(false)
    if (outcome !== "accepted") recordarDescarte()
  }

  if (!visible) return null

  // Instruccion manual segun la plataforma (cuando no hay instalador nativo).
  const instruccion =
    plataforma === "ios" ? (
      <span className="block space-y-1">
        <span className="block font-medium text-card-foreground">En iPhone/iPad se instala así (desde Safari):</span>
        <span className="flex flex-wrap items-center gap-1">
          1. Toca <Share className="h-4 w-4 text-primary" /> <strong>Compartir</strong> (abajo).
        </span>
        <span className="block">2. Elige <strong>“Añadir a pantalla de inicio”</strong>.</span>
        <span className="block">3. Toca <strong>“Añadir”</strong>. Quedará como app en tu pantalla.</span>
      </span>
    ) : plataforma === "android" ? (
      <span>
        Abre el menú <strong>⋮</strong> del navegador y elige{" "}
        <strong>“Instalar app”</strong> o <strong>“Añadir a pantalla de inicio”</strong>.
      </span>
    ) : plataforma === "chromium-desktop" ? (
      <span>
        Usa el ícono <strong>⊕ Instalar</strong> de la barra de direcciones, o el menú{" "}
        <strong>⋮</strong> → <strong>“Instalar LIPGO CRM”</strong>.
      </span>
    ) : (
      <span>
        Para instalarla, ábrela en <strong>Chrome</strong> o <strong>Edge</strong> y usa
        “Instalar LIPGO CRM”.
      </span>
    )

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] flex justify-center p-3 sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            <Image src="/lipgo-icon.png" alt="LIPGO CRM" width={48} height={48} className="h-12 w-12 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-card-foreground">¿Quieres instalar LIPGO CRM?</p>
            {deferred ? (
              <>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Instala el acceso directo en tu dispositivo para abrir el CRM con un toque, como una app.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={instalar} className="gap-1.5">
                    <Download className="h-4 w-4" /> Sí, instalar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cerrar}>
                    Ahora no
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-card-foreground">
                {instruccion}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
