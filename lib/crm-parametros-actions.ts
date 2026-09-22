"use server"

// Lectura y escritura de los parametros de negocio del CRM.
//
// REGLA DEL PROYECTO: si un numero gobierna una regla de negocio, se lee de
// aqui. Un literal en el codigo es un bug, no un atajo.
//
// CACHE: se cachea por empresa con TTL corto. Sin cache, calcular el total de
// un pedido de 20 lineas dispararia 20 consultas por el mismo IVA. Con TTL de
// 60s, un cambio de parametro se propaga en menos de un minuto a todas las
// instancias, que para un parametro de negocio es de sobra. En Vercel cada
// lambda tiene su propia copia; por eso el TTL y no una invalidacion global,
// que no habria forma de coordinar entre instancias.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { PARAM_FALLBACK, type ParamKey, type CrmParametro } from "@/lib/crm-parametros"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

const TTL_MS = 60_000

type Entrada = { valores: Map<string, string>; expira: number }
const cache = new Map<number, Entrada>()

/** Trae todos los parametros vigentes de la empresa, cacheados. */
async function cargar(empresaId: number): Promise<Map<string, string>> {
  const ahora = Date.now()
  const vigente = cache.get(empresaId)
  if (vigente && vigente.expira > ahora) return vigente.valores

  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_parametros")
      .select("clave, valor")
      .eq("idempresa", empresaId)
      .is("vigente_hasta", null)

    if (error) throw error

    const valores = new Map<string, string>()
    for (const fila of data ?? []) valores.set(fila.clave, fila.valor)

    cache.set(empresaId, { valores, expira: ahora + TTL_MS })
    return valores
  } catch (err) {
    // Se devuelve lo cacheado aunque este vencido: un parametro algo viejo es
    // mejor que tumbar la pantalla. Si no hay nada, manda el fallback.
    console.error("[crm-parametros] no se pudo leer la tabla:", err)
    return vigente?.valores ?? new Map()
  }
}

/** Valor crudo (texto) de un parametro. */
export async function getParam(clave: ParamKey, empresaId = 1): Promise<string> {
  const valores = await cargar(empresaId)
  return valores.get(clave) ?? PARAM_FALLBACK[clave] ?? ""
}

/** Parametro numerico. `fallback` solo aplica si el valor no es un numero. */
export async function getParamNumber(clave: ParamKey, empresaId = 1, fallback?: number): Promise<number> {
  const crudo = await getParam(clave, empresaId)
  const n = Number(crudo)
  if (Number.isFinite(n)) return n
  if (typeof fallback === "number") return fallback
  const porDefecto = Number(PARAM_FALLBACK[clave])
  return Number.isFinite(porDefecto) ? porDefecto : 0
}

/** Parametro booleano. Solo "true" (sin distinguir mayusculas) es verdadero. */
export async function getParamBool(clave: ParamKey, empresaId = 1): Promise<boolean> {
  const crudo = await getParam(clave, empresaId)
  return String(crudo).trim().toLowerCase() === "true"
}

/** Varios parametros en UNA sola lectura. Preferir esto en cualquier calculo
 *  que necesite mas de uno (el de un pedido usa IVA, tope de descuento y
 *  validacion de cupo a la vez). */
export async function getParams(claves: ParamKey[], empresaId = 1): Promise<Record<string, string>> {
  const valores = await cargar(empresaId)
  const salida: Record<string, string> = {}
  for (const clave of claves) salida[clave] = valores.get(clave) ?? PARAM_FALLBACK[clave] ?? ""
  return salida
}

/** Todos los parametros con sus metadatos, para la pantalla de Parametrizacion. */
export async function listarParametros(empresaId = 1): Promise<ActionResult<CrmParametro[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_parametros")
      .select("*")
      .eq("idempresa", empresaId)
      .is("vigente_hasta", null)
      .order("grupo")
      .order("etiqueta")

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as CrmParametro[] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" }
  }
}

