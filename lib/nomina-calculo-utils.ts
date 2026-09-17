// Reglas de calculo de nomina/destajo COMPARTIDAS entre `revision-nomina-actions.ts`
// (liquidacion de pago) y `control-toneladas-actions.ts` (gestion operativa del
// coordinador) — un solo lugar para no desalinear el numero que ve nomina del que
// ve el coordinador. Archivo plano (sin "use server"): las tres funciones son
// sincronas y ninguna de las dos actions ya-server puede re-exportar funciones
// sync (Next.js exige que TODO export de un archivo "use server" sea async).

const CEDIS = new Set([3, 4]) // Cedi Funza, Cedi Medellin — sin bascula propia

/** Replica exacta de `peso_base_calculo` (053_pagonomina_reemplazo.sql). */
export function pesoBaseCalculo(
  idempresa: number,
  tipooperacion: string,
  pesovascula: number,
  pesoorden: number,
): { peso: number; fuente: "bascula" | "producto" } {
  if (CEDIS.has(idempresa) && tipooperacion === "Descargue") {
    if (pesovascula <= 0) return { peso: pesoorden, fuente: "producto" }
    const norm = pesoorden > 0 && pesovascula / pesoorden > 50 ? pesovascula / 1000 : pesovascula
    if (pesoorden > 0) {
      const ratio = norm / pesoorden
      if (ratio < 0.1 || ratio > 10) return { peso: pesoorden, fuente: "producto" }
    }
    return { peso: norm, fuente: "bascula" }
  }
  if (CEDIS.has(idempresa)) return { peso: pesoorden, fuente: "producto" }
  return { peso: pesovascula, fuente: "bascula" }
}

/**
 * AVIMOL (idempresa=2): la Distribucion NO se paga por destajo — el clon
 * automatico "+D" hereda los mismos `auxiliares` de su Cargue madre, asi que
 * sin esta exclusion esas personas se contarian dos veces (Cargue + Distribucion
 * clon). Mismo criterio que `053_pagonomina_reemplazo.sql` y
 * `lib/ajuste-proyeccion-actions.ts` — si se toca uno, tocar los tres.
 */
export function excluirAvimolDistribucion(idempresa: number, tipooperacion: string): boolean {
  return idempresa === 2 && tipooperacion === "Distribucion"
}

/**
 * "Trabajador activo/liquidable": estado != inactivo, sin fecha_retiro, con
 * contratosiigo diligenciado (sin eso no hay a quien cargarle la novedad en
 * Siigo). Tambien excluye "auxiliares de PRUEBA" en el llamador (por nombre,
 * no aqui) — ver `revision-nomina-actions.ts`.
 */
export function liquidable(r: any): boolean {
  if (String(r?.estado || "activo").trim().toLowerCase() === "inactivo") return false
  if (String(r?.fecha_retiro || "").trim()) return false
  if (!String(r?.contratosiigo || "").trim()) return false
  return true
}

/** Normaliza un nombre para cruzar `cabeceraoc.auxiliares` (CSV libre) contra
 * `registroasistencia.nombre` — mismo criterio en todos los cruces por nombre. */
export const normalizeName = (n: string | null | undefined) => (n ?? "").trim().toLowerCase()
