"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Hook `useCountUp` — anima un numero desde su valor previo hasta el nuevo
 * aplicando un easing suave (easeOutCubic). Se usa en los KPIs para que los
 * cambios (auto-refresh cada 60s, cambios de empresa, etc.) se sientan
 * organicos en lugar de saltos abruptos.
 *
 *  - Respeta `prefers-reduced-motion` (retorna el valor final inmediato).
 *  - Tolera strings que contengan unidades mezcladas (ej. "94.7%")
 *    extrayendo el numero para animarlo y dejando la unidad como prop
 *    separado en `KpiCard`.
 *  - El primer render animado arranca desde 0 para dar efecto "boot up"
 *    del panel.
 */
export function useCountUp(target: number, options?: { durationMs?: number }): number {
  const duration = options?.durationMs ?? 900
  const [display, setDisplay] = useState<number>(() =>
    Number.isFinite(target) ? 0 : 0,
  )
  const fromRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const prevTargetRef = useRef<number | null>(null)

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setDisplay(0)
      return
    }

    // Evitar re-animar si el valor no cambio.
    if (prevTargetRef.current === target) return

    // Respetar reduced motion.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reduce) {
      setDisplay(target)
      prevTargetRef.current = target
      fromRef.current = target
      return
    }

    const from = prevTargetRef.current === null ? 0 : fromRef.current
    const start = performance.now()

    const tick = (t: number) => {
      const elapsed = t - start
      const p = Math.min(1, elapsed / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3)
      const next = from + (target - from) * eased
      setDisplay(next)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    prevTargetRef.current = target

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return display
}

/**
 * Formatea un numero animado intentando preservar el aspecto del target
 * original. Acepta `decimals` (0 por defecto) y devuelve tabular numerics.
 */
export function formatAnimatedNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "--"
  const rounded =
    decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n)
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded)
}
