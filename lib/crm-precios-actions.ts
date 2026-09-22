"use server"

// Listas de precios: creacion, detalle y asignacion a clientes.
//
// TOCA DINERO: lo que salga de aqui es lo que se le cobra al cliente.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { hoyISO } from "@/lib/crm-fechas"
import type { TipoLista, ListaPrecios, LineaLista } from "@/lib/crm-precios"
export type { TipoLista, ListaPrecios, LineaLista } from "@/lib/crm-precios"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

function fallo(err: unknown): ActionResult<never> {
  const msg = err instanceof Error ? err.message : "Error desconocido"
  console.error("[crm-precios]", msg)
  return { success: false, error: msg }
}

// ---------------------------------------------------------------- Listas

export async function getListas(empresaId = 1): Promise<ActionResult<ListaPrecios[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_listas_precios")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("activo", true)
      .order("es_default", { ascending: false })
      .order("nombre")

    if (error) return { success: false, error: error.message }

    const listas = (data ?? []) as ListaPrecios[]
    if (!listas.length) return { success: true, data: [] }

    // Cuántos productos tiene cada lista y cuántos clientes la usan. Se
    // cuentan de una vez, no una consulta por lista.
    const ids = listas.map((l) => l.id)
    const [detalleRes, clientesRes] = await Promise.all([
      supabase.from("crm_lista_precio_detalle").select("lista_id").in("lista_id", ids),
      supabase.from("clientes").select("lista_precio_id").in("lista_precio_id", ids),
    ])

    const productos = new Map<number, number>()
    for (const d of detalleRes.data ?? []) {
      productos.set(d.lista_id, (productos.get(d.lista_id) ?? 0) + 1)
    }

    const clientes = new Map<number, number>()
    for (const c of clientesRes.data ?? []) {
      if (c.lista_precio_id) clientes.set(c.lista_precio_id, (clientes.get(c.lista_precio_id) ?? 0) + 1)
    }

    return {
      success: true,
      data: listas.map((l) => ({
        ...l,
        productos_con_precio: productos.get(l.id) ?? 0,
        clientes_asignados: clientes.get(l.id) ?? 0,
      })),
    }
  } catch (err) {
    return fallo(err)
  }
}

export async function crearLista(
  entrada: {
    nombre: string
    descripcion?: string
    tipo: TipoLista
    descuento_global?: number
    vigente_hasta?: string | null
  },
  usuario: string,
  empresaId = 1,
): Promise<ActionResult<ListaPrecios>> {
  try {
    if (!entrada.nombre?.trim()) return { success: false, error: "La lista necesita un nombre" }

    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_listas_precios")
      .insert({
        idempresa: empresaId,
        nombre: entrada.nombre.trim(),
        descripcion: entrada.descripcion?.trim() || null,
        tipo: entrada.tipo,
        descuento_global: entrada.descuento_global ?? 0,
        vigente_desde: hoyISO(),
        vigente_hasta: entrada.vigente_hasta ?? null,
        creado_por: usuario,
      })
      .select()
      .single()

    if (error) {
      // El UNIQUE (idempresa, nombre) es el caso frecuente: dos listas con el
      // mismo nombre confundirían a quien las asigna.
      if (error.code === "23505") {
        return { success: false, error: `Ya existe una lista llamada "${entrada.nombre}"` }
      }
      return { success: false, error: error.message }
    }

    return { success: true, data: data as ListaPrecios }
  } catch (err) {
    return fallo(err)
  }
}

export async function actualizarLista(
  id: number,
  cambios: Partial<Pick<ListaPrecios, "nombre" | "descripcion" | "tipo" | "descuento_global" | "vigente_hasta" | "activo">>,
  empresaId = 1,
): Promise<ActionResult<ListaPrecios>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_listas_precios")
      .update(cambios)
      .eq("id", id)
      .eq("idempresa", empresaId)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as ListaPrecios }
  } catch (err) {
    return fallo(err)
  }
}

// ---------------------------------------------------------------- Detalle

export async function getDetalleLista(listaId: number): Promise<ActionResult<LineaLista[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_lista_precio_detalle")
      .select("*")
      .eq("lista_id", listaId)
      .order("producto_nombre")

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as LineaLista[] }
  } catch (err) {
    return fallo(err)
  }
}

/**
 * Fija el precio de un producto dentro de una lista.
 *
 * Se pasa precio manual O porcentaje, nunca los dos: lo impide un CHECK en la
 * base. Si se permitieran ambos habria que decidir en el codigo cual gana, y
 * esa decision implicita es una fuente garantizada de precios equivocados que
 * solo se descubren cuando el cliente reclama la factura.
 */
