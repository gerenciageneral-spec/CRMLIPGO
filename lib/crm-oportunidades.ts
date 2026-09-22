// Tipos y etiquetas de las oportunidades de negocio.
//
// SIN "use server", por la misma razon que crm-agenda.ts: exportar una
// constante desde un archivo con esa directiva tumba todas las server actions.

export type TipoOportunidad =
  | "cliente_dormido"
  | "bajo_volumen"
  | "venta_cruzada"
  | "prospecto_estancado"
  | "cotizacion_sin_respuesta"
  | "cupo_sin_usar"

export interface Oportunidad {
  tipo: TipoOportunidad
  titulo: string
  detalle: string
  /** 1 (baja) a 5 (alta). Ordena la lista. */
  relevancia: number
  /** Cuánto podría valer, cuando se puede estimar. */
  valorPotencial?: number
  clienteId?: number
  prospectoId?: number
  accionSugerida: string
}

export const TIPO_OPORTUNIDAD_LABEL: Record<TipoOportunidad, string> = {
  cliente_dormido: "Dejó de comprar",
  bajo_volumen: "Bajó el volumen",
  venta_cruzada: "Venta cruzada",
  prospecto_estancado: "Prospecto estancado",
  cotizacion_sin_respuesta: "Cotización sin respuesta",
  cupo_sin_usar: "Cupo sin usar",
}
