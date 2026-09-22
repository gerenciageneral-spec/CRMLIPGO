"use client"

// Piezas visuales compartidas por todos los módulos del CRM.
//
// Encapsulan el estilo que usaba LIPgo, extraído de sus módulos reales, para
// que no haya que repetirlo en veinticinco pantallas y para que cambiarlo sea
// tocar un archivo y no veinticinco.
//
// Lo que se conserva de allá:
//   - Módulo envuelto en Card, con CardHeader que lleva icono + título en
//     `text-lg font-semibold` (no un h1 suelto).
//   - Cabecera de tabla con fondo `bg-muted/50` y celdas `text-xs font-semibold`.
//   - Filas con `hover:bg-muted/30`.
//   - Badges de estado con color semántico explícito (bg-50 / text-700 /
//     border-200), no las variantes genéricas de shadcn.

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TableHead, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

/**
 * Contenedor estándar de un módulo.
 *
 * Todos los módulos se ven igual: tarjeta, icono, título y la barra de
 * acciones a la derecha. Sin esto cada pantalla inventaba su propia cabecera y
 * el sistema parecía cinco sistemas distintos.
 */
export function ModuloCard({
  titulo,
  icono: Icono,
  descripcion,
  acciones,
  children,
  className,
  sinPadding,
}: {
  titulo: string
  icono?: LucideIcon
  descripcion?: string
  /** Botones o filtros alineados a la derecha del título. */
  acciones?: ReactNode
  children: ReactNode
  className?: string
  /** Para tablas a sangre, que traen su propio borde. */
  sinPadding?: boolean
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              {Icono && <Icono className="h-5 w-5 shrink-0 text-[var(--chart-1)]" aria-hidden="true" />}
              {titulo}
            </CardTitle>
            {descripcion && (
              <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>
            )}
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
      </CardHeader>
      <CardContent className={sinPadding ? "p-0" : undefined}>{children}</CardContent>
    </Card>
  )
}

/** Fila de cabecera de tabla, con el fondo tenue de LIPgo. */
export function CabeceraTabla({ children }: { children: ReactNode }) {
  return <TableRow className="bg-muted/50">{children}</TableRow>
}

/**
 * Celda de cabecera.
 *
 * `align` no es capricho: los números se leen mal alineados a la izquierda,
 * porque las unidades no quedan una debajo de otra.
 */
export function Th({
  children,
  align = "left",
  className,
}: {
  children: ReactNode
  align?: "left" | "right" | "center"
  className?: string
}) {
  return (
    <TableHead
      className={cn(
        "text-xs font-semibold",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </TableHead>
  )
}

/** Tonos de los badges de estado. Mismos valores que usaba LIPgo. */
export type TonoEstado =
  | "neutral" | "info" | "exito" | "advertencia" | "peligro" | "proceso"

const TONO: Record<TonoEstado, string> = {
  neutral: "bg-slate-50 text-slate-700 border-slate-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  exito: "bg-emerald-50 text-emerald-700 border-emerald-200",
  advertencia: "bg-amber-50 text-amber-700 border-amber-200",
  peligro: "bg-red-50 text-red-700 border-red-200",
  proceso: "bg-violet-50 text-violet-700 border-violet-200",
}

/**
 * Badge de estado.
 *
 * Con color semántico explícito y no `variant`: en LIPgo el estado se lee de un
 * vistazo por el color, y las variantes genéricas de shadcn pintan casi todo
 * del mismo gris.
 */
export function BadgeEstado({
  children,
  tono = "neutral",
  icono: Icono,
  className,
}: {
  children: ReactNode
  tono?: TonoEstado
  icono?: LucideIcon
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", TONO[tono], className)}>
      {Icono && <Icono className="h-3 w-3" aria-hidden="true" />}
      {children}
    </Badge>
  )
}

/** Estado vacío uniforme, en vez de que cada módulo improvise el suyo. */
export function SinDatos({
  icono: Icono,
  mensaje,
  ayuda,
  accion,
}: {
  icono?: LucideIcon
  mensaje: string
  /** Qué puede hacer el usuario. Un vacío sin salida es un callejón. */
  ayuda?: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {Icono && <Icono className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />}
      <p className="text-sm font-medium">{mensaje}</p>
      {ayuda && <p className="max-w-sm text-sm text-muted-foreground">{ayuda}</p>}
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  )
}

/**
 * Tira de indicadores sobre el contenido del módulo.
 *
 * Equivale a la barra de KPIs que LIPgo mostraba en cada módulo. Allá salía del
 * cuadro de mando del SIG; aquí cada módulo le pasa las cifras que le importan.
 */
export function TiraIndicadores({
  items,
}: {
  items: { etiqueta: string; valor: string | number; tono?: TonoEstado; icono?: LucideIcon }[]
}) {
  if (!items.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => {
        const Icono = i.icono
        return (
          <div
            key={i.etiqueta}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5",
              TONO[i.tono ?? "neutral"],
            )}
          >
            {Icono && <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span className="text-xs">{i.etiqueta}</span>
            <span className="text-sm font-semibold tabular-nums">{i.valor}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Clase de fila con el hover de LIPgo. Se usa suelta porque TableRow admite
 *  className y envolverla añadiría un componente por nada. */
export const filaTabla = "hover:bg-muted/30"
