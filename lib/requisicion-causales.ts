// Causales de contratación de personal en misión y su plazo legal.
//
// Colombia: una empresa de servicios temporales solo puede enviar personal en
// misión por las causales del Art. 77 de la Ley 50 de 1990. La causal no es un
// dato administrativo: define CUÁNTO TIEMPO puede durar la vinculación, y
// pasado ese tope la contratación tiene que ser directa con la usuaria.
//
// Los plazos están escritos aquí porque son de ley, no configuración del
// negocio. Si la ley cambia, se cambian acá con su referencia.

export interface CausalTemporal {
  id: string
  etiqueta: string
  /** Plazo máximo en texto, tal como lo enuncia la norma. */
  plazo: string
  /** Referencia legal, para que quien firma sepa de dónde sale. */
  norma: string
  /** Advertencia de lo que pasa al superar el tope. */
  nota: string
  /** Tope en días cuando la norma lo fija en tiempo; null si depende del hecho. */
  topeDias: number | null
}

export const CAUSALES_TEMPORALES: CausalTemporal[] = [
  {
    id: "ocasional",
    etiqueta: "Labor ocasional, accidental o transitoria",
    plazo: "Hasta 30 días",
    norma: "Art. 77 num. 1 Ley 50/1990 · Art. 6 CST",
    nota: "Es trabajo ajeno a la actividad normal de la empresa. Pasados los 30 días deja de ser ocasional.",
    topeDias: 30,
  },
  {
    id: "reemplazo",
    etiqueta: "Reemplazo por licencia, vacaciones o incapacidad",
    plazo: "Mientras dure la ausencia del titular",
    norma: "Art. 77 num. 2 Ley 50/1990",
    nota: "El plazo lo marca el regreso del titular. Si el titular no vuelve, el cargo deja de ser un reemplazo.",
    topeDias: null,
  },
  {
    id: "incremento",
    etiqueta: "Incremento de producción, transporte, ventas o cosechas",
    plazo: "6 meses, prorrogables 6 meses más",
    norma: "Art. 77 num. 3 Ley 50/1990",
    nota: "Máximo un año en total. Superado el tope, la vinculación debe ser directa con la usuaria.",
    topeDias: 365,
  },
  {
    id: "periodos_estacionales",
    etiqueta: "Períodos estacionales o picos de temporada",
    plazo: "6 meses, prorrogables 6 meses más",
    norma: "Art. 77 num. 3 Ley 50/1990",
    nota: "Mismo tope del incremento de producción: un año en total.",
    topeDias: 365,
  },
]

export function causalPorId(id: string | null | undefined): CausalTemporal | null {
  if (!id) return null
  return CAUSALES_TEMPORALES.find((c) => c.id === id) ?? null
}

/** Porcentajes patronales usados para estimar el costo de una vacante. */
export interface FactoresCosto {
  /** Prestaciones sociales (prima, cesantías, intereses, vacaciones). */
  pctPrestaciones: number
  /** Aportes patronales (pensión, ARL, caja y, si aplica, salud/SENA/ICBF). */
  pctAportes: number
  /** Margen de administración sobre el costo laboral. */
  pctAiu: number
  /** true = la empresa está exonerada de salud, SENA e ICBF (Art. 114-1 ET). */
  exonerada: boolean
}

export interface CostoVacante {
  /** Salario × vacantes. */
  salarioTotal: number
  prestaciones: number
  aportes: number
  /** Costo laboral antes del margen. */
  costoLaboral: number
  aiu: number
  total: number
  /** costo total / salario, para mostrarlo como "×1,52". */
  factor: number
}

/**
 * Costo mensual de una vacante.
 *
 * NO usa un factor fijo: suma los porcentajes reales de
 * `parametros_prestaciones` y `parametros_parafiscales`, que son editables
 * porque la ley cambia. Un 1,52 quemado en el código se vuelve mentira en
 * cuanto cambie una tasa, y nadie se entera.
 */
export function calcularCostoVacante(
  salarioMensual: number,
  vacantes: number,
  f: FactoresCosto,
): CostoVacante {
  const salarioTotal = Math.max(0, salarioMensual) * Math.max(0, vacantes)
  const prestaciones = salarioTotal * (f.pctPrestaciones / 100)
  const aportes = salarioTotal * (f.pctAportes / 100)
  const costoLaboral = salarioTotal + prestaciones + aportes
  const aiu = costoLaboral * (f.pctAiu / 100)
  const total = costoLaboral + aiu
  return {
    salarioTotal,
    prestaciones: Math.round(prestaciones),
    aportes: Math.round(aportes),
    costoLaboral: Math.round(costoLaboral),
    aiu: Math.round(aiu),
    total: Math.round(total),
    factor: salarioTotal > 0 ? total / salarioTotal : 0,
  }
}
