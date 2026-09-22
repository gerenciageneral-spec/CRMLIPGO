"use server"

// Cotizaciones: emision, vigencia y conversion en pedido.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getParamNumber, getParamBool } from "@/lib/crm-parametros-actions"
import { PARAM } from "@/lib/crm-parametros"
import { hoyISO, sumarDias } from "@/lib/crm-fechas"
import { calcularTotales, calcularLinea } from "@/lib/crm-cotizaciones"
import type {
  Cotizacion, CotizacionConDetalle, LineaCotizacion, NuevaCotizacion, EstadoCotizacion,
} from "@/lib/crm-cotizaciones"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

function fallo(err: unknown): ActionResult<never> {
  const msg = err instanceof Error ? err.message : "Error desconocido"
  console.error("[crm-cotizaciones]", msg)
  return { success: false, error: msg }
}

// ------------------------------------------------------------- Consultas

export async function getCotizaciones(
  empresaId = 1,
  filtros?: { estado?: EstadoCotizacion; clienteId?: number; vendedorId?: number },
): Promise<ActionResult<CotizacionConDetalle[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    let q = supabase.from("crm_cotizaciones").select("*").eq("idempresa", empresaId)

    if (filtros?.estado) q = q.eq("estado", filtros.estado)
    if (filtros?.clienteId) q = q.eq("cliente_id", filtros.clienteId)
    if (filtros?.vendedorId) q = q.eq("vendedor_id", filtros.vendedorId)

    const { data, error } = await q.order("creado_en", { ascending: false }).limit(300)
    if (error) return { success: false, error: error.message }

    const cotizaciones = (data ?? []) as Cotizacion[]
    if (!cotizaciones.length) return { success: true, data: [] }

    // Los nombres se resuelven en UNA consulta por tabla, no una por fila.
    const idsCliente = [...new Set(cotizaciones.map((c) => c.cliente_id).filter(Boolean))] as number[]
    const idsProspecto = [...new Set(cotizaciones.map((c) => c.prospecto_id).filter(Boolean))] as number[]

    const [clientesRes, prospectosRes] = await Promise.all([
      idsCliente.length
        ? supabase.from("clientes").select("id, nombre").in("id", idsCliente)
        : Promise.resolve({ data: [] as any[] }),
      idsProspecto.length
        ? supabase.from("crm_prospectos").select("id, razon_social").in("id", idsProspecto)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const nombreCliente = new Map((clientesRes.data ?? []).map((c: any) => [c.id, c.nombre]))
    const nombreProspecto = new Map((prospectosRes.data ?? []).map((p: any) => [p.id, p.razon_social]))

    return {
      success: true,
      data: cotizaciones.map((c) => ({
        ...c,
        cliente_nombre: c.cliente_id ? nombreCliente.get(c.cliente_id) ?? null : null,
        prospecto_nombre: c.prospecto_id ? nombreProspecto.get(c.prospecto_id) ?? null : null,
      })),
    }
  } catch (err) {
    return fallo(err)
  }
}

export async function getCotizacion(id: number, empresaId = 1): Promise<ActionResult<CotizacionConDetalle>> {
  try {
    const supabase = await getSupabaseAdmin()

    const [cabRes, detRes] = await Promise.all([
      supabase.from("crm_cotizaciones").select("*").eq("id", id).eq("idempresa", empresaId).maybeSingle(),
      supabase.from("crm_cotizacion_detalle").select("*").eq("cotizacion_id", id).order("linea"),
    ])

    if (cabRes.error) return { success: false, error: cabRes.error.message }
    if (!cabRes.data) return { success: false, error: "La cotización no existe" }

    return {
      success: true,
      data: { ...(cabRes.data as Cotizacion), lineas: (detRes.data ?? []) as LineaCotizacion[] },
    }
  } catch (err) {
    return fallo(err)
  }
}

// --------------------------------------------------------------- Emision

export async function crearCotizacion(
  entrada: NuevaCotizacion,
  usuario: string,
  empresaId = 1,
): Promise<ActionResult<Cotizacion>> {
  try {
    if (!entrada.cliente_id && !entrada.prospecto_id) {
      return { success: false, error: "La cotización debe ir dirigida a un cliente o a un prospecto" }
    }

    const lineas = (entrada.lineas ?? []).filter((l) => l.producto_nombre?.trim() && Number(l.cantidad) > 0)
    if (!lineas.length) {
      return { success: false, error: "Agrega al menos una línea con producto y cantidad" }
    }
    // Validacion que el formulario de LIPgo no hacia y dejaba pasar lineas en
    // cero hasta la base.
    const sinPrecio = lineas.find((l) => Number(l.precio_unitario) <= 0)
    if (sinPrecio) {
      return { success: false, error: `"${sinPrecio.producto_nombre}" no tiene precio` }
    }

    const supabase = await getSupabaseAdmin()

    // Los parametros se leen de una vez, no uno por uno.
    const [ivaPct, vigenciaDias, topeDescuento] = await Promise.all([
      getParamNumber(PARAM.IVA, empresaId),
      getParamNumber(PARAM.COTIZACION_VIGENCIA, empresaId),
      getParamNumber(PARAM.DESCUENTO_MAXIMO_VENDEDOR, empresaId),
    ])

    // Si alguna linea baja del tope, la cotizacion queda marcada. No se
    // bloquea: el vendedor puede necesitarlo, pero alguien debe enterarse.
    const requiereAutorizacion = lineas.some((l) => Number(l.descuento_pct) > topeDescuento)

    const totales = calcularTotales(lineas as any, ivaPct)
    const emision = hoyISO()

    const { data: cabecera, error: errCab } = await supabase
      .from("crm_cotizaciones")
      .insert({
        idempresa: empresaId,
        prospecto_id: entrada.prospecto_id ?? null,
        cliente_id: entrada.cliente_id ?? null,
        bodega_id: entrada.bodega_id ?? null,
        vendedor_id: entrada.vendedor_id ?? null,
        tipo_venta: entrada.tipo_venta ?? "cotizacion",
        forma_pago: entrada.forma_pago ?? "contado",
        dias_credito: entrada.dias_credito ?? 0,
        condicion_pago_id: entrada.condicion_pago_id ?? null,
        fecha_emision: emision,
        // Vigencia e IVA se CONGELAN aqui: el cliente acepta unos terminos
        // concretos y cambiarlos despues seria cambiarle la oferta.
        vigencia_dias: vigenciaDias,
        fecha_vencimiento: sumarDias(emision, vigenciaDias),
        iva_pct: ivaPct,
        subtotal: totales.subtotal,
        descuento_valor: totales.descuento,
        iva_valor: totales.iva,
        total: totales.total,
        peso_total: totales.peso,
        lista_precio_id: entrada.lista_precio_id ?? null,
        requiere_autorizacion_descuento: requiereAutorizacion,
        observaciones: entrada.observaciones ?? null,
        creado_por: usuario,
      })
      .select()
      .single()

    if (errCab) return { success: false, error: errCab.message }

    const filas = lineas.map((l, i) => {
      const calc = calcularLinea(l.cantidad, l.precio_unitario, l.descuento_pct)
      return {
        idempresa: empresaId,
        cotizacion_id: cabecera.id,
        linea: i + 1,
        producto_id: l.producto_id ?? null,
        producto_nombre: l.producto_nombre.trim(),
        categoria: l.categoria ?? null,
        unidad: l.unidad ?? null,
        cantidad: l.cantidad,
        precio_lista: l.precio_lista ?? null,
        precio_unitario: l.precio_unitario,
        descuento_pct: l.descuento_pct ?? 0,
        ...calc,
        peso: l.peso ?? 0,
      }
    })

    const { error: errDet } = await supabase.from("crm_cotizacion_detalle").insert(filas)

    if (errDet) {
      // Sin lineas la cotizacion no sirve de nada: se borra la cabecera para
      // no dejar un documento vacio que alguien intente enviar.
      await supabase.from("crm_cotizaciones").delete().eq("id", cabecera.id)
      return { success: false, error: `No se guardaron las líneas: ${errDet.message}` }
    }

    return { success: true, data: cabecera as Cotizacion }
  } catch (err) {
    return fallo(err)
  }
}

export async function cambiarEstadoCotizacion(
  id: number,
  estado: EstadoCotizacion,
  empresaId = 1,
  motivo?: string,
): Promise<ActionResult<Cotizacion>> {
  try {
    const supabase = await getSupabaseAdmin()

    const cambios: Record<string, unknown> = { estado }
    if (estado === "rechazada" && motivo) cambios.motivo_rechazo = motivo

    const { data, error } = await supabase
      .from("crm_cotizaciones")
      .update(cambios)
      .eq("id", id)
      .eq("idempresa", empresaId)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as Cotizacion }
  } catch (err) {
    return fallo(err)
  }
}

