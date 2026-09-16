// Metadata de cada novedad del día, para poder mostrarlas con sigla, color y
// efecto en nómina sin repetir literales por toda la pantalla.
//
// NADA DE ESTO SE INVENTA. Cada campo se deriva de una fuente existente:
//  · `sigla` y `etiqueta`  — del propio texto de NOVEDADES_DIA (lleva el código
//                            adelante: "13- Incapacidad...", "31- Vacaciones...")
//  · `categoria`           — de categoriaDeNovedad() en lib/ausentismo-categorias
//  · `pagaElDia`           — de la rama `valor_base_final` de pagonomina
//                            (scripts/pagonomina_reemplazo.sql:635-637)
//  · `bloqueaDominical`    — de `bloquea_domingo` (mismo archivo, :290-301)
//  · `esFaltaPenalizable`  — de `es_falta_penalizable` (:285-289)
//
// El texto de la novedad ES la llave: pagonomina compara por igualdad estricta
// contra estas cadenas, con tilde y todo. No se normalizan ni se "arreglan" las
// rarezas del catálogo ("al 50" sin %, el código 38 usado por dos textos).

import { NOVEDADES_DIA, type NovedadDia } from "@/lib/asistencia-catalogos"

export interface NovedadMeta {
  /** El texto exacto que va a `registroasistencia.asistencia`. */
  valor: string
  /** Sigla corta para la tabla: IEG, PNR, VAC... */
  sigla: string
  /** Nombre legible, sin el código numérico del principio. */
  etiqueta: string
  /** Código de nómina (13, 38, 31...). null para las que no lo llevan. */
  codigo: string | null
  /**
   * ¿LIPgo paga el día?
   * Derivado de la rama `valor_base_final` de pagonomina: solo las
   * incapacidades 13/14/15, las vacaciones y los descansos pagan el día.
   * Las demás caen en ELSE 0.
   */
  pagaElDia: boolean
  /** Bloquea el pago del descanso dominical siguiente. */
  bloqueaDominical: boolean
  /** Cuenta como falta penalizable para el dominical de la semana. */
  esFaltaPenalizable: boolean
  /** Color del chip. */
  color: string
}

/**
 * OJO con el porcentaje del nombre: "al 50" y "al 66%" son la clasificación
 * LEGAL de quién asume el día (EPS vs empleador), NO el porcentaje que se le
 * reconoce al trabajador. En pagonomina el pct_pago_incapacidad es 100 y hay un
 * caso real documentado donde Siigo liquidó el día COMPLETO de una incapacidad
 * "al 66%". Multiplicar por 66 daría un número equivocado.
 */
const META: Record<string, Omit<NovedadMeta, "valor">> = {
  "38- Licencia no remunerada- Deducción": {
    sigla: "LNR", etiqueta: "Licencia no remunerada", codigo: "38",
    pagaElDia: false, bloqueaDominical: true, esFaltaPenalizable: false, color: "#dc2626",
  },
  "38- Suspensión temporal de Contrato- Deducción": {
    sigla: "SUS", etiqueta: "Suspensión temporal de contrato", codigo: "38",
    pagaElDia: false, bloqueaDominical: true, esFaltaPenalizable: false, color: "#dc2626",
  },
  "13- Incapacidad por enfermedad general al 100%": {
    sigla: "IEG", etiqueta: "Incapacidad general (100%)", codigo: "13",
    pagaElDia: true, bloqueaDominical: false, esFaltaPenalizable: false, color: "#d97706",
  },
  "14- Incapacidad por enfermedad general al 50": {
    sigla: "IEG", etiqueta: "Incapacidad general (50%)", codigo: "14",
    pagaElDia: true, bloqueaDominical: false, esFaltaPenalizable: false, color: "#d97706",
  },
  "15- Incapacidad por enfermedad general al 66%- ingreso": {
    sigla: "IEG", etiqueta: "Incapacidad general (66%)", codigo: "15",
    pagaElDia: true, bloqueaDominical: false, esFaltaPenalizable: false, color: "#d97706",
  },
  "16- Incapacidad por enfermedad profesional": {
    sigla: "AT", etiqueta: "Incapacidad por accidente o enfermedad laboral", codigo: "16",
    // No paga el día por esta vía: el AT lo asume la ARL.
    pagaElDia: false, bloqueaDominical: false, esFaltaPenalizable: true, color: "#b91c1c",
  },
  "20- Licencia maternidad/paternidad": {
    sigla: "LMP", etiqueta: "Licencia de maternidad o paternidad", codigo: "20",
    pagaElDia: false, bloqueaDominical: false, esFaltaPenalizable: true, color: "#7c3aed",
  },
  "21- Licencia por luto": {
    sigla: "LUT", etiqueta: "Licencia por luto", codigo: "21",
    pagaElDia: false, bloqueaDominical: false, esFaltaPenalizable: true, color: "#7c3aed",
  },
  "22- Licencia remunerada": {
    sigla: "LRE", etiqueta: "Licencia remunerada", codigo: "22",
    pagaElDia: false, bloqueaDominical: false, esFaltaPenalizable: true, color: "#7c3aed",
  },
  "31- Vacaciones disfrutadas": {
    sigla: "VAC", etiqueta: "Vacaciones disfrutadas", codigo: "31",
    pagaElDia: true, bloqueaDominical: false, esFaltaPenalizable: false, color: "#0284c7",
  },
  Retiro: {
    sigla: "RET", etiqueta: "Retiro", codigo: null,
    pagaElDia: false, bloqueaDominical: true, esFaltaPenalizable: false, color: "#475569",
  },
  Descanso: {
    sigla: "DES", etiqueta: "Descanso", codigo: null,
    pagaElDia: true, bloqueaDominical: true, esFaltaPenalizable: false, color: "#64748b",
  },
  "Descanso compensatorio domingo anterior": {
    sigla: "DCD", etiqueta: "Descanso compensatorio del domingo anterior", codigo: null,
    // A diferencia de "Descanso", este NO bloquea el dominical siguiente: la
    // semana con compensatorio es semana completa.
    pagaElDia: true, bloqueaDominical: false, esFaltaPenalizable: false, color: "#64748b",
  },
}

export const NOVEDADES_META: NovedadMeta[] = (NOVEDADES_DIA as readonly string[]).map((v) => ({
  valor: v,
  ...(META[v] ?? {
    sigla: "OTR",
    etiqueta: v,
    codigo: null,
    pagaElDia: false,
    bloqueaDominical: false,
    esFaltaPenalizable: true,
    color: "#64748b",
  }),
}))

const PORVALOR = new Map(NOVEDADES_META.map((m) => [m.valor, m]))

/** Metadata de una novedad. Si no está en el catálogo, devuelve algo usable. */
export function metaDeNovedad(valor: string | null | undefined): NovedadMeta | null {
  if (!valor) return null
  return (
    PORVALOR.get(valor) ?? {
      valor,
      sigla: "OTR",
      etiqueta: valor,
      codigo: null,
      pagaElDia: false,
      bloqueaDominical: false,
      esFaltaPenalizable: true,
      color: "#64748b",
    }
  )
}

export type { NovedadDia }
