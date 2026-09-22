// Tipos y etiquetas de las listas de precios.
//
// SIN "use server", por la misma razon que crm-agenda.ts.

export type TipoLista = "manual" | "descuento_global" | "mixta"

export interface ListaPrecios {
  id: number
  idempresa: number
  nombre: string
  descripcion: string | null
  tipo: TipoLista
  descuento_global: number
  vigente_desde: string
  vigente_hasta: string | null
  es_default: boolean
  activo: boolean
  creado_por: string | null
  creado_en: string

  // Resueltos al leer
  productos_con_precio?: number
  clientes_asignados?: number
}

export interface LineaLista {
  id?: number
  idempresa?: number
  lista_id: number
  producto_id: number
  producto_nombre: string | null
  /** Exactamente uno de los dos: lo obliga un CHECK en la base. */
  precio_manual: number | null
  descuento_pct: number | null
  /** Piso absoluto: ni con el descuento maximo se baja de aqui. */
  precio_minimo: number | null
}

export const TIPO_LISTA_LABEL: Record<TipoLista, string> = {
  manual: "Precio por producto",
  descuento_global: "Descuento sobre el precio base",
  mixta: "Descuento global con excepciones",
}
