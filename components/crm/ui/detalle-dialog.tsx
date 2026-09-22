"use client"

// Diálogo de detalle: el patrón de "clic en un botón y aparece la información".
//
// En LIPgo esto no se resuelve con paneles laterales ni cajones: se revisaron
// sus módulos y hay 94 archivos con Dialog, cero con Sheet y cero con Drawer.
// La decisión ya está tomada allá, así que aquí se respeta en vez de inventar
// una tercera forma.
//
// Dos tamaños, que cubren lo que hace falta:
//   - `ancho="normal"` (max-w-2xl): una ficha de datos.
//   - `ancho="tabla"` (max-w-4xl): detalle con una tabla de líneas dentro.
//
// Con `pie` el diálogo pasa a columna flexible: cabecera y pie quedan fijos y
// solo el cuerpo desplaza. Sin eso, en un pedido de cuarenta líneas el botón de
// cerrar queda fuera de la pantalla y hay que desplazar hasta el final para
// salir.

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function DetalleDialog({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  icono: Icono,
  ancho = "normal",
  pie,
  children,
  className,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: ReactNode
  /** Contexto de la cabecera: número de documento, cliente, placa… */
  subtitulo?: ReactNode
  icono?: LucideIcon
  ancho?: "normal" | "tabla" | "ancho"
  /** Botones del pie. Al pasarlo, solo el cuerpo desplaza. */
  pie?: ReactNode
  children: ReactNode
  className?: string
}) {
  const medida =
    ancho === "tabla" ? "sm:max-w-4xl" : ancho === "ancho" ? "sm:max-w-5xl" : "sm:max-w-2xl"

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent
        className={cn(
          medida,
          // Con pie: alto fijo y columna, para que el pie no se vaya de la
          // pantalla. Sin pie: el diálogo crece con su contenido hasta el tope.
          pie ? "flex max-h-[85vh] flex-col" : "max-h-[90vh] overflow-y-auto",
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icono && <Icono className="h-5 w-5 shrink-0 text-[var(--chart-1)]" aria-hidden="true" />}
            <span className="min-w-0 truncate">{titulo}</span>
          </DialogTitle>
          {subtitulo && (
            <DialogDescription className="truncate">{subtitulo}</DialogDescription>
          )}
        </DialogHeader>

        <div className={cn("space-y-4", pie && "flex-1 overflow-y-auto pr-1")}>{children}</div>

        {pie && <DialogFooter className="shrink-0">{pie}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Nota de procedencia al pie de un detalle.
 *
 * LIPgo cierra sus fichas diciendo de dónde salen las cifras. Es lo que evita
 * la discusión de "este número no me cuadra": el usuario ve contra qué
 * contrastarlo sin tener que preguntar.
 */
export function FuenteDato({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>
}

export default DetalleDialog
