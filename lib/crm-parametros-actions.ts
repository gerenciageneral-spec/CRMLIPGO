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
import {
  PARAMS_SECRETOS, VALOR_SECRETO_DE_FABRICA,
  type ParamKey, type CrmParametro,
} from "@/lib/crm-parametros"
import {
  leerParam, leerParamNumber, leerParamBool, leerParams, invalidarParametros,
} from "@/lib/crm-parametros-server"
import { exigirPermiso, exigirSesion, mensajeError } from "@/lib/crm-auth"
import { hoyISO } from "@/lib/crm-fechas"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// SECRETOS: estas funciones son invocables desde el navegador. Nunca devuelven
// el valor de un parametro secreto (las claves de autorizacion). El codigo del
// servidor que las necesita las lee con `leerParam` de crm-parametros-server.

/** Oculta el valor de un parametro secreto antes de devolverlo. */
function enmascarar(p: CrmParametro): CrmParametro {
  if (!PARAMS_SECRETOS.has(p.clave)) return p
  return {
    ...p,
    valor: "",
    secreto: { configurado: !!p.valor && p.valor !== VALOR_SECRETO_DE_FABRICA },
  }
}

/** Valor crudo (texto) de un parametro. */
export async function getParam(clave: ParamKey, empresaId = 1): Promise<string> {
  await exigirSesion()
  if (PARAMS_SECRETOS.has(clave)) return ""
  return leerParam(clave, empresaId)
}

/** Parametro numerico. `fallback` solo aplica si el valor no es un numero. */
export async function getParamNumber(clave: ParamKey, empresaId = 1, fallback?: number): Promise<number> {
  await exigirSesion()
  return leerParamNumber(clave, empresaId, fallback)
}

/** Parametro booleano. Solo "true" (sin distinguir mayusculas) es verdadero. */
export async function getParamBool(clave: ParamKey, empresaId = 1): Promise<boolean> {
  await exigirSesion()
  return leerParamBool(clave, empresaId)
}

/** Varios parametros en UNA sola lectura. Preferir esto en cualquier calculo
 *  que necesite mas de uno (el de un pedido usa IVA, tope de descuento y
 *  validacion de cupo a la vez). */
export async function getParams(claves: ParamKey[], empresaId = 1): Promise<Record<string, string>> {
  await exigirSesion()
  return leerParams(claves.filter((c) => !PARAMS_SECRETOS.has(c)), empresaId)
}

/** Todos los parametros con sus metadatos, para la pantalla de Parametrizacion. */
export async function listarParametros(empresaId = 1): Promise<ActionResult<CrmParametro[]>> {
  try {
    await exigirPermiso("listarParametros", "crm_parametros")
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_parametros")
      .select("*")
      .eq("idempresa", empresaId)
      .is("vigente_hasta", null)
      .order("grupo")
      .order("etiqueta")

    if (error) return { success: false, error: error.message }
    return { success: true, data: ((data ?? []) as CrmParametro[]).map(enmascarar) }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
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
  _usuario: string,
  empresaId = 1,
): Promise<ActionResult<CrmParametro>> {
  try {
    // Quien cambia sale de la sesion. El argumento se conserva por
    // compatibilidad con los llamados existentes y se ignora.
    const ctx = await exigirPermiso("setParam", "crm_parametros")
    const usuario = ctx.nombre
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
      return { success: true, data: enmascarar(actual as CrmParametro) } // nada que hacer
    }

    // Fecha de Bogota, no UTC: con toISOString(), un cambio hecho despues de
    // las 7 p. m. quedaba vigente desde el dia siguiente.
    const hoy = hoyISO()

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
      invalidarParametros(empresaId)
      return { success: true, data: enmascarar(data as CrmParametro) }
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

    invalidarParametros(empresaId)
    return { success: true, data: enmascarar(data as CrmParametro) }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}

/** Historial de un parametro, para responder "que IVA regia en marzo". */
export async function historialParametro(clave: ParamKey, empresaId = 1): Promise<ActionResult<CrmParametro[]>> {
  try {
    await exigirPermiso("historialParametro", "crm_parametros")
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_parametros")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("clave", clave)
      .order("vigente_desde", { ascending: false })

    if (error) return { success: false, error: error.message }
    return { success: true, data: ((data ?? []) as CrmParametro[]).map(enmascarar) }
  } catch (err) {
    return { success: false, error: mensajeError(err) }
  }
}

/** Vacia la cache. La usan las pruebas y el guardado de parametros. */
export async function invalidarCacheParametros(empresaId?: number): Promise<void> {
  await exigirSesion()
  invalidarParametros(empresaId)
}
