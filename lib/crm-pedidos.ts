// Tipos del pedido y su doble autorizacion.
//
// SIN "use server": las funciones viven en crm-pedidos-actions.ts.

export type EstadoPedido =
  | "borrador"
  | "pendiente_autorizacion"
  | "autorizado_parcial"
  | "autorizado"
  | "rechazado"
  | "enviado_lipgo"
  | "anulado"

export type RolAutorizacion = "contabilidad" | "gerencia"

export const ESTADO_PEDIDO_LABEL: Record<EstadoPedido, string> = {
  borrador: "Borrador",
  pendiente_autorizacion: "Pendiente de autorización",
  autorizado_parcial: "Falta una firma",
  autorizado: "Autorizado",
  rechazado: "Rechazado",
  enviado_lipgo: "Enviado a operación",
  anulado: "Anulado",
}

export const ROL_LABEL: Record<RolAutorizacion, string> = {
  contabilidad: "Contabilidad",
  gerencia: "Gerencia",
}

/** Permiso que habilita cada firma. */
export const PERMISO_POR_ROL: Record<RolAutorizacion, "crm_autorizar_contabilidad" | "crm_autorizar_gerencia"> = {
  contabilidad: "crm_autorizar_contabilidad",
  gerencia: "crm_autorizar_gerencia",
}

export interface Pedido {
  id: number
  idempresa: number
  numero: string | null

  cotizacion_id: number | null
  cliente_id: number
  bodega_id: number | null
  vendedor_id: number | null

  fecha: string
  fecha_programada: string | null

  forma_pago: "contado" | "credito"
  dias_credito: number
  condicion_pago_id: number | null
  tipo_despacho_id: number | null
  orden_compra: string | null
  destino: string | null
  direccion: string | null

  subtotal: number
  descuento_valor: number
  iva_pct: number
  iva_valor: number
  total: number
  peso_total: number

  estado: EstadoPedido

  // Las dos firmas. Se guarda QUIEN firmo aunque la clave sea compartida:
  // con la clave sola no habria forma de saber quien autorizo un pedido que
  // no debia pasar.
  auth_contabilidad_por: string | null
  auth_contabilidad_nombre: string | null
  auth_contabilidad_en: string | null
  auth_contabilidad_nota: string | null

  auth_gerencia_por: string | null
  auth_gerencia_nombre: string | null
  auth_gerencia_en: string | null
  auth_gerencia_nota: string | null

  rechazado_por: string | null
  rechazado_nombre: string | null
  rechazado_en: string | null
  motivo_rechazo: string | null

  // Puente a LIPgo
  idpedido_lipgo: number | null
  enviado_lipgo_en: string | null
  enviado_lipgo_por: string | null
  error_lipgo: string | null

  pdf_url: string | null
  observaciones: string | null
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export interface LineaPedido {
  id?: number
  pedido_id?: number
  linea: number
  producto_id: number | null
  producto_nombre: string
  categoria: string | null
  unidad: string | null
  cantidad: number
  precio_lista: number | null
  precio_unitario: number
  descuento_pct: number
  descuento_valor: number
  subtotal: number
  total_linea: number
  peso: number
}

export interface PedidoConDetalle extends Pedido {
  cliente_nombre?: string | null
  vendedor_nombre?: string | null
  cotizacion_numero?: string | null
  lineas?: LineaPedido[]
}

export interface EventoAutorizacion {
  id: number
  pedido_id: number
  rol: RolAutorizacion
  accion: "autorizar" | "rechazar" | "revertir" | "intento_fallido"
  usuario_id: string | null
  usuario_nombre: string | null
  nota: string | null
  total_al_momento: number | null
  creado_en: string
}

/** Qué firmas faltan. */
export function firmasPendientes(p: Pedido): RolAutorizacion[] {
  const faltan: RolAutorizacion[] = []
  if (!p.auth_contabilidad_en) faltan.push("contabilidad")
  if (!p.auth_gerencia_en) faltan.push("gerencia")
  return faltan
}

/**
 * Si un usuario puede dar una firma concreta.
 *
 * SEPARACION DE FUNCIONES: quien ya firmó como contabilidad no puede firmar
 * como gerencia, y quien creó el pedido no puede autorizarlo. Sin esto, "dos
 * autorizaciones" son dos clics de la misma mano y el control no existe.
 */
export function puedeFirmar(
  p: Pedido,
  rol: RolAutorizacion,
  usuarioId: string,
  usuarioNombre: string,
): { puede: boolean; motivo?: string } {
  if (p.estado === "rechazado") return { puede: false, motivo: "El pedido está rechazado" }
  if (p.estado === "anulado") return { puede: false, motivo: "El pedido está anulado" }
  if (p.idpedido_lipgo) return { puede: false, motivo: "El pedido ya viajó a operación" }

  const yaFirmada = rol === "contabilidad" ? p.auth_contabilidad_en : p.auth_gerencia_en
  if (yaFirmada) return { puede: false, motivo: `${ROL_LABEL[rol]} ya autorizó este pedido` }

  const otra = rol === "contabilidad" ? p.auth_gerencia_por : p.auth_contabilidad_por
  if (otra && otra === usuarioId) {
    return {
      puede: false,
      motivo: "Ya diste la otra firma. Las dos autorizaciones deben ser de personas distintas.",
    }
  }

  if (p.creado_por && p.creado_por === usuarioNombre) {
    return { puede: false, motivo: "No puedes autorizar un pedido que tú mismo creaste" }
  }

  return { puede: true }
}

export const money = (n: number) =>
  (Number(n) || 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  })