/**
 * Cambia un parametro.
 *
 * NO hace UPDATE en sitio: cierra el vigente poniendole vigente_hasta = hoy y
 * abre uno nuevo. Asi queda la historia de que valor regia en cada momento,
 * que es lo que permite explicar por que una comision de hace tres meses se
 * liquido distinto de la de hoy.
 */
export async function setParam(
  clave: ParamKey,
  valor: string,
  usuario: string,
  empresaId = 1,
): Promise<ActionResult<CrmParametro>> {
  try {
    const supabase = await getSupabaseAdmin()

    const { data: actual, error: errLectura } = await supabase
      .from("crm_parametros")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("clave", clave)
      .is("vigente_hasta", null)
      .maybeSingle()

    if (errLectura) return { success: false, error: errLectura.message }
    if (!actual) return { success: false, error: `El parametro "${clave}" no existe` }
    if (!actual.editable) return { success: false, error: `El parametro "${actual.etiqueta}" no es editable` }

    // Validaciones segun el tipo declarado, antes de tocar nada.
    if (actual.tipo === "number") {
      const n = Number(valor)
      if (!Number.isFinite(n)) return { success: false, error: "El valor debe ser un numero" }
      if (actual.min_valor != null && n < actual.min_valor)
        return { success: false, error: `El minimo permitido es ${actual.min_valor}` }
      if (actual.max_valor != null && n > actual.max_valor)
        return { success: false, error: `El maximo permitido es ${actual.max_valor}` }
    }
    if (actual.tipo === "boolean" && !["true", "false"].includes(valor.toLowerCase())) {
      return { success: false, error: "El valor debe ser true o false" }
    }

    if (actual.valor === valor) {
      return { success: true, data: actual as CrmParametro } // nada que hacer
    }

    const hoy = new Date().toISOString().slice(0, 10)

    // Si ya se cambio hoy, se reemplaza la fila del dia en vez de cerrarla:
    // el indice unico (idempresa, clave, vigente_desde) no admite dos filas
    // con la misma fecha de inicio.
    if (actual.vigente_desde === hoy) {
      const { data, error } = await supabase
        .from("crm_parametros")
        .update({ valor, actualizado_por: usuario, actualizado_en: new Date().toISOString() })
        .eq("id", actual.id)
        .select()
        .single()

      if (error) return { success: false, error: error.message }
      cache.delete(empresaId)
      return { success: true, data: data as CrmParametro }
    }

    // Cerrar el vigente...
    const { error: errCierre } = await supabase
      .from("crm_parametros")
      .update({ vigente_hasta: hoy, actualizado_por: usuario })
      .eq("id", actual.id)

    if (errCierre) return { success: false, error: errCierre.message }

    // ...y abrir el nuevo conservando los metadatos.
    const { data, error } = await supabase
      .from("crm_parametros")
      .insert({
        idempresa: empresaId,
        clave: actual.clave,
        valor,
        tipo: actual.tipo,
        grupo: actual.grupo,
        etiqueta: actual.etiqueta,
        descripcion: actual.descripcion,
        unidad: actual.unidad,
        min_valor: actual.min_valor,
        max_valor: actual.max_valor,
        vigente_desde: hoy,
        editable: actual.editable,
        actualizado_por: usuario,
      })
      .select()
      .single()

    if (error) {
      // Reabrir el anterior: dejarlo cerrado sin sucesor deja al sistema sin
      // ese parametro y cayendo al fallback sin que nadie se entere.
      await supabase.from("crm_parametros").update({ vigente_hasta: null }).eq("id", actual.id)
      return { success: false, error: error.message }
    }

    cache.delete(empresaId)
    return { success: true, data: data as CrmParametro }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" }
  }
}

/** Historial de un parametro, para responder "que IVA regia en marzo". */
export async function historialParametro(clave: ParamKey, empresaId = 1): Promise<ActionResult<CrmParametro[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_parametros")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("clave", clave)
      .order("vigente_desde", { ascending: false })

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as CrmParametro[] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" }
  }
}

/** Vacia la cache. La usan las pruebas y el guardado de parametros. */
export async function invalidarCacheParametros(empresaId?: number): Promise<void> {
  if (empresaId == null) cache.clear()
  else cache.delete(empresaId)
}
