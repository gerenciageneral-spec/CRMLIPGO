/**
 * Interfaces TypeScript para Dashboard Pedidos.
 *
 * Mapean 1:1 las columnas reales de las tablas Supabase:
 *   - pedidoscabecera  (cabecera del pedido)
 *   - pedidosdetalle   (lineas/items del pedido)
 *
 * Todas las propiedades son opcionales (`?`) excepto los identificadores
 * porque los campos en BD pueden venir nulls / vacios. Las funciones de
 * calculo en `calculations.ts` deben tolerar valores faltantes.
 */

export interface PedidoCabecera {
  id_empresa: number
  fecha?: string | null
  vendedor?: string | null
  cliente?: string | null
  destino?: string | null
  empresa?: string | null
  orden_de_compra?: string | null
  pedido?: string | null
  total_linea?: number | null
  aprobado?: string | null
  medio?: string | null
  fecha_programada?: string | null
  hora_recibido_cartera?: string | null
  hora_entrega_cartera?: string | null
  obs_cartera?: string | null
  soporte_recibido_cliente?: string | null
  fechaordencargue?: string | null
  transporte?: string | null
  vehiculo?: string | null
  ocargue?: string | null
  factura?: string | null
  estado?: string | null
  flete?: number | null
  demora?: number | null
  comentarios?: string | null
  direccion?: string | null
  idpedido: number
  condicion_pago?: string | null
  total_pagar?: number | null
  descuentopp?: number | null
  descuentoiva?: number | null
  tipo_despacho?: string | null
  pdfpedido?: string | null
  fechadeentrega?: string | null
  observaciones?: string | null
  empresafactura?: string | null
  revisioncartera?: string | null
  revisiongerencia?: string | null
}

export interface PedidoDetalle {
  id_empresa: number
  producto?: string | null
  unidades?: number | null
  precio_und?: number | null
  total_linea?: number | null
  iva?: number | null
  descuentopp?: number | null
  subtotal?: number | null
  und_eq?: number | null
  // Nota: el campo en BD se llama tal cual `$_x_und_equivalente`, pero
  // lo expongo aqui con un alias seguro para TS / acceso por punto.
  ["$_x_und_equivalente"]?: number | null
  peso?: number | null
  categoria?: string | null
  ocargue?: string | null
  unidades_cargadas?: number | null
  in_Full?: number | null
  peso_bascula?: number | null
  idpedido: number
  transid: number
  unidadescargadas?: number | null
  estado?: string | null
  unidadespendientes?: number | null
}

/**
 * Bundle que el server action devuelve y que las tabs consumen como
 * props. Mantenerlo en un solo objeto facilita pasar todo al cliente
 * con una sola llamada y evita queries duplicadas.
 */
export interface DashboardPedidosData {
  cabecera: PedidoCabecera[]
  detalle: PedidoDetalle[]
}
