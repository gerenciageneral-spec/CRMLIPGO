// Catálogo de conductas disciplinarias, con su referencia legal y la medida
// que la norma o el reglamento contemplan.
//
// LA MEDIDA ES UNA SUGERENCIA, NO UNA DECISIÓN. Quien radica el caso es la
// empresa usuaria; quien sanciona es el empleador (la temporal), y solo después
// de oír al trabajador en descargos. Por eso el campo se llama "sugerida" en
// todo el módulo: si dijera "medida", alguien la aplicaría sin trámite.
//
// Las referencias son del Código Sustantivo del Trabajo. Se escriben aquí
// porque son de ley, no configuración del negocio.

export interface ConductaDisciplinaria {
  id: string
  etiqueta: string
  /** Referencia legal de la conducta. */
  norma: string
  /** Lo que la norma o el reglamento contemplan para esa conducta. */
  medidaSugerida: string
  /** Gravedad, para ordenar y colorear. */
  gravedad: "leve" | "grave" | "muy_grave"
  /** Qué debe probar quien radica. Evita casos que se caen por falta de soporte. */
  soporteEsperado: string
}

export const CONDUCTAS: ConductaDisciplinaria[] = [
  {
    id: "ausencia_injustificada",
    etiqueta: "Ausencia sin justificación",
    norma: "Art. 60 y 112 CST · Reglamento Interno de Trabajo",
    medidaSugerida: "Llamado de atención escrito o suspensión de 1 a 3 días",
    gravedad: "grave",
    soporteEsperado: "Registro de asistencia del día y constancia de que no presentó excusa.",
  },
  {
    id: "llegadas_tarde",
    etiqueta: "Llegadas tarde reiteradas",
    norma: "Art. 58 num. 1 CST · Reglamento Interno de Trabajo",
    medidaSugerida: "Llamado de atención escrito; suspensión si hay reincidencia",
    gravedad: "leve",
    soporteEsperado: "Marcaciones con la hora real frente a la hora programada.",
  },
  {
    id: "incumplimiento_seguridad",
    etiqueta: "Incumplimiento de normas de seguridad",
    norma: "Art. 58 num. 2 CST · Art. 22 Ley 1562/2012",
    medidaSugerida: "Suspensión de 1 a 8 días según el riesgo generado",
    gravedad: "muy_grave",
    soporteEsperado: "Reporte del observador, evidencia fotográfica y constancia de entrega de EPP.",
  },
  {
    id: "uso_indebido_material",
    etiqueta: "Uso indebido de material o equipo",
    norma: "Art. 58 num. 3 CST",
    medidaSugerida: "Llamado de atención o suspensión según el daño causado",
    gravedad: "grave",
    soporteEsperado: "Descripción del daño, valor estimado y evidencia.",
  },
  {
    id: "abandono_puesto",
    etiqueta: "Abandono del puesto de trabajo",
    norma: "Art. 60 num. 4 CST",
    medidaSugerida: "Suspensión de 1 a 8 días",
    gravedad: "grave",
    soporteEsperado: "Hora de abandono, quién lo constató y si avisó a alguien.",
  },
  {
    id: "trato_irrespetuoso",
    etiqueta: "Trato irrespetuoso a compañeros o superiores",
    norma: "Art. 58 num. 5 CST",
    medidaSugerida: "Llamado de atención; suspensión si hay agresión",
    gravedad: "grave",
    soporteEsperado: "Relato de los hechos, testigos y contexto de lo ocurrido.",
  },
  {
    id: "incumplimiento_instrucciones",
    etiqueta: "Incumplimiento de instrucciones del supervisor",
    norma: "Art. 58 num. 1 CST",
    medidaSugerida: "Llamado de atención escrito",
    gravedad: "leve",
    soporteEsperado: "Cuál fue la instrucción, cuándo se dio y por qué no se cumplió.",
  },
  {
    id: "estado_alicoramiento",
    etiqueta: "Presentarse bajo efectos de alcohol o sustancias",
    norma: "Art. 60 num. 2 CST",
    medidaSugerida: "Suspensión; puede ser justa causa de terminación",
    gravedad: "muy_grave",
    soporteEsperado: "Constancia de quien lo constató y, si la hubo, prueba médica o de alcoholemia.",
  },
]

export function conductaPorId(id: string | null | undefined): ConductaDisciplinaria | null {
  if (!id) return null
  return CONDUCTAS.find((c) => c.id === id) ?? null
}

/** Estados del trámite, en el orden en que deben ocurrir. */
export const ESTADOS_DISCIPLINARIOS = [
  {
    id: "radicado",
    etiqueta: "Radicado",
    descripcion: "La usuaria reportó la conducta. El empleador debe citar a descargos.",
    color: "#f59e0b",
  },
  {
    id: "descargos_citados",
    etiqueta: "Descargos citados",
    descripcion: "Se citó al trabajador. Debe poder asistir con dos representantes (Art. 115 CST).",
    color: "#d97706",
  },
  {
    id: "descargos_realizados",
    etiqueta: "Descargos realizados",
    descripcion: "El trabajador fue oído. Falta la decisión del empleador.",
    color: "#0284c7",
  },
  {
    id: "resuelto",
    etiqueta: "Resuelto",
    descripcion: "El empleador decidió. La medida queda en la carpeta del trabajador.",
    color: "#059669",
  },
  {
    id: "archivado",
    etiqueta: "Archivado",
    descripcion: "El caso se cerró sin sanción.",
    color: "#64748b",
  },
] as const

export type EstadoDisciplinario = (typeof ESTADOS_DISCIPLINARIOS)[number]["id"]

export function estadoMeta(id: string | null | undefined) {
  return ESTADOS_DISCIPLINARIOS.find((e) => e.id === id) ?? ESTADOS_DISCIPLINARIOS[0]
}

/** Medidas que puede aplicar el empleador tras los descargos. */
export const MEDIDAS_APLICABLES = [
  "Llamado de atención verbal",
  "Llamado de atención escrito",
  "Suspensión de 1 día",
  "Suspensión de 2 días",
  "Suspensión de 3 días",
  "Suspensión de 8 días",
  "Terminación con justa causa",
  "Sin sanción",
] as const
