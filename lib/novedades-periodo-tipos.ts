// Tipos de las novedades del periodo.
//
// Aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async: exportar un tipo desde allí rompe el
// BUILD aunque el typecheck pase.

import type { CategoriaAusentismo } from "@/lib/ausentismo-categorias"

/**
 * Estado de una novedad.
 *
 * Solo hay dos, y eso es fiel a la realidad: las novedades del día NO tienen
 * flujo de aprobación. Se escriben en `registroasistencia.asistencia` y quedan
 * vigentes de inmediato --entran a nómina sin que nadie las apruebe--. La
 * columna `registroasistencia.aprobado` existe, pero es exclusiva de las horas
 * extra: ninguna rama de la liquidación del día la consulta.
 *
 * `en_tramite_arl` no es una aprobación: es el estado del expediente del
 * accidente ante la ARL, que sí existe en `sst_incidentes`.
 */
export type EstadoNovedad = "registrada" | "en_tramite_arl"

/** Una novedad del periodo, ya agrupada por episodio. */
export interface NovedadPeriodo {
  /** id de la primera fila del episodio en registroasistencia. */
  id: number
  /** Primer día del episodio. */
  fecha: string
  /** Último día. Igual a `fecha` cuando es de un solo día. */
  fechaFin?: string
  /** Días consecutivos del episodio. */
  dias?: number
  /** Todas las filas de registroasistencia que lo componen. */
  ids?: number[]

  trabajador: string
  identificacion: string

  /** El texto exacto guardado en `asistencia`. Es la llave para nómina. */
  valor: string
  sigla: string
  etiqueta: string
  color: string
  categoria: CategoriaAusentismo | null

  /** ¿LIPgo paga el día? Derivado de la regla de pagonomina. */
  pagaElDia: boolean
  /** ¿Bloquea el descanso dominical siguiente? */
  bloqueaDominical: boolean

  estado: EstadoNovedad

  /**
   * Efecto en pesos: lo liquidado con la novedad menos lo que la persona habría
   * ganado un día normal. Negativo = deja de pagarse.
   *
   * null = no se pudo calcular (sin referencia de día normal, o la vista de
   * pago no respondió). Se muestra un guion; NUNCA se estima.
   */
  impacto: number | null
  /** Lo liquidado ese día, tal cual sale de pagonomina. */
  liquidadoDia: number | null
}

export interface NovedadesPeriodoData {
  quincena: {
    anio: number
    mes: number
    numero: 1 | 2
    desde: string
    hasta: string
    etiqueta: string
  }
  novedades: NovedadPeriodo[]
  totales: {
    eventos: number
    dias: number
    enTramiteArl: number
    /** null si ninguna novedad pudo calcular su impacto. */
    impactoNeto: number | null
  }
  /** Lo que no se pudo leer. Se muestra, no se esconde. */
  avisos: string[]
}
