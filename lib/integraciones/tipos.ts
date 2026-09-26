// Tipos de la capa de integracion (INT-01 a INT-13).
//
// Ningun modulo de negocio conoce a SAP, a Meta ni a ningun proveedor: conocen
// estas interfaces. Detras de cada una hay una implementacion desactivada, una
// simulada y una real, y cual se usa es configuracion.

/** Modo global de SAP. Viene de la variable de entorno SAP_MODE. */
export type ModoSap = "disabled" | "mock" | "live"

export type SistemaExterno = "sap" | "lipgo" | "whatsapp" | "ocr" | "email"

/** Flujos de SAP, cada uno con su interruptor en crm_parametros. */
export type FlujoSap = "pedidos" | "recaudos" | "clientes" | "facturas" | "inventario" | "sucursales"

export type EstadoOutbox = "pendiente" | "procesando" | "enviado" | "error" | "omitido" | "descartado"

export interface RegistroOutbox {
  id: number
  idempresa: number
  sistema: SistemaExterno
  flujo: string
  entidad: string
  entidad_id: number | null
  operacion: string
  payload: Record<string, unknown>
  idempotency_key: string
  estado: EstadoOutbox
  intentos: number
  max_intentos: number
  proximo_intento_en: string
  ultimo_error: string | null
  referencia_externa: string | null
  respuesta: Record<string, unknown> | null
  creado_por: string | null
  creado_en: string
  enviado_en: string | null
}

/** Lo que devuelve cualquier gateway al intentar un envio. Nunca lanza. */
export interface ResultadoEnvio {
  ok: boolean
  /** Numero de documento en el sistema externo (DocEntry de SAP, wamid…). */
  referencia?: string
  respuesta?: Record<string, unknown>
  error?: string
  /** false cuando reintentar no va a cambiar nada (datos invalidos). */
  reintentable?: boolean
  /** Para el log: que se mando y con que codigo HTTP respondio. */
  request?: Record<string, unknown>
  httpStatus?: number
}

/**
 * Contrato con SAP (INT-01). Una operacion generica en vez de un metodo por
 * documento: el outbox guarda `operacion` + `payload`, y el gateway sabe
 * traducir cada operacion a su endpoint.
 */
export interface SapGateway {
  readonly modo: ModoSap
  ejecutar(operacion: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<ResultadoEnvio>
}

/** Canal de notificaciones (INT-12). */
export interface CanalNotificacion {
  readonly nombre: string
  readonly activo: boolean
  enviarAviso(p: AvisoEstandar): Promise<ResultadoEnvio>
}

/** Aviso con la plantilla generica de WhatsApp ya aprobada en Meta. */
export interface AvisoEstandar {
  celular: string
  /** Encabezado: titulo del aviso. */
  titulo: string
  /** A quien se dirige, normalmente el nombre de pila. */
  destinatario: string
  /** Cuerpo del aviso. Sin saltos de linea: WhatsApp los rechaza en variables. */
  contenido: string
}
