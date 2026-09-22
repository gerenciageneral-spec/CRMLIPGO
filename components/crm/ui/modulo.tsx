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

import type { ComponentProps, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
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

/**
 * Celda de cuerpo de tabla.
 *
 * Existe por una sola razón, pero es la que define el aspecto del sistema: en
 * LIPgo *toda* celda lleva `text-xs` explícito. El tamaño por defecto de la
 * primitiva shadcn es `text-sm`, y esa diferencia de dos píxeles es lo que
 * separa un ERP denso de una web corriente. Dejarlo a criterio de cada pantalla
 * garantiza que la mitad se olvide.
 *
 * `num` alinea a la derecha y activa `tabular-nums`: sin cifras de ancho fijo
 * las unidades no quedan una debajo de otra y las columnas de dinero se leen mal.
 */
export function Td({
  children,
  num,
  fuerte,
  className,
  ...resto
}: {
  children?: ReactNode
  /** Columna numérica: derecha + cifras de ancho fijo. */
  num?: boolean
  /** Totales y claves de fila. */
  fuerte?: boolean
  className?: string
} & Omit<ComponentProps<typeof TableCell>, "children" | "className">) {
  return (
    <TableCell
      className={cn(
        "text-xs",
        num && "text-right tabular-nums",
        fuerte && "font-semibold",
        className,
      )}
      {...resto}
    >
      {children}
    </TableCell>
  )
}

/**
 * Marco de tabla: borde, esquinas y scroll en los dos ejes.
 *
 * En LIPgo ninguna tabla va suelta sobre el fondo; todas viven dentro de este
 * marco. El alto máximo evita que una tabla de mil filas empuje el pie de
 * página fuera del alcance del ratón.
 */
export function MarcoTabla({
  children,
  alto = "max-h-[600px]",
  className,
}: {
  children: ReactNode
  /** Clase de alto máximo. `"none"` para que crezca libre. */
  alto?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-md border bg-card",
        alto !== "none" && alto,
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Fila de "cargando" dentro del cuerpo de la tabla.
 *
 * Va DENTRO del `TableBody`, no encima ni al lado. Así la cabecera no
 * desaparece mientras llegan los datos y la tabla no cambia de tamaño de golpe
 * al terminar la carga, que es lo que produce el salto de contenido.
 */
export function FilaCargando({ columnas }: { columnas: number }) {
  return (
    <TableRow>
      <TableCell colSpan={columnas} className="h-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </TableCell>
    </TableRow>
  )
}

/** Fila de "sin resultados", también dentro del cuerpo, por lo mismo. */
export function FilaVacia({
  columnas,
  mensaje = "No se encontraron registros.",
}: {
  columnas: number
  mensaje?: string
}) {
  return (
    <TableRow>
      <TableCell colSpan={columnas} className="h-24 text-center text-xs text-muted-foreground">
        {mensaje}
      </TableCell>
    </TableRow>
  )
}

/**
 * Par etiqueta/valor: el bloque con el que LIPgo muestra un dato concreto.
 *
 * Etiqueta pequeña y apagada encima, valor destacado debajo. Se repite en las
 * cabeceras de detalle y dentro de los diálogos.
 */
export function Dato({
  etiqueta,
  children,
  num,
  className,
}: {
  etiqueta: string
  children?: ReactNode
  num?: boolean
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={cn("truncate text-sm font-medium text-foreground", num && "tabular-nums")}>
        {children ?? "-"}
      </p>
    </div>
  )
}

/**
 * Rejilla de datos de contexto, para la cabecera de un detalle.
 *
 * Mismo bloque que LIPgo pone arriba de sus vistas de detalle: fondo tenue,
 * y tantas columnas como quepan.
 */
export function ResumenDatos({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 rounded-lg bg-muted/30 p-4 md:grid-cols-4 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Píldora de resumen al pie de una tabla dentro de un diálogo: cuántas líneas,
 * cuánto suman. Evita que el usuario tenga que contar filas a ojo.
 */
export function PieResumen({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Un dato suelto dentro de `PieResumen`. */
export function PieDato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground">{etiqueta}: </span>
      <span className="font-semibold tabular-nums text-foreground">{valor}</span>
    </div>
  )
}
