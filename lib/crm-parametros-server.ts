// Lectura INTERNA de parametros, solo para codigo del servidor.
//
// POR QUE SE SEPARO DE crm-parametros-actions.ts: aquel archivo es "use
// server", y en Next.js toda funcion exportada de un archivo asi es invocable
// desde el navegador. `getParam` aceptaba cualquier clave, incluidas las claves
// de autorizacion de pedidos: cualquiera con sesion podia leerlas llamando la
// accion. Aqui, sin la directiva, estas funciones solo existen en el servidor.
// Las acciones publicas se apoyan en esta y se niegan a devolver secretos.
//
// CACHE: por empresa con TTL corto. Sin cache, calcular el total de un pedido
// de 20 lineas dispararia 20 consultas por el mismo IVA. Con 60 s, un cambio
// se propaga a todas las instancias en menos de un minuto. En Vercel cada
// lambda tiene su copia; por eso TTL y no invalidacion global, que no habria
// forma de coordinar entre instancias.

import { getSupabaseAdminAsSystem } from "@/lib/supabase-admin"
import { PARAM_FALLBACK, type ParamKey } from "@/lib/crm-parametros"

const TTL_MS = 60_000

type Entrada = { valores: Map<string, string>; expira: number }
const cache = new Map<number, Entrada>()

async function cargar(empresaId: number): Promise<Map<string, string>> {
  const ahora = Date.now()
  const vigente = cache.get(empresaId)
  if (vigente && vigente.expira > ahora) return vigente.valores

  try {
    const supabase = await getSupabaseAdminAsSystem()
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
    // Lo cacheado aunque este vencido: un parametro algo viejo es mejor que
    // tumbar la pantalla. Si no hay nada, manda el fallback.
    console.error("[crm-parametros] no se pudo leer la tabla:", err)
    return vigente?.valores ?? new Map()
  }
}

/** Valor crudo (texto). INCLUYE secretos: no exponer al navegador. */
export async function leerParam(clave: ParamKey, empresaId = 1): Promise<string> {
  const valores = await cargar(empresaId)
  return valores.get(clave) ?? PARAM_FALLBACK[clave] ?? ""
}

export async function leerParamNumber(clave: ParamKey, empresaId = 1, fallback?: number): Promise<number> {
  const n = Number(await leerParam(clave, empresaId))
  if (Number.isFinite(n)) return n
  if (typeof fallback === "number") return fallback
  const porDefecto = Number(PARAM_FALLBACK[clave])
  return Number.isFinite(porDefecto) ? porDefecto : 0
}

/** Solo "true" (sin distinguir mayusculas) es verdadero. */
export async function leerParamBool(clave: ParamKey, empresaId = 1): Promise<boolean> {
  return String(await leerParam(clave, empresaId)).trim().toLowerCase() === "true"
}

/** Varios parametros en una sola lectura. */
export async function leerParams(claves: ParamKey[], empresaId = 1): Promise<Record<string, string>> {
  const valores = await cargar(empresaId)
  const salida: Record<string, string> = {}
  for (const clave of claves) salida[clave] = valores.get(clave) ?? PARAM_FALLBACK[clave] ?? ""
  return salida
}

export function invalidarParametros(empresaId?: number): void {
  if (empresaId == null) cache.clear()
  else cache.delete(empresaId)
}
