"use server"

// Detección de oportunidades comerciales.
//
// LAS SEÑALES SE CALCULAN EN SQL, no las inventa un modelo. Un LLM al que se
// le pide "encuentra oportunidades" produce afirmaciones verosímiles sin
// respaldo: nombra clientes que suenan importantes y cifras redondas. Aquí
// cada oportunidad sale de una consulta con su número verificable; el modelo,
// si interviene, solo prioriza y redacta.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getParamNumber } from "@/lib/crm-parametros-actions"
import { PARAM } from "@/lib/crm-parametros"
import { hoyISO, sumarDias, diasEntre } from "@/lib/crm-fechas"
import type { Oportunidad, TipoOportunidad } from "@/lib/crm-oportunidades"
export type { Oportunidad, TipoOportunidad } from "@/lib/crm-oportunidades"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

function fallo(err: unknown): ActionResult<never> {
  const msg = err instanceof Error ? err.message : "Error desconocido"
  console.error("[crm-oportunidades]", msg)
  return { success: false, error: msg }
}

export async function getOportunidades(empresaId = 1): Promise<ActionResult<Oportunidad[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    const hoy = hoyISO()
    const hace90 = sumarDias(hoy, -90)
    const hace180 = sumarDias(hoy, -180)

    const diasFrio = await getParamNumber(PARAM.PROSPECTO_DIAS_FRIO, empresaId)

    const [pedidosRes, clientesRes, prospectosRes, cotizacionesRes, detalleRes] = await Promise.all([
      supabase
        .from("crm_pedidos")
        .select("cliente_id, fecha, total")
        .eq("idempresa", empresaId)
        .gte("fecha", hace180)
        .not("estado", "in", "(rechazado,anulado,borrador)"),

      supabase
        .from("clientes")
        .select("id, nombre, cupo_credito, segmento, bloqueado_cartera")
        .eq("id_empresa", empresaId),

      supabase
        .from("crm_prospectos")
        .select("id, razon_social, valor_estimado, actualizado_en, etapa_id, crm_etapas(nombre, es_ganada, es_perdida)")
        .eq("idempresa", empresaId)
        .eq("activo", true),

      supabase
        .from("crm_cotizaciones")
        .select("id, numero, cliente_id, total, fecha_emision, estado")
        .eq("idempresa", empresaId)
        .eq("estado", "enviada")
        .gte("fecha_emision", hace90),

      supabase
        .from("crm_pedido_detalle")
        .select("pedido_id, producto_nombre, categoria")
        .eq("idempresa", empresaId)
        .limit(5000),
    ])

    const pedidos = pedidosRes.data ?? []
    const clientes = clientesRes.data ?? []
    const nombreCliente = new Map(clientes.map((c: any) => [c.id, c.nombre]))

    const oportunidades: Oportunidad[] = []

    // ---------------------------------------------------- Clientes dormidos
    // Compraban con regularidad y dejaron de hacerlo. Es la señal más fuerte:
    // un cliente que se fue no avisa, simplemente deja de aparecer.
    const porCliente = new Map<number, { fechas: string[]; total: number }>()
    for (const p of pedidos) {
      if (!p.cliente_id) continue
      const g = porCliente.get(p.cliente_id) ?? { fechas: [], total: 0 }
      g.fechas.push(p.fecha)
      g.total += Number(p.total) || 0
      porCliente.set(p.cliente_id, g)
    }

    for (const [clienteId, datos] of porCliente) {
      const ultima = datos.fechas.sort().at(-1)!
      const dias = diasEntre(ultima, hoy)

      // Al menos tres compras: con una o dos no hay patrón que se haya roto.
      if (dias >= 60 && datos.fechas.length >= 3) {
        const promedioMensual = datos.total / 6
        oportunidades.push({
          tipo: "cliente_dormido",
          titulo: nombreCliente.get(clienteId) ?? "Cliente",
          detalle: `Compraba ${datos.fechas.length} veces en seis meses y lleva ${dias} días sin pedir. Su última compra fue el ${ultima}.`,
          relevancia: dias >= 120 ? 5 : 4,
          valorPotencial: Math.round(promedioMensual),
          clienteId,
          accionSugerida: "Llamar para entender por qué dejó de comprar",
        })
      }
    }

    // ------------------------------------------------------- Bajó volumen
    // Compara los últimos 90 días contra los 90 anteriores.
    for (const [clienteId, datos] of porCliente) {
      const recientes = pedidos.filter((p: any) => p.cliente_id === clienteId && p.fecha >= hace90)
      const previos = pedidos.filter(
        (p: any) => p.cliente_id === clienteId && p.fecha < hace90 && p.fecha >= hace180,
      )

      if (!recientes.length || previos.length < 2) continue

      const totalReciente = recientes.reduce((s: number, p: any) => s + (Number(p.total) || 0), 0)
      const totalPrevio = previos.reduce((s: number, p: any) => s + (Number(p.total) || 0), 0)

      if (totalPrevio > 0 && totalReciente < totalPrevio * 0.6) {
        const caida = Math.round(((totalPrevio - totalReciente) / totalPrevio) * 100)
        oportunidades.push({
          tipo: "bajo_volumen",
          titulo: nombreCliente.get(clienteId) ?? "Cliente",
          detalle: `Su compra cayó ${caida}%: pasó de ${Math.round(totalPrevio).toLocaleString("es-CO")} a ${Math.round(totalReciente).toLocaleString("es-CO")} en el último trimestre.`,
          relevancia: caida >= 60 ? 5 : 3,
          valorPotencial: Math.round(totalPrevio - totalReciente),
          clienteId,
          accionSugerida: "Visitar para revisar si la competencia entró",
        })
      }
    }

    // ------------------------------------------------------ Venta cruzada
    // Productos que compran otros clientes del mismo segmento y este no.
    const productosPorPedido = new Map<number, Set<string>>()
    for (const d of detalleRes.data ?? []) {
      if (!productosPorPedido.has(d.pedido_id)) productosPorPedido.set(d.pedido_id, new Set())
      productosPorPedido.get(d.pedido_id)!.add(d.producto_nombre)
    }

    const productosPorCliente = new Map<number, Set<string>>()
    for (const p of pedidos) {
      if (!p.cliente_id) continue
      const productos = productosPorPedido.get((p as any).id) ?? new Set()
      if (!productosPorCliente.has(p.cliente_id)) productosPorCliente.set(p.cliente_id, new Set())
      for (const prod of productos) productosPorCliente.get(p.cliente_id)!.add(prod)
    }

    const porSegmento = new Map<string, number[]>()
    for (const c of clientes) {
      if (!c.segmento || !productosPorCliente.has(c.id)) continue
      if (!porSegmento.has(c.segmento)) porSegmento.set(c.segmento, [])
      porSegmento.get(c.segmento)!.push(c.id)
    }

    for (const [segmento, ids] of porSegmento) {
      if (ids.length < 3) continue // sin pares suficientes no hay comparación

      const frecuencia = new Map<string, number>()
      for (const id of ids) {
        for (const prod of productosPorCliente.get(id) ?? []) {
          frecuencia.set(prod, (frecuencia.get(prod) ?? 0) + 1)
        }
      }

      // Productos que compra más de la mitad del segmento.
      const comunes = [...frecuencia.entries()]
        .filter(([, n]) => n >= ids.length * 0.5)
        .map(([prod]) => prod)

      for (const id of ids) {
        const suyos = productosPorCliente.get(id) ?? new Set()
        const faltantes = comunes.filter((p) => !suyos.has(p))

        if (faltantes.length >= 2) {
          oportunidades.push({
            tipo: "venta_cruzada",
            titulo: nombreCliente.get(id) ?? "Cliente",
            detalle: `No compra ${faltantes.slice(0, 3).join(", ")}, que sí compran otros clientes de ${segmento}.`,
            relevancia: 3,
            clienteId: id,
            accionSugerida: `Ofrecer ${faltantes[0]}`,
          })
        }
      }
    }

    // ------------------------------------------------ Prospectos estancados
    for (const p of prospectosRes.data ?? []) {
      const etapa = (p as any).crm_etapas
      if (etapa?.es_ganada || etapa?.es_perdida) continue

      const dias = diasEntre((p.actualizado_en ?? hoy).slice(0, 10), hoy)
      if (dias >= diasFrio) {
        oportunidades.push({
          tipo: "prospecto_estancado",
          titulo: p.razon_social,
          detalle: `Lleva ${dias} días sin movimiento en la etapa "${etapa?.nombre ?? "—"}".`,
          relevancia: Number(p.valor_estimado) > 0 ? 4 : 2,
          valorPotencial: Number(p.valor_estimado) || undefined,
          prospectoId: p.id,
          accionSugerida: "Retomar el contacto o darlo por perdido",
        })
      }
    }

    // ----------------------------------------- Cotizaciones sin respuesta
    for (const c of cotizacionesRes.data ?? []) {
      const dias = diasEntre(c.fecha_emision, hoy)
      if (dias >= 7) {
        oportunidades.push({
          tipo: "cotizacion_sin_respuesta",
          titulo: nombreCliente.get(c.cliente_id) ?? c.numero ?? "Cotización",
          detalle: `La cotización ${c.numero} lleva ${dias} días enviada sin respuesta.`,
          relevancia: Number(c.total) > 1_000_000 ? 4 : 3,
          valorPotencial: Number(c.total) || undefined,
          clienteId: c.cliente_id ?? undefined,
          accionSugerida: "Llamar para saber si sigue en pie",
        })
      }
    }

    // ------------------------------------------------------ Cupo sin usar
    // Cliente con crédito aprobado que compra de contado o poco: hay margen
    // para venderle más sin más riesgo del ya aceptado.
    const { data: cartera } = await supabase
      .from("crm_cuentas_cobrar")
      .select("cliente_id, saldo")
      .eq("idempresa", empresaId)
      .in("estado", ["pendiente", "parcial"])

    const usado = new Map<number, number>()
    for (const c of cartera ?? []) {
      usado.set(c.cliente_id, (usado.get(c.cliente_id) ?? 0) + (Number(c.saldo) || 0))
    }

    for (const c of clientes) {
      const cupo = Number(c.cupo_credito) || 0
      if (cupo <= 0 || c.bloqueado_cartera) continue

      const enUso = usado.get(c.id) ?? 0
      if (enUso < cupo * 0.25 && porCliente.has(c.id)) {
        oportunidades.push({
          tipo: "cupo_sin_usar",
          titulo: c.nombre,
          detalle: `Tiene ${cupo.toLocaleString("es-CO")} de cupo y solo usa ${enUso.toLocaleString("es-CO")}.`,
          relevancia: 2,
          valorPotencial: Math.round(cupo - enUso),
          clienteId: c.id,
          accionSugerida: "Proponer un pedido mayor aprovechando el cupo",
        })
      }
    }

    // Las más relevantes primero; a igual relevancia, las de mayor valor.
    oportunidades.sort(
      (a, b) => b.relevancia - a.relevancia || (b.valorPotencial ?? 0) - (a.valorPotencial ?? 0),
    )

    return { success: true, data: oportunidades.slice(0, 50) }
  } catch (err) {
    return fallo(err)
  }
}
