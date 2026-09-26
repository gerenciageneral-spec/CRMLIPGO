"use server"

// Datos del tablero comercial.
//
// UNA SOLA función que paraleliza todo con Promise.all, en vez de que cada
// tarjeta consulte por su cuenta. Con diez consultas sueltas el tablero carga
// por partes y parpadea; con una, aparece entero.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { hoyISO, sumarDias, rangoDelMes } from "@/lib/crm-fechas"
import { exigirPermiso, mensajeError } from "@/lib/crm-auth"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface DashboardComercial {
  ventas: {
    mes: number
    mesAnterior: number
    variacion: number
    pedidos: number
    ticketPromedio: number
  }
  embudo: {
    valorTotal: number
    valorPonderado: number
    prospectos: number
    porEtapa: { nombre: string; color: string | null; cantidad: number; valor: number }[]
  }
  cotizaciones: {
    abiertas: number
    valorAbierto: number
    porVencer: number
    tasaConversion: number
  }
  cartera: {
    pendiente: number
    vencida: number
    porcentajeVencido: number
    clientesEnMora: number
  }
  agenda: {
    hoy: number
    atrasadas: number
    semana: number
  }
  pendientes: {
    pedidosSinAutorizar: number
    prospectosSinGestion: number
  }
  topVendedores: { nombre: string; ventas: number; meta: number; cumplimiento: number }[]
  ventasPorDia: { fecha: string; valor: number }[]
}

