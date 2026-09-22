"use client"

// Tarjeta de KPI del CRM — UNICA en el proyecto.
//
// POR QUE ESTA: LIPgo tenia DOS kpi-card con APIs incompatibles
// (dashboard-gerencia con accent + count-up, y orders/dashboard-pedidos con
// variant + tokens CSS). Mantener dos significaba que dos dashboards del mismo
// sistema se vieran distintos. Esta unifica: se queda la API rica de
// dashboard-gerencia (count-up, invertTrend, decimales) pero pintando con los
// tokens CSS var(--chart-N) que usaba la de pedidos, que son los que sobreviven
// al cambio de tema claro/oscuro en vez de quedar fijos en una paleta.

import type { LucideIcon } from "lucide-react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCountUp, formatAnimatedNumber } from "./use-count-up"

/** Acentos semanticos. Cada uno mapea a un token --chart-N del tema. */
export type KpiAccent = "primary" | "success" | "warning" | "danger" | "info" | "neutral"

export interface KpiCardProps {
  icon: LucideIcon
  /** Etiqueta corta bajo el valor (ej. "Cartera vencida"). */
  label: string
  /** Numero -> se anima con count-up. String -> se pinta tal cual. */
  value: string | number
  /** Sufijo pegado al valor: "%", "t", "COP". */
  unit?: string
  /** Decimales a preservar en la animacion. Solo si `value` es numero. */
  decimals?: number
  /** Variacion respecto al periodo anterior. Se formatea "+12%". */
  trend?: number
  /** Texto del trend: "vs. mes anterior", "Meta: 95%". */
  trendHint?: string
  /**
   * Invierte el color del trend. Necesario en KPIs donde SUBIR ES MALO
   * (cartera vencida, prospectos estancados, dias de mora). Sin esto, un
   * aumento de cartera vencida se pintaria en verde, que es justo lo
   * contrario de lo que el gerente necesita ver.
   */
  invertTrend?: boolean
  accent?: KpiAccent
  /** Hace la tarjeta clickeable (ej. ir al modulo que detalla el KPI). */
  onClick?: () => void
  className?: string
}

/** Acento -> token del tema. Los var(--chart-N) los define styles/globals.css
 *  y cambian solos en modo oscuro; por eso no se hardcodean colores. */
const ACCENT: Record<KpiAccent, { icono: string; anillo: string }> = {
  primary: { icono: "bg-[var(--chart-1)]/12 text-[var(--chart-1)]", anillo: "ring-[var(--chart-1)]/20" },
  success: { icono: "bg-[var(--chart-2)]/12 text-[var(--chart-2)]", anillo: "ring-[var(--chart-2)]/20" },
  warning: { icono: "bg-[var(--chart-3)]/12 text-[var(--chart-3)]", anillo: "ring-[var(--chart-3)]/20" },
  danger: { icono: "bg-destructive/12 text-destructive", anillo: "ring-destructive/20" },
  info: { icono: "bg-[var(--chart-4)]/12 text-[var(--chart-4)]", anillo: "ring-[var(--chart-4)]/20" },
  neutral: { icono: "bg-muted text-muted-foreground", anillo: "ring-border" },
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  decimals = 0,
  trend,
  trendHint,
  invertTrend = false,
  accent = "primary",
  onClick,
  className,
}: KpiCardProps) {
  const esNumero = typeof value === "number" && Number.isFinite(value)
  const animado = useCountUp(esNumero ? (value as number) : 0)
  const mostrado = esNumero ? formatAnimatedNumber(animado, decimals) : String(value)

  // El signo decide el color; invertTrend lo da vuelta para los KPIs donde
  // subir es mala noticia.
  const hayTrend = typeof trend === "number" && Number.isFinite(trend)
  const bueno = hayTrend ? (invertTrend ? trend < 0 : trend > 0) : false
  const malo = hayTrend ? (invertTrend ? trend > 0 : trend < 0) : false
  const IconoTrend = !hayTrend || trend === 0 ? Minus : trend > 0 ? TrendingUp : TrendingDown

  const tono = ACCENT[accent]
  const clickeable = typeof onClick === "function"

  return (
    <div
      onClick={onClick}
      role={clickeable ? "button" : undefined}
      tabIndex={clickeable ? 0 : undefined}
      onKeyDown={
        clickeable
          ? (e) => {
              // Accesibilidad: si es clickeable con mouse, debe serlo con teclado.
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick!()
              }
            }
          : undefined
      }
      className={cn(
        "relative rounded-xl border bg-card p-4 ring-1 ring-inset transition-shadow",
        tono.anillo,
        clickeable && "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("rounded-lg p-2", tono.icono)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>

        {hayTrend && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              bueno && "bg-[var(--chart-2)]/12 text-[var(--chart-2)]",
              malo && "bg-destructive/12 text-destructive",
              !bueno && !malo && "bg-muted text-muted-foreground",
            )}
          >
            <IconoTrend className="h-3 w-3" aria-hidden="true" />
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{mostrado}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>

      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      {trendHint && <p className="mt-1 text-xs text-muted-foreground/80">{trendHint}</p>}
    </div>
  )
}
