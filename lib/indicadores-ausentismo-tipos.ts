// Tipos de los indicadores de ausentismo del periodo.
//
// Aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async.

/** Días perdidos por causa, con su peso dentro del total. */
export interface CausaAusentismo {
  id: string
  etiqueta: string
  dias: number
  pct: number
  color: string
}

/** Una persona con más de un evento en el periodo. */
export interface ReincidenciaPersona {
  identificacion: string
  nombre: string
  /** Episodios distintos (días consecutivos = un evento). */
  eventos: number
  /** Días calendario perdidos. */
  dias: number
  /** La causa que más días le aporta. */
  predominante: string
  predominanteColor: string
}

export interface IndicadoresAusentismoData {
  periodo: { desde: string; hasta: string; etiqueta: string }

  /**
   * Índice de ausentismo: días perdidos sobre días-persona esperados.
   *
   * Mismo criterio que el Panel de Gestión Humana: el denominador son los días
   * que la gente estuvo VINCULADA en el periodo (cruzando fecha de ingreso y de
   * retiro), no las filas de asistencia. Contar filas daría un número que puede
   * pasar del 100%.
   */
  indice: number | null
  /** Días-persona esperados: el denominador, para poder auditarlo. */
  diasEsperados: number
  /** Días perdidos por ausentismo real. */
  diasPerdidos: number

  /**
   * Costo del ausentismo. null = no se pudo calcular porque falta el salario de
   * las personas involucradas; nunca se estima.
   */
  costo: number | null
  /** Cuántas personas quedaron fuera del costo por no tener salario. */
  sinSalario: number

  /** Días por evento. */
  severidad: number | null
  /** Eventos distintos en el periodo. */
  eventos: number

  causas: CausaAusentismo[]
  reincidencia: ReincidenciaPersona[]

  /** Lo que no se pudo leer. Se muestra, no se esconde. */
  avisos: string[]
}
