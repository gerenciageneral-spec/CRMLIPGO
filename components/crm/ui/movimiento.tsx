"use client"

// Micro-animaciones de entrada.
//
// LIPgo anima solo su dashboard de gerencia, y con clases de CSS
// (`animate-in fade-in slide-in-from-bottom-2`). Eso sirve para un bloque
// suelto, pero no sabe escalonar una lista ni animar la salida de un elemento
// que desaparece, porque cuando el nodo se quita del DOM ya no hay nada que
// animar.
//
// framer-motion ya estaba en el árbol (lo usa el splash) y resuelve las dos
// cosas. Aquí se envuelve en componentes con nombre para que los módulos no
// tengan que repetir las curvas ni los tiempos, y para que el escalonado sea
// el mismo en todas partes.
//
// REGLA: todo lo de aquí respeta `prefers-reduced-motion`. Quien lo tenga
// activado ve el contenido colocado, sin desplazamiento. No es un extra de
// accesibilidad: hay gente a la que este tipo de movimiento le produce mareo.

import type { ReactNode } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/** Curva suave de salida. La misma en todo el CRM. */
const SUAVE = [0.22, 1, 0.36, 1] as const

/**
 * Entrada de un bloque: aparece subiendo unos píxeles.
 *
 * `retraso` sirve para encadenar secciones de una pantalla (KPIs, luego
 * gráfica, luego tabla) sin que todo aparezca de golpe.
 */
export function Aparece({
  children,
  retraso = 0,
  desde = "abajo",
  className,
}: {
  children: ReactNode
  retraso?: number
  desde?: "abajo" | "arriba" | "izquierda" | "nada"
  className?: string
}) {
  const quieto = useReducedMotion()

  const desplazamiento =
    quieto || desde === "nada"
      ? {}
      : desde === "arriba"
        ? { y: -8 }
        : desde === "izquierda"
          ? { x: -8 }
          : { y: 8 }

  return (
    <motion.div
      initial={{ opacity: 0, ...desplazamiento }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: quieto ? 0 : 0.4, delay: quieto ? 0 : retraso, ease: SUAVE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * Lista escalonada: cada hijo entra un poco después que el anterior.
 *
 * El efecto guía la mirada de arriba abajo en vez de soltar doce tarjetas a la
 * vez. El escalón es corto a propósito —40ms— porque con una lista larga un
 * escalón mayor hace que los últimos elementos tarden en aparecer y se percibe
 * como lentitud, no como elegancia.
 */
export function ListaEscalonada({
  children,
  escalon = 0.04,
  className,
}: {
  children: ReactNode
  escalon?: number
  className?: string
}) {
  const quieto = useReducedMotion()

  return (
    <motion.div
      initial="oculto"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: quieto ? 0 : escalon } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Cada elemento de una `ListaEscalonada`. */
export function ElementoLista({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const quieto = useReducedMotion()

  return (
    <motion.div
      variants={{
        oculto: { opacity: 0, y: quieto ? 0 : 10 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: quieto ? 0 : 0.35, ease: SUAVE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * Transición entre vistas de un módulo.
 *
 * `mode="wait"` hace que la vista saliente termine antes de que entre la
 * nueva. Sin eso las dos se solapan y durante un instante se ven dos
 * contenidos encima del otro, que se lee como un fallo.
 *
 * La `clave` debe cambiar cuando cambia la vista: es lo que le dice a
 * AnimatePresence que hubo un reemplazo.
 */
export function CambioDeVista({
  clave,
  children,
  className,
}: {
  clave: string
  children: ReactNode
  className?: string
}) {
  const quieto = useReducedMotion()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={clave}
        initial={{ opacity: 0, y: quieto ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: quieto ? 0 : -6 }}
        transition={{ duration: quieto ? 0 : 0.2, ease: SUAVE }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Resalta un valor cuando cambia.
 *
 * En un tablero que se refresca solo cada minuto, un número que cambia sin
 * avisar pasa desapercibido. Un destello breve es lo que hace que el usuario
 * mire justo donde ocurrió algo.
 */
export function ValorVivo({
  children,
  valor,
  className,
}: {
  children: ReactNode
  /** Cuando esto cambia, se dispara el destello. */
  valor: string | number
  className?: string
}) {
  const quieto = useReducedMotion()

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={String(valor)}
        initial={quieto ? false : { opacity: 0.4, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: quieto ? 0 : 0.3, ease: SUAVE }}
        className={cn("inline-block", className)}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}
