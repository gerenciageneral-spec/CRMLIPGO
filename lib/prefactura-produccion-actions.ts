"use server"

/**
 * PREFACTURA DE PRODUCCIÓN (Gestión Financiera › Facturación).
 *
 * Convierte en DOCUMENTO COBRABLE lo que hoy solo se veía como análisis. Cubre
 * los dos proyectos que se facturan por producción, cada uno con su fuente:
 *
 *   · AVIMOL (id 2) — tonelaje de tolva clasificado en Salvado / Estibado PT
 *     (con sus variantes de festivo) MÁS las horas extra por puesto.
 *     NO se reimplementa el cálculo: se llama a `getConciliacionAvimol`, que ya
 *     está validado contra el negocio, y aquí solo se AGREGA su salida. Así el
 *     documento no puede desviarse de la conciliación — si algún día cambia una
 *     regla de cobro, cambia en un solo lugar.
 *
 *   · INDUPAN (id 1) — órdenes de `cabeceraoc` con `tipooperacion` Tolva o
 *     Tolva f, cobradas por `pesovascula` × tarifa. Aquí sí hay consulta propia
 *     porque la fuente es distinta (en Avimol la tolva vive en `invtrans`).
 *
 * CICLO DE VIDA: comparte la tabla `prefacturas` con el Cuadro de Control,
 * discriminada por `origen = 'produccion'` (ver scripts/100_add_prefactura_produccion.sql).
 * Se reutiliza porque el ciclo borrador -> aprobada y el soporte congelado son
 * idénticos; duplicar la tabla sería duplicar ese código.
 *
 * NO calcula IVA ni retenciones: igual que la prefactura existente, esto es
 * base neta. El IVA y el retefuente los suma Gestión de Facturas al emitir.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
import { getConciliacionAvimol, type AlertaAvimol } from "@/lib/conciliacion-avimol-actions"
import type { Advertencia } from "@/lib/facturacion-control-actions"
// Las constantes viven en un módulo aparte: este archivo es "use server" y ahí
// solo se pueden exportar funciones async. Ver lib/prefactura-produccion-constants.ts.
import {
  PROYECTOS_PRODUCCION,
  AVIMOL_ID as AVIMOL,
  INDUPAN_ID as INDUPAN,
} from "@/lib/prefactura-produccion-constants"

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

const normOp = (s: any) => String(s ?? "").trim().toUpperCase()

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Una línea del RESUMEN de la prefactura (lo que ve y firma el cliente). */
export interface LineaResumen {
  concepto: string // "Salvado", "Estibado PT Festivo", "Tolva f", o el puesto
  tipo: "produccion" | "hora_extra"
  cantidad: number // toneladas o horas, según `unidad`
  unidad: "t" | "h"
  tarifa: number
  total: number
  /** true = no había tarifa vigente para ese concepto -> la línea vale $0 y se
   *  pinta en rojo. Sin esta marca el cero se sumaría en silencio. */
  sinTarifa: boolean
}

/** Una línea del SOPORTE (anexo que respalda la factura). Sirve para los dos
 *  proyectos; los campos que no aplican van en null. */
export interface SoporteProduccion {
  fecha: string
  concepto: string // la operación cobrada
  detalle: string // producto (Avimol) u orden de cargue (Indupan)
  referencia: string | null // orden de cargue, cuando aplica
  bultos: number | null
  kg: number | null
  cantidad: number
  unidad: "t" | "h"
  tarifa: number
  valor: number
  /** Lote de producción (AAAAMMDD) que respalda esta línea -- Indupan/Tolva
   *  únicamente. `fecha` ya sale de este lote (no de una orden), pero se deja
   *  el código crudo visible para que el anexo sea auditable. null en Avimol
   *  (no cambia; ese proyecto no factura por lote individual). */
  lote: string | null
}

