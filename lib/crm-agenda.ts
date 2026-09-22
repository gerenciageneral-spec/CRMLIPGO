// Tipos y etiquetas de la agenda.
//
// SIN "use server": un archivo con esa directiva solo puede exportar funciones
// async. Exportar una constante desde alli hace que Next rechace el modulo
// ENTERO en tiempo de ejecucion ("can only export async functions, found
// object"), y con el se caen todas las server actions de la aplicacion: la
// pantalla queda en blanco sin mas pista que ese mensaje.
//
// Es el mismo patron que ya usaban crm-prospectos.ts y crm-cartera.ts.

export type EstadoCita = "pendiente" | "cumplida" | "reprogramada" | "cancelada"

export interface Cita {
  id: number
  idempresa: number
  titulo: string
  descripcion: string | null
  tipo: string
  fecha: string
  hora_inicio: string | null
  hora_fin: string | null
  prospecto_id: number | null
  cliente_id: number | null
  vendedor_id: number | null
  usuario_asignado: string | null
  estado: EstadoCita
  recordatorio_dias: number
  actividad_id: number | null
  direccion: string | null
  latitud: number | null
  longitud: number | null
  creado_por: string | null
  creado_en: string

  // Resueltos al leer
  prospecto_nombre?: string | null
  cliente_nombre?: string | null
}

export const ESTADO_CITA_LABEL: Record<EstadoCita, string> = {
  pendiente: "Pendiente",
  cumplida: "Cumplida",
  reprogramada: "Reprogramada",
  cancelada: "Cancelada",
}

export const TIPOS_CITA = [
  { valor: "visita", etiqueta: "Visita" },
  { valor: "llamada", etiqueta: "Llamada" },
  { valor: "reunion", etiqueta: "Reunión" },
  { valor: "entrega", etiqueta: "Entrega" },
  { valor: "cobro", etiqueta: "Cobro" },
  { valor: "otro", etiqueta: "Otro" },
]