export async function fijarPrecioProducto(
  entrada: {
    lista_id: number
    producto_id: number
    producto_nombre: string
    precio_manual?: number | null
    descuento_pct?: number | null
    precio_minimo?: number | null
  },
  empresaId = 1,
): Promise<ActionResult<LineaLista>> {
  try {
    const tieneManual = entrada.precio_manual != null && entrada.precio_manual >= 0
    const tienePct = entrada.descuento_pct != null && entrada.descuento_pct >= 0

    if (tieneManual && tienePct) {
      return { success: false, error: "Define un precio fijo o un porcentaje, no los dos" }
    }
    if (!tieneManual && !tienePct) {
      return { success: false, error: "Define un precio fijo o un porcentaje de descuento" }
    }

    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_lista_precio_detalle")
      .upsert(
        {
          idempresa: empresaId,
          lista_id: entrada.lista_id,
          producto_id: entrada.producto_id,
          producto_nombre: entrada.producto_nombre,
          precio_manual: tieneManual ? entrada.precio_manual : null,
          descuento_pct: tienePct ? entrada.descuento_pct : null,
          precio_minimo: entrada.precio_minimo ?? null,
        },
        { onConflict: "lista_id,producto_id" },
      )
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as LineaLista }
  } catch (err) {
    return fallo(err)
  }
}

export async function quitarPrecioProducto(
  listaId: number,
  productoId: number,
): Promise<ActionResult<null>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { error } = await supabase
      .from("crm_lista_precio_detalle")
      .delete()
      .eq("lista_id", listaId)
      .eq("producto_id", productoId)

    if (error) return { success: false, error: error.message }
    return { success: true, data: null }
  } catch (err) {
    return fallo(err)
  }
}

/**
 * Aplica un mismo porcentaje a varios productos de una vez.
 *
 * Es la operacion que de verdad se usa: armar una lista producto por producto
 * con un catalogo de cientos no es realista.
 */
export async function aplicarDescuentoMasivo(
  listaId: number,
  productos: { id: number; nombre: string }[],
  descuentoPct: number,
  empresaId = 1,
): Promise<ActionResult<number>> {
  try {
    if (descuentoPct < 0 || descuentoPct > 100) {
      return { success: false, error: "El descuento debe estar entre 0 y 100" }
    }
    if (!productos.length) return { success: false, error: "No hay productos seleccionados" }

    const supabase = await getSupabaseAdmin()
    const filas = productos.map((p) => ({
      idempresa: empresaId,
      lista_id: listaId,
      producto_id: p.id,
      producto_nombre: p.nombre,
      precio_manual: null,
      descuento_pct: descuentoPct,
      precio_minimo: null,
    }))

    const { error } = await supabase
      .from("crm_lista_precio_detalle")
      .upsert(filas, { onConflict: "lista_id,producto_id" })

    if (error) return { success: false, error: error.message }
    return { success: true, data: filas.length }
  } catch (err) {
    return fallo(err)
  }
}

// ------------------------------------------------------------ Asignacion

export async function asignarListaACliente(
  clienteId: number,
  listaId: number | null,
  empresaId = 1,
): Promise<ActionResult<null>> {
  try {
    const supabase = await getSupabaseAdmin()

    // `clientes` usa id_empresa, con guion bajo: es tabla heredada de LIPgo.
    const { error } = await supabase
      .from("clientes")
      .update({ lista_precio_id: listaId })
      .eq("id", clienteId)
      .eq("id_empresa", empresaId)

    if (error) return { success: false, error: error.message }
    return { success: true, data: null }
  } catch (err) {
    return fallo(err)
  }
}

/** Asigna una lista a varios clientes de una vez. */
export async function asignarListaMasiva(
  clienteIds: number[],
  listaId: number | null,
  empresaId = 1,
): Promise<ActionResult<number>> {
  try {
    if (!clienteIds.length) return { success: false, error: "No hay clientes seleccionados" }

    const supabase = await getSupabaseAdmin()
    const { error } = await supabase
      .from("clientes")
      .update({ lista_precio_id: listaId })
      .in("id", clienteIds)
      .eq("id_empresa", empresaId)

    if (error) return { success: false, error: error.message }
    return { success: true, data: clienteIds.length }
  } catch (err) {
    return fallo(err)
  }
}

/**
 * Como quedaria el precio de cada producto con una lista.
 *
 * Llama a la funcion de la base para cada producto, que es la MISMA que usan
 * cotizaciones y pedidos. Asi la vista previa no puede mostrar un numero y el
 * documento otro.
 */
export async function previsualizarLista(
  listaId: number,
  empresaId = 1,
): Promise<ActionResult<{ producto_id: number; nombre: string; base: number; final: number; ahorro: number }[]>> {
  try {
    const supabase = await getSupabaseAdmin()

    const { data: productos, error } = await supabase
      .from("productos")
      .select("id, nombre, precio_base")
      .eq("id_empresa", empresaId)
      .not("precio_base", "is", null)
      .order("nombre")
      .limit(200)

    if (error) return { success: false, error: error.message }

    const filas = await Promise.all(
      (productos ?? []).map(async (p: any) => {
        const { data: precio } = await supabase.rpc("crm_resolver_precio", {
          p_idempresa: empresaId,
          p_producto_id: p.id,
          p_lista_id: listaId,
        })
        const base = Number(p.precio_base) || 0
        const final = Number(precio) || 0
        return {
          producto_id: p.id,
          nombre: p.nombre,
          base,
          final,
          ahorro: base > 0 ? Math.round(((base - final) / base) * 1000) / 10 : 0,
        }
      }),
    )

    return { success: true, data: filas }
  } catch (err) {
    return fallo(err)
  }
}
