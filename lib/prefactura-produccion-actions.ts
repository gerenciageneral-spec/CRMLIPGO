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
  OPS_INDUPAN,
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

/**
 * INDUPAN — órdenes de `cabeceraoc` con tipooperacion Tolva / Tolva f.
 * Mismo criterio de "procesada" que usa la prefactura del Cuadro de Control:
 * la orden cuenta solo si tiene `fincargue` y no está marcada `facturar = false`
 * (ver lib/facturacion-control-actions.ts). Paginado: sin él, un rango amplio
 * se truncaría en 1000 filas y la prefactura saldría corta EN SILENCIO.
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

  const ordenes: any[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await admin
      .from("cabeceraoc")
      .select("ordendecargue, fechacargue, tipooperacion, pesovascula, fincargue, facturar")
      .eq("idempresa", INDUPAN)
      .gte("fechacargue", desde)
      .lte("fechacargue", hasta)
      .order("fechacargue", { ascending: true })
      .range(off, off + 999)
    if (error) throw new Error(error.message)
    ordenes.push(...(data || []))
    if (!data || data.length < 1000) break
  }

  const opsNorm = new Set(OPS_INDUPAN.map(normOp))
  const facturables = ordenes.filter(
    (o: any) => opsNorm.has(normOp(o.tipooperacion)) && o.fincargue && o.facturar !== false && num(o.pesovascula) > 0,
  )

  // DETALLE DE PRODUCTOS. El soporte tiene que mostrar de dónde salen las
  // toneladas, porque el producto se maneja en BULTOS y se nombra en kilos
  // ("Indupan Especial 50 Kg."), pero la TARIFA es por TONELADA. Sin esto el
  // anexo solo diría "Tolva6586 = 73,9 t" sin explicar el 1.478 × 50 kg.
  const detPorOrden = new Map<string, any[]>()
  const codigos = facturables.map((o: any) => String(o.ordendecargue || "").trim()).filter(Boolean)
  for (let i = 0; i < codigos.length; i += 100) {
    const { data } = await admin
      .from("detalleoc")
      .select("numeroorden, producto, cantidad, toneladas")
      .in("numeroorden", codigos.slice(i, i + 100))
    for (const d of data || []) {
      const k = String(d.numeroorden || "").trim()
      if (!detPorOrden.has(k)) detPorOrden.set(k, [])
      detPorOrden.get(k)!.push(d)
    }
  }

  const porOp = new Map<string, { cantidad: number; total: number; tarifa: number; sinTarifa: boolean }>()
  const soporte: SoporteProduccion[] = []
  const alertas: AlertaAvimol[] = []
  const sinTarifaSet = new Set<string>()

  for (const o of facturables) {
    const fecha = String(o.fechacargue).slice(0, 10)
    const ton = num(o.pesovascula) // la BÁSCULA es la fuente de verdad del cobro

    // Se cobra con el nombre de operación tal como está en la tarifa, para que
    // el concepto del documento coincida con el maestro.
    const opTarifa = OPS_INDUPAN.find((x) => normOp(x) === normOp(o.tipooperacion)) || String(o.tipooperacion)
    const tarifa = tarifaVigente(opTarifa, fecha)
    if (tarifa === 0) sinTarifaSet.add(`${opTarifa}|${fecha}`)
    const valor = ton * tarifa

    const g = porOp.get(opTarifa) || { cantidad: 0, total: 0, tarifa: 0, sinTarifa: false }
    g.cantidad += ton
    g.total += valor
    if (tarifa > 0) g.tarifa = tarifa
    else g.sinTarifa = true
    porOp.set(opTarifa, g)

    const orden = String(o.ordendecargue || "").trim()
    const lineas = detPorOrden.get(orden) || []
    const sumaDetalle = lineas.reduce((a: number, l: any) => a + num(l.toneladas), 0)

    if (lineas.length === 0 || sumaDetalle <= 0) {
      // Sin detalle utilizable: se soporta la orden completa con el peso de báscula.
      soporte.push({
        fecha,
        concepto: opTarifa,
        detalle: orden,
        referencia: orden,
        bultos: null,
        kg: null,
        cantidad: ton,
        unidad: "t",
        tarifa,
        valor,
      })
      continue
    }

    // PRORRATEO a la báscula: si el detalle no suma exactamente lo pesado, se
    // ajusta para que el soporte cuadre con lo facturado al peso. Mismo criterio
    // que la prefactura del Cuadro de Control.
    const factor = ton / sumaDetalle
    for (const l of lineas) {
      const tonLinea = num(l.toneladas) * factor
      if (tonLinea <= 0) continue
      const bultos = num(l.cantidad)
      soporte.push({
        fecha,
        concepto: opTarifa,
        detalle: String(l.producto || "(sin producto)"),
        referencia: orden,
        bultos,
        // Kg reconstruido desde las toneladas ya prorrateadas: así el anexo
        // muestra la cadena completa bultos -> kg -> toneladas -> valor.
        kg: Number((tonLinea * 1000).toFixed(1)),
        cantidad: Number(tonLinea.toFixed(3)),
        unidad: "t",
        tarifa,
        valor: tonLinea * tarifa,
      })
    }
  }

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