// ------------------------------------------------------ Conversion a pedido

/**
 * Convierte una cotizacion aceptada en pedido.
 *
 * COPIA LOS PRECIOS, no los vuelve a resolver. El cliente acepto unos numeros
 * concretos; si se recalcularan contra la lista vigente, un cambio de precios
 * entre la aceptacion y la conversion le cambiaria el trato por la espalda.
 */
export async function convertirEnPedido(
  cotizacionId: number,
  usuario: string,
  empresaId = 1,
): Promise<ActionResult<{ pedidoId: number; numero: string }>> {
  try {
    const supabase = await getSupabaseAdmin()

    const cotRes = await getCotizacion(cotizacionId, empresaId)
    if (!cotRes.success || !cotRes.data) {
      return { success: false, error: cotRes.error ?? "La cotización no existe" }
    }
    const cot = cotRes.data

    if (cot.crm_pedido_id) {
      return { success: false, error: `Esta cotización ya generó el pedido ${cot.crm_pedido_id}` }
    }
    if (cot.estado === "rechazada") {
      return { success: false, error: "La cotización está rechazada" }
    }
    if (!cot.cliente_id) {
      return {
        success: false,
        error: "La cotización es de un prospecto. Conviértelo en cliente antes de generar el pedido.",
      }
    }

    // La vigencia se comprueba al convertir, no al consultar: una cotizacion
    // vencida ya no obliga a nadie a ese precio.
    if (cot.fecha_vencimiento < hoyISO()) {
      await supabase.from("crm_cotizaciones").update({ estado: "vencida" }).eq("id", cotizacionId)
      return {
        success: false,
        error: `La cotización venció el ${cot.fecha_vencimiento}. Genera una nueva versión con precios actuales.`,
      }
    }

    // Cupo de credito, si el parametro lo exige.
    if (cot.forma_pago === "credito") {
      const validar = await getParamBool(PARAM.CREDITO_VALIDAR_CUPO, empresaId)
      if (validar) {
        const chequeo = await verificarCupo(cot.cliente_id, cot.total, empresaId)
        if (!chequeo.ok) return { success: false, error: chequeo.motivo }
      }
    }

    const { data: pedido, error: errPed } = await supabase
      .from("crm_pedidos")
      .insert({
        idempresa: empresaId,
        cotizacion_id: cot.id,
        cliente_id: cot.cliente_id,
        bodega_id: cot.bodega_id,
        vendedor_id: cot.vendedor_id,
        fecha: hoyISO(),
        forma_pago: cot.forma_pago,
        dias_credito: cot.dias_credito,
        condicion_pago_id: cot.condicion_pago_id,
        // Totales copiados tal cual de la cotizacion aceptada.
        subtotal: cot.subtotal,
        descuento_valor: cot.descuento_valor,
        iva_pct: cot.iva_pct,
        iva_valor: cot.iva_valor,
        total: cot.total,
        peso_total: cot.peso_total,
        estado: "pendiente_autorizacion",
        observaciones: cot.observaciones,
        creado_por: usuario,
      })
      .select()
      .single()

    if (errPed) return { success: false, error: errPed.message }

    const lineas = (cot.lineas ?? []).map((l) => ({
      idempresa: empresaId,
      pedido_id: pedido.id,
      linea: l.linea,
      producto_id: l.producto_id,
      producto_nombre: l.producto_nombre,
      categoria: l.categoria,
      unidad: l.unidad,
      cantidad: l.cantidad,
      precio_lista: l.precio_lista,
      precio_unitario: l.precio_unitario,
      descuento_pct: l.descuento_pct,
      descuento_valor: l.descuento_valor,
      subtotal: l.subtotal,
      total_linea: l.total_linea,
      peso: l.peso,
    }))

    const { error: errDet } = await supabase.from("crm_pedido_detalle").insert(lineas)
    if (errDet) {
      await supabase.from("crm_pedidos").delete().eq("id", pedido.id)
      return { success: false, error: `No se copiaron las líneas: ${errDet.message}` }
    }

    await supabase
      .from("crm_cotizaciones")
      .update({ estado: "convertida", crm_pedido_id: pedido.id })
      .eq("id", cotizacionId)

    return { success: true, data: { pedidoId: pedido.id, numero: pedido.numero } }
  } catch (err) {
    return fallo(err)
  }
}

