// Tipos del panel "Operación del día".
//
// Van aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async: exportar un tipo o una constante desde
// alli rompe el BUILD aunque el typecheck pase.

/** Cobertura de un turno: cuantos se programaron y cuantos marcaron. */
export interface CoberturaTurno {
  /** 1 | 2 para puestos de doble jornada; null = jornada unica. */
  turno: number | null
  etiqueta: string
  /** Rango horario real, tomado de horario_tolva cuando existe. */
  horario: string | null
  programados: number
  presentes: number
  /** Programados que todavia no tienen marcacion. */
  sinMarcar: number
}

/** Una fila de la bandeja: algo que requiere atencion hoy. */
export interface ItemBandeja {
  id: string
  /** rojo = bloquea o esta vencido · ambar = pendiente · verde = informativo */
  nivel: "alto" | "medio" | "bajo"
  titulo: string
  detalle: string
  /** Modulo de LIPgo al que lleva el boton (nombre exacto del menu). */
  moduloDestino: string | null
  textoBoton: string | null
}

/** Requisicion de personal en curso. */
export interface RequisicionResumen {
  id: string
  cargo: string
  proyecto: string
  vacantes: number
  estado: string
  /** Texto legible del avance de la doble aprobacion. */
  avance: string
  aprobadas: number
  totalPasos: number
}

export interface OperacionDiaData {
  /** Contexto */
  fecha: string
  quincena: { anio: number; mes: number; numero: 1 | 2; desde: string; hasta: string; etiqueta: string }

  /** Cabecera */
  personalActivo: number
  turnosProgramadosQuincena: number
  novedadesAbiertas: number

  /**
   * Cobertura de la quincena: turnos cubiertos vs turnos programados,
   * acumulado dia a dia. Es el anillo de la cabecera.
   */
  cobertura: { programados: number; cubiertos: number; pct: number; diasConDatos: number }

  /** Cobertura de hoy, por turno. */
  hoy: { turnos: CoberturaTurno[]; total: CoberturaTurno }

  /** Bandeja del dia. */
  bandeja: ItemBandeja[]

  /** Requisiciones de personal en curso. */
  requisiciones: RequisicionResumen[]

  /** Pago de la quincena en curso. */
  pago: {
    total: number
    personas: number
    /** null = no se pudo calcular (la vista pagonomina puede tardar). */
    disponible: boolean
    mensaje: string | null
  }

  /** Avisos de datos que no se pudieron leer, para no mostrar ceros falsos. */
  avisos: string[]
}
