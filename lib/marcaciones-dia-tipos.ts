// Tipos del panel de marcaciones del día (tablet de portería).
//
// Aparte del archivo de acciones porque ese es "use server" y esos archivos
// solo pueden exportar funciones async.

/** Cómo llegó una persona respecto a su turno programado. */
export type EstadoMarcacion = "a_tiempo" | "tarde" | "no_presentado" | "sin_turno"

export interface MarcacionDia {
  identificacion: string
  nombre: string
  /** Hora real de marcación (HH:MM). null = no marcó. */
  hora: string | null
  /** Hora de entrada programada (HH:MM). null = no tenía turno. */
  horaProgramada: string | null
  /** Puesto del turno programado. */
  puesto: string | null
  /** Turno 1 o 2 para puestos de doble jornada; null = jornada única. */
  turno: number | null
  estado: EstadoMarcacion
  /** Minutos de tardanza. 0 si llegó a tiempo. */
  minutosTarde: number
  /** Novedad del día, si tiene. Explica la ausencia. */
  novedad: string | null
}

export interface MarcacionesDiaData {
  fecha: string
  marcaciones: MarcacionDia[]
  resumen: {
    /** Cuántas personas marcaron hoy. */
    marcaron: number
    aTiempo: number
    tarde: number
    /** Tenían turno y no marcaron, sin novedad que lo explique. */
    noPresentados: number
    /** Ausencias justificadas con novedad: no son "no presentados". */
    conNovedad: number
    /** Turnos programados para hoy. Denominador del cumplimiento. */
    programados: number
    /** % de los programados que llegó a tiempo. null si no hay turnos. */
    pctCumplimiento: number | null
    /** Turnos presentes en el día, para la etiqueta ("T1 y T2"). */
    turnos: string[]
  }
  /** Lo que no se pudo leer. Se muestra, no se esconde. */
  avisos: string[]
}
