// Claves de los parametros de negocio del CRM.
//
// SIN "use server" A PROPOSITO: este archivo exporta constantes y tipos, y un
// modulo con esa directiva solo puede exportar funciones async. Las funciones
// que LEEN los parametros viven en crm-parametros-actions.ts. Es el mismo
// patron que ya usaba LIPgo con permissions-map.ts / permissions-actions.ts.
//
// POR QUE CONSTANTES Y NO STRINGS SUELTOS: escribir
// getParamNumber("cotizacion.vigencia_dias") en veinte sitios significa que un
// dia alguien escribe "cotizacion.vigencia_dia" y el sistema toma el valor por
// defecto en silencio, sin error, y las cotizaciones vencen cuando no deben.
// Con PARAM.COTIZACION_VIGENCIA, ese error no compila.

export const PARAM = {
  // Fiscal
  IVA: "iva.porcentaje_default",

  // Cotizaciones
  COTIZACION_VIGENCIA: "cotizacion.vigencia_dias",
  COTIZACION_ALERTA_VENCIMIENTO: "cotizacion.dias_alerta_vencimiento",

  // Prospectos
  PROSPECTO_ALERTA_SEGUIMIENTO: "prospecto.dias_alerta_seguimiento",
  PROSPECTO_DIAS_FRIO: "prospecto.dias_sin_gestion_frio",
  VISITA_RADIO_GPS: "visita.radio_validacion_gps",

  // Comisiones
  COMISION_PORCENTAJE: "comision.porcentaje_default",
  COMISION_MOMENTO: "comision.momento_causacion",
  COMISION_BASE: "comision.base",

  // Cartera
  CARTERA_RANGO_1: "cartera.rango_1_hasta",
  CARTERA_RANGO_2: "cartera.rango_2_hasta",
  CARTERA_RANGO_3: "cartera.rango_3_hasta",
  CARTERA_ALERTA_VENCIMIENTO: "cartera.dias_alerta_vencimiento",
  CARTERA_BLOQUEAR_MORA: "cartera.bloquear_por_mora",
  CARTERA_DIAS_MORA_BLOQUEO: "cartera.dias_mora_bloqueo",

  // Credito
  CREDITO_VALIDAR_CUPO: "credito.validar_cupo",
  CREDITO_DIAS_DEFAULT: "credito.dias_default",

  // Descuentos
  DESCUENTO_MAXIMO_VENDEDOR: "descuento.maximo_vendedor",

  // Pedidos
  PEDIDO_DOBLE_AUTORIZACION: "pedido.requiere_doble_autorizacion",
  PEDIDO_UMBRAL_GERENCIA: "pedido.monto_autorizacion_gerencia",

  // Rutas
  RUTA_MAX_PARADAS: "ruta.max_paradas_dia",
  RUTA_VELOCIDAD_KMH: "ruta.velocidad_promedio_kmh",
} as const

export type ParamKey = (typeof PARAM)[keyof typeof PARAM]

/** Valores de respaldo. Solo se usan si la base no responde o si falta la fila:
 *  una pantalla que no carga es mejor que una que calcula con cero. Deben
 *  coincidir con la semilla del script 181. */
export const PARAM_FALLBACK: Record<ParamKey, string> = {
  "iva.porcentaje_default": "5",
  "cotizacion.vigencia_dias": "15",
  "cotizacion.dias_alerta_vencimiento": "3",
  "prospecto.dias_alerta_seguimiento": "7",
  "prospecto.dias_sin_gestion_frio": "30",
  "visita.radio_validacion_gps": "500",
  "comision.porcentaje_default": "2.5",
  "comision.momento_causacion": "recaudo",
  "comision.base": "subtotal",
  "cartera.rango_1_hasta": "30",
  "cartera.rango_2_hasta": "60",
  "cartera.rango_3_hasta": "90",
  "cartera.dias_alerta_vencimiento": "5",
  "cartera.bloquear_por_mora": "true",
  "cartera.dias_mora_bloqueo": "15",
  "credito.validar_cupo": "true",
  "credito.dias_default": "30",
  "descuento.maximo_vendedor": "10",
  "pedido.requiere_doble_autorizacion": "true",
  "pedido.monto_autorizacion_gerencia": "0",
  "ruta.max_paradas_dia": "12",
  "ruta.velocidad_promedio_kmh": "35",
}

/** Como se llama cada grupo en la pantalla de Parametrizacion. */
export const GRUPOS_PARAMETROS: Record<string, string> = {
  fiscal: "Impuestos",
  cotizaciones: "Cotizaciones",
  prospectos: "Prospectos y visitas",
  comisiones: "Comisiones",
  cartera: "Cartera y cobranza",
  credito: "Credito",
  descuentos: "Descuentos",
  pedidos: "Pedidos y autorizaciones",
  rutas: "Rutas y planificacion",
}

export interface CrmParametro {
  id: number
  idempresa: number
  clave: string
  valor: string
  tipo: "number" | "string" | "boolean" | "json" | "date"
  grupo: string
  etiqueta: string
  descripcion: string | null
  unidad: string | null
  min_valor: number | null
  max_valor: number | null
  vigente_desde: string
  vigente_hasta: string | null
  editable: boolean
  actualizado_por: string | null
  actualizado_en: string
}

/** Momentos en que puede causarse una comision (parametro COMISION_MOMENTO). */
export type MomentoComision = "recaudo" | "despacho" | "autorizacion"

export const MOMENTO_COMISION_LABEL: Record<MomentoComision, string> = {
  recaudo: "Cuando el cliente paga",
  despacho: "Cuando se despacha el pedido",
  autorizacion: "Cuando se autoriza el pedido",
}