/**
 * Cupo disponible del cliente.
 *
 * Suma la cartera pendiente y compara con el cupo. Tambien mira la mora, si el
 * parametro de bloqueo esta activo.
 */
export async function verificarCupo(
  clienteId: number,
  montoNuevo: number,
  empresaId = 1,
): Promise<{ ok: boolean; motivo?: string; cupo?: number; usado?: number; disponible?: number }> {
  try {
    const supabase = await getSupabaseAdmin()

    const { data: cliente } = await supabase
      .from("clientes")
      .select("nombre, cupo_credito, bloqueado_cartera")
      .eq("id", clienteId)
      .maybeSingle()

    if (!cliente) return { ok: false, motivo: "El cliente no existe" }

    if (cliente.bloqueado_cartera) {
      return { ok: false, motivo: `${cliente.nombre} está bloqueado para ventas a crédito` }
    }

    const cupo = Number(cliente.cupo_credito) || 0
    if (cupo <= 0) {
      return { ok: false, motivo: `${cliente.nombre} no tiene cupo de crédito asignado` }
    }

    const { data: cartera } = await supabase
      .from("crm_cuentas_cobrar")
      .select("saldo, fecha_vencimiento")
      .eq("idempresa", empresaId)
      .eq("cliente_id", clienteId)
      .in("estado", ["pendiente", "parcial"])

    const usado = (cartera ?? []).reduce((s: number, c: any) => s + (Number(c.saldo) || 0), 0)
    const disponible = cupo - usado

    if (montoNuevo > disponible) {
      return {
        ok: false,
        motivo: `Excede el cupo. Disponible: ${disponible.toLocaleString("es-CO")} · Pedido: ${montoNuevo.toLocaleString("es-CO")}`,
        cupo, usado, disponible,
      }
    }

    // Mora: se evalua aparte del cupo porque son dos riesgos distintos. Un
    // cliente puede tener cupo de sobra y estar en mora de 60 dias.
    const bloquearPorMora = await getParamBool(PARAM.CARTERA_BLOQUEAR_MORA, empresaId)
    if (bloquearPorMora) {
      const diasMora = await getParamNumber(PARAM.CARTERA_DIAS_MORA_BLOQUEO, empresaId)
      const limite = sumarDias(hoyISO(), -diasMora)
      const enMora = (cartera ?? []).filter((c: any) => c.fecha_vencimiento < limite)

      if (enMora.length) {
        const total = enMora.reduce((s: number, c: any) => s + (Number(c.saldo) || 0), 0)
        return {
          ok: false,
          motivo: `${cliente.nombre} tiene ${enMora.length} factura(s) con más de ${diasMora} días de mora (${total.toLocaleString("es-CO")})`,
          cupo, usado, disponible,
        }
      }
    }

    return { ok: true, cupo, usado, disponible }
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : "Error al verificar el cupo" }
  }
}

/**
 * Marca como vencidas las cotizaciones que pasaron de fecha.
 *
 * La llama el cron diario, y tambien la pantalla al abrirse: asi el estado es
 * correcto aunque el cron no haya corrido.
 */
export async function vencerCotizaciones(empresaId = 1): Promise<ActionResult<number>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_cotizaciones")
      .update({ estado: "vencida" })
      .eq("idempresa", empresaId)
      .in("estado", ["borrador", "enviada"])
      .lt("fecha_vencimiento", hoyISO())
      .select("id")

    if (error) return { success: false, error: error.message }
    return { success: true, data: data?.length ?? 0 }
  } catch (err) {
    return fallo(err)
  }
}
