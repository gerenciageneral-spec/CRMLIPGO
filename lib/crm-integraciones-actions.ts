"use server"

// Panel de integraciones: ver la bandeja de salida, reintentar, descartar y
// procesar a mano (INT-08, ADM-03).
//
// Todo exige `crm_integraciones_admin`. Es un permiso delicado: descartar un
// envio a SAP significa que ese documento no llegara nunca a contabilidad.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { exigirPermiso, mensajeError } from "@/lib/crm-auth"
import { registrarEvento } from "@/lib/crm-eventos"
import { leerParamBool } from "@/lib/crm-parametros-server"
import { PARAM } from "@/lib/crm-parametros"
import { modoSapActual, procesarLote, type ResumenLote } from "@/lib/integraciones/outbox"
import { canalWhatsapp } from "@/lib/integraciones/whatsapp"
import type { EstadoOutbox, FlujoSap, ModoSap, RegistroOutbox } from "@/lib/integraciones/tipos"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

const PERMISO = "crm_integraciones_admin"

export interface EstadoIntegraciones {
  modoSap: ModoSap
  whatsappActivo: boolean
  flujosSap: Record<FlujoSap, boolean>
  conteo: Partial<Record<EstadoOutbox, number>>
}

export async function getEstadoIntegraciones(empresaId = 1): Promise<ActionResult<EstadoIntegraciones>> {
  try {
    await exigirPermiso("getEstadoIntegraciones", PERMISO)
    const supabase = await getSupabaseAdmin()

    const [pedidos, recaudos, clientes, facturas, inventario, sucursales, filas] = await Promise.all([
      leerParamBool(PARAM.SAP_PEDIDOS, empresaId),
      leerParamBool(PARAM.SAP_RECAUDOS, empresaId),
      leerParamBool(PARAM.SAP_CLIENTES, empresaId),
      leerParamBool(PARAM.SAP_FACTURAS, empresaId),
      leerParamBool(PARAM.SAP_INVENTARIO, empresaId),
      leerParamBool(PARAM.SAP_SUCURSALES, empresaId),
      supabase.from("crm_integracion_outbox").select("estado").eq("idempresa", empresaId).limit(10000),
    ])

    const conteo: Partial<Record<EstadoOutbox, number>> = {}
    for (const f of (filas.data ?? []) as { estado: EstadoOutbox }[]) conteo[f.estado] = (conteo[f.estado] ?? 0) + 1

    return {
      success: true,
      data: {
        modoSap: modoSapActual(),
        whatsappActivo: canalWhatsapp.activo,
        flujosSap: { pedidos, recaudos, clientes, facturas, inventario, sucursales },
        conteo,
      },
    }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}

export async function listarOutbox(
  empresaId = 1,
  filtros?: { estado?: EstadoOutbox; sistema?: string; entidad?: string; entidadId?: number },
): Promise<ActionResult<RegistroOutbox[]>> {
  try {
    await exigirPermiso("listarOutbox", PERMISO)
    const supabase = await getSupabaseAdmin()
    let q = supabase.from("crm_integracion_outbox").select("*").eq("idempresa", empresaId)
    if (filtros?.estado) q = q.eq("estado", filtros.estado)
    if (filtros?.sistema) q = q.eq("sistema", filtros.sistema)
    if (filtros?.entidad) q = q.eq("entidad", filtros.entidad)
    if (filtros?.entidadId) q = q.eq("entidad_id", filtros.entidadId)
    const { data, error } = await q.order("creado_en", { ascending: false }).limit(500)
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as RegistroOutbox[] }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}

export interface IntentoLog {
  id: number
  modo: string
  ok: boolean
  http_status: number | null
  duracion_ms: number | null
  error: string | null
  request: unknown
  response: unknown
  creado_en: string
}

/** Cada intento de un envio, con lo que se mando y lo que respondio. */
export async function getIntentosOutbox(outboxId: number, empresaId = 1): Promise<ActionResult<IntentoLog[]>> {
  try {
    await exigirPermiso("getIntentosOutbox", PERMISO)
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_integracion_log")
      .select("id, modo, ok, http_status, duracion_ms, error, request, response, creado_en")
      .eq("idempresa", empresaId)
      .eq("outbox_id", outboxId)
      .order("creado_en", { ascending: false })
      .limit(50)
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as IntentoLog[] }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}

/** Devuelve un envio a la cola con los intentos en cero, para que salga en la
 *  proxima pasada. Sirve tras corregir el dato que SAP rechazaba. */
export async function reintentarEnvio(id: number, empresaId = 1): Promise<ActionResult> {
  try {
    const ctx = await exigirPermiso("reintentarEnvio", PERMISO)
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_integracion_outbox")
      .update({
        estado: "pendiente",
        intentos: 0,
        proximo_intento_en: new Date().toISOString(),
        bloqueado_por: null,
        bloqueado_en: null,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("idempresa", empresaId)
      .in("estado", ["error", "omitido", "descartado", "pendiente"])
      .select("id")
    if (error) return { success: false, error: error.message }
    if (!data?.length) return { success: false, error: "Ese envío ya salió o se está procesando." }

    await registrarEvento({
      empresaId, entidad: "integracion", entidadId: id, tipo: "reintento_manual",
      usuarioId: ctx.userId, usuarioNombre: ctx.nombre,
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}

/** Marca un envio como descartado: no se enviara. Exige motivo, porque es la
 *  unica forma de que un documento aprobado NO llegue al sistema externo. */
export async function descartarEnvio(id: number, motivo: string, empresaId = 1): Promise<ActionResult> {
  try {
    const ctx = await exigirPermiso("descartarEnvio", PERMISO)
    if (!motivo?.trim()) return { success: false, error: "Indica por qué se descarta el envío." }
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_integracion_outbox")
      .update({ estado: "descartado", ultimo_error: `Descartado: ${motivo.trim()}`, actualizado_en: new Date().toISOString() })
      .eq("id", id)
      .eq("idempresa", empresaId)
      .in("estado", ["pendiente", "error", "omitido"])
      .select("id")
    if (error) return { success: false, error: error.message }
    if (!data?.length) return { success: false, error: "Ese envío ya salió o se está procesando." }

    await registrarEvento({
      empresaId, entidad: "integracion", entidadId: id, tipo: "descartado",
      usuarioId: ctx.userId, usuarioNombre: ctx.nombre, nota: motivo.trim(),
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}

/** Procesa un lote ya, sin esperar al cron. */
export async function procesarAhora(): Promise<ActionResult<ResumenLote>> {
  try {
    const ctx = await exigirPermiso("procesarAhora", PERMISO)
    const resumen = await procesarLote(50, `manual:${ctx.nombre}`)
    return { success: true, data: resumen }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}