export async function getDashboardComercial(
  empresaId = 1,
): Promise<ActionResult<DashboardComercial>> {
  try {
    const ctx = await exigirPermiso("getDashboardComercial", "crm_dashboard")
    // TODO fase 4: filtrar por vendedor cuando ctx.alcance === "propios"
    const supabase = await getSupabaseAdmin()
    const hoy = hoyISO()
    const mes = rangoDelMes(hoy)
    const mesAnterior = rangoDelMes(sumarDias(mes.desde, -1))
    const hace30 = sumarDias(hoy, -30)
    const enUnaSemana = sumarDias(hoy, 7)

    const [
      pedidosMes, pedidosMesAnterior, etapasRes, prospectosRes,
      cotizacionesRes, carteraRes, agendaRes, pendientesRes, vendedoresRes,
    ] = await Promise.all([
      supabase.from("crm_pedidos")
        .select("total, fecha, vendedor_id")
        .eq("idempresa", empresaId)
        .gte("fecha", mes.desde).lte("fecha", mes.hasta)
        .not("estado", "in", "(rechazado,anulado,borrador)"),

      supabase.from("crm_pedidos")
        .select("total")
        .eq("idempresa", empresaId)
        .gte("fecha", mesAnterior.desde).lte("fecha", mesAnterior.hasta)
        .not("estado", "in", "(rechazado,anulado,borrador)"),

      supabase.from("crm_etapas")
        .select("id, nombre, color, probabilidad, es_ganada, es_perdida")
        .eq("idempresa", empresaId).eq("activo", true).order("orden"),

      supabase.from("crm_prospectos")
        .select("etapa_id, valor_estimado, probabilidad_manual, actualizado_en")
        .eq("idempresa", empresaId).eq("activo", true),

      supabase.from("crm_cotizaciones")
        .select("estado, total, fecha_vencimiento")
        .eq("idempresa", empresaId)
        .gte("fecha_emision", sumarDias(hoy, -90)),

      supabase.from("crm_cuentas_cobrar")
        .select("saldo, fecha_vencimiento, cliente_id")
        .eq("idempresa", empresaId).in("estado", ["pendiente", "parcial"]),

      supabase.from("crm_agenda")
        .select("fecha")
        .eq("idempresa", empresaId).eq("estado", "pendiente")
        .lte("fecha", enUnaSemana),

      supabase.from("crm_pedidos")
        .select("id")
        .eq("idempresa", empresaId)
        .in("estado", ["pendiente_autorizacion", "autorizado_parcial"]),

      supabase.from("crm_vendedores_detalle")
        .select("vendedor_id, meta_mensual")
        .eq("idempresa", empresaId).eq("activo", true),
    ])

    // ------------------------------------------------------------- Ventas
    const ventasMes = (pedidosMes.data ?? []).reduce((s: number, p: any) => s + (Number(p.total) || 0), 0)
    const ventasAnterior = (pedidosMesAnterior.data ?? []).reduce((s: number, p: any) => s + (Number(p.total) || 0), 0)
    const nPedidos = pedidosMes.data?.length ?? 0

    // ------------------------------------------------------------- Embudo
    const etapas = etapasRes.data ?? []
    const prospectos = prospectosRes.data ?? []
    const abiertas = etapas.filter((e: any) => !e.es_ganada && !e.es_perdida)

    let valorEmbudo = 0
    let valorPonderado = 0
    const porEtapa = abiertas.map((e: any) => {
      const suyos = prospectos.filter((p: any) => p.etapa_id === e.id)
      const valor = suyos.reduce((s: number, p: any) => s + (Number(p.valor_estimado) || 0), 0)
      const ponderado = suyos.reduce((s: number, p: any) => {
        const prob = p.probabilidad_manual ?? e.probabilidad
        return s + (Number(p.valor_estimado) || 0) * (Number(prob) / 100)
      }, 0)

      valorEmbudo += valor
      valorPonderado += ponderado

      return { nombre: e.nombre, color: e.color, cantidad: suyos.length, valor: Math.round(valor) }
    })

    // -------------------------------------------------------- Cotizaciones
    const cotizaciones = cotizacionesRes.data ?? []
    const cotAbiertas = cotizaciones.filter((c: any) => ["borrador", "enviada"].includes(c.estado))
    const cerradas = cotizaciones.filter((c: any) =>
      ["aceptada", "convertida", "rechazada", "vencida"].includes(c.estado),
    )
    const ganadas = cotizaciones.filter((c: any) => ["aceptada", "convertida"].includes(c.estado))

    // ------------------------------------------------------------ Cartera
    const cartera = carteraRes.data ?? []
    let pendiente = 0
    let vencida = 0
    const clientesMora = new Set<number>()

    for (const c of cartera) {
      const saldo = Number(c.saldo) || 0
      pendiente += saldo
      if (c.fecha_vencimiento < hoy) {
        vencida += saldo
        clientesMora.add(c.cliente_id)
      }
    }

    // ------------------------------------------------------------- Agenda
    const agenda = agendaRes.data ?? []

    // -------------------------------------------------------- Vendedores
    const metas = new Map(
      (vendedoresRes.data ?? []).map((v: any) => [v.vendedor_id, Number(v.meta_mensual) || 0]),
    )
    const ventasPorVendedor = new Map<number, number>()
    for (const p of pedidosMes.data ?? []) {
      if (!p.vendedor_id) continue
      ventasPorVendedor.set(p.vendedor_id, (ventasPorVendedor.get(p.vendedor_id) ?? 0) + (Number(p.total) || 0))
    }

    let topVendedores: DashboardComercial["topVendedores"] = []
    if (ventasPorVendedor.size) {
      const { data: nombres } = await supabase
        .from("vendedores")
        .select("idvendedor, nombre")
        .in("idvendedor", [...ventasPorVendedor.keys()])

      const nombre = new Map((nombres ?? []).map((v: any) => [v.idvendedor, v.nombre]))

      topVendedores = [...ventasPorVendedor.entries()]
        .map(([id, ventas]) => {
          const meta = metas.get(id) ?? 0
          return {
            nombre: nombre.get(id) ?? "—",
            ventas: Math.round(ventas),
            meta,
            cumplimiento: meta > 0 ? Math.round((ventas / meta) * 1000) / 10 : 0,
          }
        })
        .sort((a, b) => b.ventas - a.ventas)
        .slice(0, 5)
    }

    // ------------------------------------------------------ Ventas por día
    // Se rellenan los días sin ventas con cero: una línea que salta de día 3 a
    // día 9 sugiere continuidad donde hubo un hueco.
    const porFecha = new Map<string, number>()
    for (const p of pedidosMes.data ?? []) {
      porFecha.set(p.fecha, (porFecha.get(p.fecha) ?? 0) + (Number(p.total) || 0))
    }

    const ventasPorDia: { fecha: string; valor: number }[] = []
    let cursor = mes.desde
    while (cursor <= mes.hasta && cursor <= hoy) {
      ventasPorDia.push({ fecha: cursor, valor: Math.round(porFecha.get(cursor) ?? 0) })
      cursor = sumarDias(cursor, 1)
    }

    // -------------------------------------------- Prospectos sin gestión
    const sinGestion = prospectos.filter(
      (p: any) => (p.actualizado_en ?? "").slice(0, 10) < hace30,
    ).length

    return {
      success: true,
      data: {
        ventas: {
          mes: Math.round(ventasMes),
          mesAnterior: Math.round(ventasAnterior),
          variacion: ventasAnterior > 0
            ? Math.round(((ventasMes - ventasAnterior) / ventasAnterior) * 1000) / 10
            : 0,
          pedidos: nPedidos,
          ticketPromedio: nPedidos > 0 ? Math.round(ventasMes / nPedidos) : 0,
        },
        embudo: {
          valorTotal: Math.round(valorEmbudo),
          valorPonderado: Math.round(valorPonderado),
          prospectos: prospectos.length,
          porEtapa,
        },
        cotizaciones: {
          abiertas: cotAbiertas.length,
          valorAbierto: Math.round(
            cotAbiertas.reduce((s: number, c: any) => s + (Number(c.total) || 0), 0),
          ),
          porVencer: cotAbiertas.filter(
            (c: any) => c.fecha_vencimiento >= hoy && c.fecha_vencimiento <= sumarDias(hoy, 3),
          ).length,
          tasaConversion: cerradas.length > 0
            ? Math.round((ganadas.length / cerradas.length) * 1000) / 10
            : 0,
        },
        cartera: {
          pendiente: Math.round(pendiente),
          vencida: Math.round(vencida),
          porcentajeVencido: pendiente > 0 ? Math.round((vencida / pendiente) * 1000) / 10 : 0,
          clientesEnMora: clientesMora.size,
        },
        agenda: {
          hoy: agenda.filter((c: any) => c.fecha === hoy).length,
          atrasadas: agenda.filter((c: any) => c.fecha < hoy).length,
          semana: agenda.length,
        },
        pendientes: {
          pedidosSinAutorizar: pendientesRes.data?.length ?? 0,
          prospectosSinGestion: sinGestion,
        },
        topVendedores,
        ventasPorDia,
      },
    }
  } catch (err) {
    const msg = mensajeError(err)
    console.error("[crm-dashboard]", msg)
    return { success: false, error: msg }
  }
}