export interface PrefacturaProduccionData {
  idempresa: number
  proyecto: string
  rango: { desde: string; hasta: string }
  produccion: LineaResumen[]
  horasExtra: LineaResumen[]
  soporte: SoporteProduccion[]
  totalProduccion: number
  totalHorasExtra: number
  total: number
  totalToneladas: number
  alertas: AlertaAvimol[]
  /** Prefacturas YA APROBADAS que se cruzan con este período. Es el análogo del
   *  anti-doble-cobro del Cuadro de Control: allá el semáforo lo da
   *  `cabeceraoc.facturasiigo` por orden, pero aquí la producción no tiene
   *  marca de "ya facturado" por registro, así que la señal es el solape. */
  solapes: Array<{ id: number; periodo: string; total: number; aprobadoPor: string | null }>
}

/** Línea tal como queda CONGELADA en la tabla al guardar. */
export interface PrefacturaProduccionGuardada {
  id: number
  idempresa: number
  proyecto: string | null
  periodo_desde: string | null
  periodo_hasta: string | null
  lineas: LineaResumen[]
  soporte: SoporteProduccion[]
  total: number
  toneladas: number
  estado: "borrador" | "aprobada"
  usuario: string | null
  observacion: string | null
  aprobado_por: string | null
  aprobado_en: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

const nombreProyecto = (idempresa: number) =>
  PROYECTOS_PRODUCCION.find((p) => p.idempresa === idempresa)?.nombre || `Proyecto ${idempresa}`

/**
 * AVIMOL — se agrega la salida de la conciliación, sin recalcular nada.
 * `dias[].productos[]` ya trae la operación resuelta (con festivo) y la tarifa
 * vigente aplicada; `dias[].detalleHorasExtra[]` trae las horas por puesto.
 */
async function armarAvimol(desde: string, hasta: string) {
  const r = await getConciliacionAvimol(desde, hasta)
  if (!r.success || !r.data) throw new Error(r.message || "No se pudo leer la conciliación de Avimol.")

  const prodPorOp = new Map<string, { cantidad: number; total: number; tarifa: number; sinTarifa: boolean }>()
  const hePorPuesto = new Map<string, { cantidad: number; total: number; tarifa: number; sinTarifa: boolean }>()
  const soporte: SoporteProduccion[] = []

  for (const d of r.data.dias) {
    for (const p of d.productos) {
      if (p.toneladas <= 0) continue
      const g = prodPorOp.get(p.operacion) || { cantidad: 0, total: 0, tarifa: 0, sinTarifa: false }
      g.cantidad += p.toneladas
      g.total += p.cobro
      if (p.tarifa > 0) g.tarifa = p.tarifa
      else g.sinTarifa = true
      prodPorOp.set(p.operacion, g)
      soporte.push({
        fecha: d.fecha,
        concepto: p.operacion,
        detalle: p.nombreproducto,
        referencia: null,
        bultos: p.bultos,
        kg: p.kg,
        cantidad: p.toneladas,
        unidad: "t",
        tarifa: p.tarifa,
        valor: p.cobro,
        lote: null, // Avimol no factura por lote individual -- sin cambio de comportamiento.
      })
    }
    for (const h of d.detalleHorasExtra) {
      if (h.horas <= 0) continue
      const g = hePorPuesto.get(h.puesto) || { cantidad: 0, total: 0, tarifa: 0, sinTarifa: false }
      g.cantidad += h.horas
      g.total += h.cobro
      if (h.tarifa > 0) g.tarifa = h.tarifa
      else g.sinTarifa = true
      hePorPuesto.set(h.puesto, g)
      soporte.push({
        fecha: d.fecha,
        concepto: `Hora extra · ${h.puesto}`,
        detalle: `HED ${h.hed} · HEDF ${h.hedf} · HEN ${h.hen} · HEF ${h.hef} · HN ${h.hn}`,
        referencia: null,
        bultos: null,
        kg: null,
        cantidad: h.horas,
        unidad: "h",
        lote: null,
        tarifa: h.tarifa,
        valor: h.cobro,
      })
    }
  }

  const aLinea = (
    m: Map<string, { cantidad: number; total: number; tarifa: number; sinTarifa: boolean }>,
    tipo: "produccion" | "hora_extra",
    unidad: "t" | "h",
  ): LineaResumen[] =>
    Array.from(m.entries())
      .map(([concepto, g]) => ({
        concepto,
        tipo,
        cantidad: Number(g.cantidad.toFixed(3)),
        unidad,
        // Tarifa EFECTIVA del grupo: si en el período hubo cambio de vigencia,
        // total/cantidad refleja la mezcla real mejor que una tarifa suelta.
        // Redondeo a centavos, no a peso entero.
        tarifa: g.cantidad > 0 ? Math.round((g.total / g.cantidad) * 100) / 100 : g.tarifa,
        total: Math.round(g.total),
        sinTarifa: g.sinTarifa,
      }))
      .sort((a, b) => a.concepto.localeCompare(b.concepto, "es"))

  return {
    produccion: aLinea(prodPorOp, "produccion", "t"),
    horasExtra: aLinea(hePorPuesto, "hora_extra", "h"),
    soporte,
    alertas: r.data.alertas,
  }
}

/** Parseo lote (AAAAMMDD) -> fecha ISO. Mismo guard que
 *  lib/conciliacion-avimol-actions.ts:88-98 (el lote se puede escribir a
 *  mano, así que puede no ser una fecha válida). */
function loteAFechaIndupan(lote: any): string | null {
  const s = String(lote || "").trim()
  if (!/^\d{8}$/.test(s)) return null
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(4, 6))
  const d = Number(s.slice(6, 8))
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (isNaN(dt.getTime()) || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

/** Mismo comodín que liquidacion-tolva-actions.ts / conciliacion-avimol-actions.ts
 *  — tolera la tilde de "producción". */
const ORIGEN_INGRESO_PRODUCCION_INDUPAN = "%ingreso producci%"

/**
 * INDUPAN — producción de Tolva / Tolva f.
 *
 * FUENTE: Aprobación de Ingreso de Producción (`invtrans`, tipomov='Entrada',
 * status='Aprobado', origen='ingreso producción') — NO `cabeceraoc.pesovascula`.
 * Para Tolva ese campo nunca fue una báscula real: Liquidación Tolva lo llena
 * con el mismo total que ya viene de aquí (lib/liquidacion-tolva-actions.ts),
 * así que ir a la fuente es más preciso, no menos.
 *
 * SEGREGACIÓN: por fecha del LOTE (AAAAMMDD), no por la orden de Liquidación
 * Tolva que recogió la producción. El cliente (Harinera Indupan) hace corte
 * ~3:00pm: una misma orden de liquidación (y un mismo día calendario) puede
 * traer producción de DOS lotes/fechas distintas (turno que cruza el corte).
 * Mismo patrón ya validado en Avimol (lib/conciliacion-avimol-actions.ts,
 * armarAvimol) — aquí se replica exactamente para Indupan/Tolva.
 *
 * Tolva vs Tolva f: domingo de la fecha del LOTE (mismo criterio que
 * `tipoOperacionTolva` en lib/liquidacion-tolva-actions.ts).
 */
async function armarIndupan(desde: string, hasta: string) {
  const admin: any = await getSupabaseAdmin()

  const { data: tarifas, error: errT } = await admin
    .from("tarifasoperacion")
    .select("operacion, tarifa, fechainicio, fechafin")
    .eq("empresaid", INDUPAN)
  if (errT) throw new Error(errT.message)

  // Tarifa vigente por (operación, fecha). `tarifasoperacion` usa
  // `fechainicio`/`fechafin` —no `fechaini`— y su columna `tarifa` es TEXT.
  // Se compara normalizado porque la tarifa está escrita "Tolva f".
  const tarifaVigente = (operacion: string, fecha: string): number => {
    const fila = (tarifas || []).find(
      (t: any) =>
        normOp(t.operacion) === normOp(operacion) &&
        String(t.fechainicio).slice(0, 10) <= fecha &&
        String(t.fechafin).slice(0, 10) >= fecha,
    )
    return fila ? num(fila.tarifa) : 0
  }

  const alertas: AlertaAvimol[] = []

  // Confirmado con el negocio 2026-09-16: estos productos pasan por Aprobación
  // de Ingreso de Producción pero NO son Tolva -- son subproducto de la
  // molienda propia de Indupan (mogolla, salvado, harina de tercera) y una
  // marca de otro cliente toll-milled en la planta ("La Nieve" en libras).
  // EXCLUSIÓN TEMPORAL "hasta nueva orden" -- si el negocio confirma que sí
  // se deben facturar, quitar este filtro (no la lógica de arriba).
  const PRODUCTOS_NO_TOLVA_INDUPAN = new Set(["Mogolla Kg.", "PT LA NIEVE 25LB", "Harina de Tercera", "Salvado Kg."])

  // Ingresos aprobados, filtrados por LOTE (AAAAMMDD ordena igual lexicográfica
  // que cronológicamente, así que el rango se filtra directo en la BD y de
  // paso deja fuera los lotes que no son fecha).
  const loteDesde = desde.replace(/-/g, "")
  const loteHasta = hasta.replace(/-/g, "")
  const ingresosCrudos: any[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await admin
      .from("invtrans")
      .select("id, idproducto, nombreproducto, cantidad, lote, fechaprod, creadopor, tipo_produccion, observaciones")
      .eq("idempresa", INDUPAN)
      .eq("tipomov", "Entrada")
      .eq("status", "Aprobado")
      .ilike("origen", ORIGEN_INGRESO_PRODUCCION_INDUPAN)
      .gte("lote", loteDesde)
      .lte("lote", loteHasta)
      .range(off, off + 999)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    ingresosCrudos.push(...data)
    if (data.length < 1000) break
  }
  // Confirmado con el negocio 2026-09-16/17: Tolva la produce el LOGO. Lo que
  // entra manual ("transacción manual" / usuario humano en `creadopor`) son
  // devoluciones o descargues que se aprueban por el mismo módulo pero no
  // son producción de Tolva -- se verificó con un caso real (5 transacciones
  // del 17-ago, creadas semanas después por "Coordinador Indupan", con
  // `fechaprod` que ni siquiera coincidía con el lote).
  // `tipo_produccion = 'Harinera'` -- producción PROPIA que genera inventario
  // pero NO se cobra (mismo criterio ya validado en Avimol, ver
  // EXCLUIR_HARINERA en lib/conciliacion-avimol-actions.ts). Verificado con
  // datos reales: incluye devoluciones/descargues explícitos (observaciones
  // "Descargue de material") pero TAMBIÉN lotes grandes de productos núcleo
  // (700 bultos de Indupan Premium 50 Kg. en un solo movimiento, sin turno
  // real detrás) -- por eso este filtro reemplaza a la lista fija de 4
  // productos de abajo como criterio principal; la lista se conserva como
  // respaldo por si algún caso no trae `tipo_produccion` marcado.
  const ingresos = ingresosCrudos.filter(
    (r: any) =>
      r.creadopor === "LOGO" &&
      r.tipo_produccion !== "Harinera" &&
      !PRODUCTOS_NO_TOLVA_INDUPAN.has(String(r.nombreproducto || "")),
  )

  // Ingresos aprobados del rango cuyo LOTE no es una fecha parseable: el
  // filtro de arriba los deja fuera, así que se buscan por `fechaprod` para
  // que no queden invisibles (no suman al cobro, solo se alertan). Mismo
  // filtro LOGO + exclusión de productos que `ingresos` -- si no, cualquier
  // devolución/descargue manual con lote roto dispararía una alerta de algo
  // que de todas formas nunca se iba a facturar.
  {
    const { data } = await admin
      .from("invtrans")
      .select("id, nombreproducto, lote, fechaprod, creadopor, tipo_produccion")
      .eq("idempresa", INDUPAN)
      .eq("tipomov", "Entrada")
      .eq("status", "Aprobado")
      .ilike("origen", ORIGEN_INGRESO_PRODUCCION_INDUPAN)
      .eq("creadopor", "LOGO")
      .gte("fechaprod", desde)
      .lte("fechaprod", hasta)
      .range(0, 999)
    for (const r of data || []) {
      if (r.tipo_produccion === "Harinera") continue
      if (PRODUCTOS_NO_TOLVA_INDUPAN.has(String(r.nombreproducto || ""))) continue
      if (loteAFechaIndupan(r.lote) === null) {
        alertas.push({
          tipo: "lote_invalido",
          detalle: `Ingreso #${r.id} (${r.nombreproducto || "sin producto"}) con lote "${r.lote ?? ""}" no es una fecha AAAAMMDD — no se factura. Producción: ${String(r.fechaprod ?? "").slice(0, 10) || "—"}.`,
        })
      }
    }
  }

  // Peso unitario por producto (kg/bulto) — el producto se maneja en BULTOS
  // y se nombra en kilos ("Indupan Especial 50 Kg."), pero la TARIFA es por
  // TONELADA.
  const idsProducto = Array.from(
    new Set(ingresos.map((r: any) => r.idproducto).filter((x: any) => x != null).map((x: any) => Number(x))),
  )
  const pesoPorProducto = new Map<number, number>()
  for (let i = 0; i < idsProducto.length; i += 100) {
    const chunk = idsProducto.slice(i, i + 100)
    const { data } = await admin.from("productos").select("id, peso_unitkg").in("id", chunk)
    for (const p of data || []) pesoPorProducto.set(Number(p.id), num(p.peso_unitkg))
  }

  const porOp = new Map<string, { cantidad: number; total: number; tarifa: number; sinTarifa: boolean }>()
  // Agregado por (lote, producto): cada ingreso individual es UNA lectura de
  // báscula/QR (puede haber decenas por lote), así que sin agregar aquí el
  // soporte queda con filas repetidas idénticas -- mismo patrón de
  // `dia.productos` en conciliacion-avimol-actions.ts (líneas ~520-530).
  const porLoteProducto = new Map<string, SoporteProduccion>()
  const sinTarifaSet = new Set<string>()

  for (const r of ingresos) {
    const fecha = loteAFechaIndupan(r.lote)
    if (!fecha) {
      alertas.push({
        tipo: "lote_invalido",
        detalle: `Ingreso #${r.id} (${r.nombreproducto || "sin producto"}) con lote "${r.lote ?? ""}" no parseable — excluido del cobro.`,
      })
      continue
    }

    const peso = r.idproducto != null ? pesoPorProducto.get(Number(r.idproducto)) || 0 : 0
    const bultos = num(r.cantidad)
    const kg = bultos * peso
    const ton = kg / 1000
    if (ton <= 0) continue

    const [y, m, d] = fecha.split("-").map(Number)
    const esDomingo = new Date(y, m - 1, d).getDay() === 0
    const opTarifa = esDomingo ? "Tolva f" : "Tolva"

    const tarifa = tarifaVigente(opTarifa, fecha)
    if (tarifa === 0) sinTarifaSet.add(`${opTarifa}|${fecha}`)
    const valor = ton * tarifa

    const g = porOp.get(opTarifa) || { cantidad: 0, total: 0, tarifa: 0, sinTarifa: false }
    g.cantidad += ton
    g.total += valor
    if (tarifa > 0) g.tarifa = tarifa
    else g.sinTarifa = true
    porOp.set(opTarifa, g)

    const nombre = String(r.nombreproducto || "(sin producto)")
    const k = `${r.lote}|${nombre}`
    const existente = porLoteProducto.get(k)
    if (existente) {
      existente.bultos = (existente.bultos ?? 0) + bultos
      existente.kg = (existente.kg ?? 0) + kg
      existente.cantidad += ton
      existente.valor += valor
    } else {
      porLoteProducto.set(k, {
        fecha,
        concepto: opTarifa,
        detalle: nombre,
        referencia: null, // ya no hay una "orden" por línea -- se factura por lote, ver `lote`
        bultos,
        kg,
        cantidad: ton,
        unidad: "t",
        tarifa,
        valor,
        lote: r.lote,
      })
    }
  }

  const soporte: SoporteProduccion[] = Array.from(porLoteProducto.values()).map((s) => ({
    ...s,
    bultos: s.bultos != null ? Number(s.bultos.toFixed(0)) : null,
    kg: s.kg != null ? Number(s.kg.toFixed(1)) : null,
    cantidad: Number(s.cantidad.toFixed(3)),
    valor: Math.round(s.valor),
  }))

  for (const k of sinTarifaSet) {
    const [op, f] = k.split("|")
    alertas.push({ tipo: "sin_tarifa", detalle: `${f} · ${op}: sin tarifa vigente en tarifasoperacion (se cobra $0)` })
  }

  const produccion: LineaResumen[] = Array.from(porOp.entries())
    .map(([concepto, g]) => ({
      concepto,
      tipo: "produccion" as const,
      cantidad: Number(g.cantidad.toFixed(3)),
      unidad: "t" as const,
      tarifa: g.cantidad > 0 ? Math.round((g.total / g.cantidad) * 100) / 100 : g.tarifa,
      total: Math.round(g.total),
      sinTarifa: g.sinTarifa,
    }))
    .sort((a, b) => a.concepto.localeCompare(b.concepto, "es"))

  return { produccion, horasExtra: [] as LineaResumen[], soporte, alertas }
}

/** Prefacturas APROBADAS del mismo proyecto y origen que se cruzan con el rango. */
async function buscarSolapes(idempresa: number, desde: string, hasta: string) {
  const admin: any = await getSupabaseAdmin()
  const { data } = await admin
    .from("prefacturas")
    .select("id, periodo_desde, periodo_hasta, total, aprobado_por")
    .eq("idempresa", idempresa)
    .eq("origen", "produccion")
    .eq("estado", "aprobada")
  // Dos períodos se cruzan si cada uno empieza antes de que el otro termine.
  return (data || [])
    .filter((p: any) => {
      const d = String(p.periodo_desde || "").slice(0, 10)
      const h = String(p.periodo_hasta || "").slice(0, 10)
      if (!d || !h) return false
      return d <= hasta && h >= desde
    })
    .map((p: any) => ({
      id: Number(p.id),
      periodo: `${String(p.periodo_desde).slice(0, 10)} a ${String(p.periodo_hasta).slice(0, 10)}`,
      total: num(p.total),
      aprobadoPor: p.aprobado_por || null,
    }))
}

export async function getPrefacturaProduccion(
  idempresa: number,
  desde: string,
  hasta: string,
): Promise<{ success: boolean; data?: PrefacturaProduccionData; message?: string }> {
  // Validaciones que el módulo original NO tiene y aquí sí importan: esto se le
  // cobra a un cliente, un rango mal puesto genera una factura mal armada.
  if (!idempresa) return { success: false, message: "Selecciona un proyecto." }
  if (!PROYECTOS_PRODUCCION.some((p) => p.idempresa === idempresa))
    return { success: false, message: "Ese proyecto no se factura por producción." }
  if (!desde || !hasta) return { success: false, message: "El rango de fechas es obligatorio." }
  if (desde > hasta) return { success: false, message: "La fecha 'desde' no puede ser mayor que 'hasta'." }

  try {
    const armado = idempresa === AVIMOL ? await armarAvimol(desde, hasta) : await armarIndupan(desde, hasta)
    const totalProduccion = armado.produccion.reduce((a, l) => a + l.total, 0)
    const totalHorasExtra = armado.horasExtra.reduce((a, l) => a + l.total, 0)
    const totalToneladas = armado.produccion.reduce((a, l) => a + l.cantidad, 0)

    return {
      success: true,
      data: {
        idempresa,
        proyecto: nombreProyecto(idempresa),
        rango: { desde, hasta },
        produccion: armado.produccion,
        horasExtra: armado.horasExtra,
        soporte: armado.soporte.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.concepto.localeCompare(b.concepto)),
        totalProduccion,
        totalHorasExtra,
        total: totalProduccion + totalHorasExtra,
        totalToneladas: Number(totalToneladas.toFixed(3)),
        alertas: armado.alertas,
        solapes: await buscarSolapes(idempresa, desde, hasta),
      },
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al armar la prefactura de producción." }
  }
}

// ---------------------------------------------------------------------------
// Ciclo de vida (borrador -> aprobada)
// ---------------------------------------------------------------------------

export async function guardarPrefacturaProduccion(payload: {
  idempresa: number
  proyecto?: string | null
  periodo_desde: string
  periodo_hasta: string
  lineas: LineaResumen[]
  soporte?: SoporteProduccion[]
  total: number
  toneladas: number
  observacion?: string | null
  /** El usuario ya vio el aviso de solape y decidió continuar. */
  confirmarSolape?: boolean
  advertencias?: Advertencia[]
  /** Para llamadas sin sesión (cron): reemplaza a `getCurrentUsuarioForInsert()`,
   *  que sin sesión cae en "admin" -- con esto queda "sistema (cron diario)",
   *  igual que ya se ve en los eventos del Ciclo de Facturación. */
  usuarioOverride?: string
}): Promise<{ success: boolean; id?: number; message?: string }> {
  if (!payload?.idempresa) return { success: false, message: "Falta el proyecto." }
  if (!payload.periodo_desde || !payload.periodo_hasta)
    return { success: false, message: "El rango de fechas es obligatorio." }
  if (payload.periodo_desde > payload.periodo_hasta)
    return { success: false, message: "La fecha 'desde' no puede ser mayor que 'hasta'." }
  if (!payload.lineas?.length)
    return { success: false, message: "La prefactura no tiene conceptos seleccionados." }
  if (!(payload.total > 0))
    return { success: false, message: "La prefactura suma $0: no hay nada que cobrar." }

  try {
    // ANTI-DOBLE-COBRO. En el Cuadro de Control el semáforo lo da
    // `cabeceraoc.facturasiigo` por orden; aquí la producción no tiene marca de
    // "ya facturado" por registro, así que la señal equivalente es que exista
    // una prefactura APROBADA cubriendo el mismo período.
    if (!payload.confirmarSolape) {
      const solapes = await buscarSolapes(payload.idempresa, payload.periodo_desde, payload.periodo_hasta)
      if (solapes.length > 0) {
        return {
          success: false,
          message: `Ya hay ${solapes.length} prefactura(s) APROBADA(S) que cubren este período (${solapes
            .map((s: { id: number; periodo: string }) => `#${s.id} ${s.periodo}`)
            .join(", ")}). Guardar esta cobraría dos veces lo mismo.`,
        }
      }
    }

    const admin: any = await getSupabaseAdmin()
    const usuario = payload.usuarioOverride || (await getCurrentUsuarioForInsert())
    const { data, error } = await admin
      .from("prefacturas")
      .insert({
        idempresa: payload.idempresa,
        origen: "produccion",
        proyecto: payload.proyecto ?? nombreProyecto(payload.idempresa),
        periodo_desde: payload.periodo_desde,
        periodo_hasta: payload.periodo_hasta,
        lineas: payload.lineas,
        // Soporte CONGELADO: foto fiel de lo que respalda la factura. Se excluyen
        // las líneas en cero, que solo ensucian el anexo.
        soporte: (payload.soporte ?? []).filter((l) => l.valor > 0),
        total: payload.total,
        toneladas: payload.toneladas,
        // Se crea YA APROBADA (antes: "borrador", nunca se creaba aprobada).
        // No existe un paso interno de "aprobar la prefactura" en el negocio
        // -- generarla con el periodo ya construye el anexo y arranca el
        // Ciclo de Facturación. La única aprobación real es la del CLIENTE
        // firmando el anexo (evento "anexo_firmado"), no un clic interno de
        // LIPGO. `buscarSolapes` sigue funcionando igual (y ahora atrapa el
        // doble cobro DESDE la creación, no solo al aprobar a mano).
        estado: "aprobada",
        aprobado_por: usuario,
        aprobado_en: new Date().toISOString(),
        estado_ciclo: "pendiente_anexo",
        ciclo_actualizado_en: new Date().toISOString(),
        usuario,
        observacion: payload.observacion ?? null,
        advertencias: payload.advertencias ?? [],
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (error) return { success: false, message: error.message }
    return { success: true, id: data?.id }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al guardar la prefactura." }
  }
}

export async function listarPrefacturasProduccion(
  idempresa?: number | null,
): Promise<{ success: boolean; data: PrefacturaProduccionGuardada[]; message?: string }> {
  try {
    const admin: any = await getSupabaseAdmin()
    let q = admin
      .from("prefacturas")
      .select("*")
      .eq("origen", "produccion") // aisladas de las del Cuadro de Control
      .order("created_at", { ascending: false })
      .limit(200)
    if (idempresa) q = q.eq("idempresa", idempresa)
    const { data, error } = await q
    if (error) return { success: false, data: [], message: error.message }
    return { success: true, data: (data || []) as PrefacturaProduccionGuardada[] }
  } catch (e: any) {
    return { success: false, data: [], message: e?.message || "Error al listar prefacturas." }
  }
}

/** Aprobar deja el documento en firme, REGISTRA QUIÉN lo aprobó, y arranca el Ciclo de Facturación. */
export async function aprobarPrefacturaProduccion(id: number): Promise<{ success: boolean; message?: string }> {
  if (!id) return { success: false, message: "Prefactura inválida." }
  try {
    const admin: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert()
    const { data, error } = await admin
      .from("prefacturas")
      .update({
        estado: "aprobada",
        aprobado_por: usuario,
        aprobado_en: new Date().toISOString(),
        estado_ciclo: "pendiente_anexo",
        ciclo_actualizado_en: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("origen", "produccion")
      .eq("estado", "borrador") // no re-aprobar ni tocar una ya aprobada
      .select("id")
    if (error) return { success: false, message: error.message }
    if (!data?.length) return { success: false, message: "No se encontró como borrador (¿ya estaba aprobada?)." }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al aprobar." }
  }
}

/** Reabrir devuelve a borrador y limpia el rastro de aprobación. Bloqueado si el Ciclo de Facturación ya avanzó (anexo enviado o más), salvo que se fuerce. */
export async function reabrirPrefacturaProduccion(id: number, forzar?: boolean): Promise<{ success: boolean; message?: string }> {
  if (!id) return { success: false, message: "Prefactura inválida." }
  try {
    const admin: any = await getSupabaseAdmin()
    if (!forzar) {
      const { data: actual } = await admin.from("prefacturas").select("estado_ciclo").eq("id", id).maybeSingle()
      if (actual && actual.estado_ciclo && actual.estado_ciclo !== "pendiente_anexo") {
        return {
          success: false,
          message:
            "Esta prefactura ya tiene avance en el Ciclo de Facturación (anexo enviado o más) -- reabrirla para editar " +
            "invalidaría un documento que puede estar firmado por el cliente.",
        }
      }
    }
    const { error } = await admin
      .from("prefacturas")
      .update({ estado: "borrador", aprobado_por: null, aprobado_en: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("origen", "produccion")
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al reabrir." }
  }
}

/** Solo se elimina un BORRADOR: una aprobada ya se le pasó al cliente. */
export async function eliminarPrefacturaProduccion(id: number): Promise<{ success: boolean; message?: string }> {
  if (!id) return { success: false, message: "Prefactura inválida." }
  try {
    const admin: any = await getSupabaseAdmin()
    const { data, error } = await admin
      .from("prefacturas")
      .delete()
      .eq("id", id)
      .eq("origen", "produccion")
      .eq("estado", "borrador")
      .select("id")
    if (error) return { success: false, message: error.message }
    // El módulo original devuelve success aunque no borre nada (no-op silencioso).
    if (!data?.length)
      return { success: false, message: "No se eliminó: solo se pueden borrar prefacturas en estado borrador." }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "Error al eliminar." }
  }
}
