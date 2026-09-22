"use server"

// Pedidos: doble autorizacion y proyeccion al sistema operativo.
//
// ESTE ARCHIVO GOBIERNA EL PUNTO MAS DELICADO DEL CRM. Un pedido autorizado se
// escribe en pedidoscabecera, que es produccion de LIPgo. Todo lo que hay aqui
// esta pensado para que eso no pueda ocurrir por accidente.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentUser, getUserProfile } from "@/lib/auth-actions"
import { getUserPermissions } from "@/lib/permissions-actions"
import { getParam, getParamBool } from "@/lib/crm-parametros-actions"
import { PARAM } from "@/lib/crm-parametros"
import { hoyISO, sumarDias } from "@/lib/crm-fechas"
import {
  puedeFirmar, PERMISO_POR_ROL, ROL_LABEL,
  type Pedido, type PedidoConDetalle, type LineaPedido,
  type EstadoPedido, type RolAutorizacion, type EventoAutorizacion,
} from "@/lib/crm-pedidos"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

function fallo(err: unknown): ActionResult<never> {
  const msg = err instanceof Error ? err.message : "Error desconocido"
  console.error("[crm-pedidos]", msg)
  return { success: false, error: msg }
}

// ------------------------------------------------------------- Consultas

export async function getPedidos(
  empresaId = 1,
  filtros?: { estado?: EstadoPedido; clienteId?: number; soloPendientes?: boolean },
): Promise<ActionResult<PedidoConDetalle[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    let q = supabase.from("crm_pedidos").select("*").eq("idempresa", empresaId)

    if (filtros?.estado) q = q.eq("estado", filtros.estado)
    if (filtros?.clienteId) q = q.eq("cliente_id", filtros.clienteId)
    if (filtros?.soloPendientes) {
      q = q.in("estado", ["pendiente_autorizacion", "autorizado_parcial"])
    }

    const { data, error } = await q.order("creado_en", { ascending: false }).limit(300)
    if (error) return { success: false, error: error.message }

    const pedidos = (data ?? []) as Pedido[]
    if (!pedidos.length) return { success: true, data: [] }

    const ids = [...new Set(pedidos.map((p) => p.cliente_id))]
    const { data: clientes } = await supabase.from("clientes").select("id, nombre").in("id", ids)
    const nombre = new Map((clientes ?? []).map((c: any) => [c.id, c.nombre]))

    return {
      success: true,
      data: pedidos.map((p) => ({ ...p, cliente_nombre: nombre.get(p.cliente_id) ?? null })),
    }
  } catch (err) {
    return fallo(err)
  }
}

export async function getPedido(id: number, empresaId = 1): Promise<ActionResult<PedidoConDetalle>> {
  try {
    const supabase = await getSupabaseAdmin()

    const [cabRes, detRes] = await Promise.all([
      supabase.from("crm_pedidos").select("*").eq("id", id).eq("idempresa", empresaId).maybeSingle(),
      supabase.from("crm_pedido_detalle").select("*").eq("pedido_id", id).order("linea"),
    ])

    if (cabRes.error) return { success: false, error: cabRes.error.message }
    if (!cabRes.data) return { success: false, error: "El pedido no existe" }

    const pedido = cabRes.data as PedidoConDetalle
    pedido.lineas = (detRes.data ?? []) as LineaPedido[]

    const { data: cliente } = await supabase
      .from("clientes").select("nombre").eq("id", pedido.cliente_id).maybeSingle()
    pedido.cliente_nombre = cliente?.nombre ?? null

    return { success: true, data: pedido }
  } catch (err) {
    return fallo(err)
  }
}

export async function getHistorialAutorizaciones(
  pedidoId: number,
): Promise<ActionResult<EventoAutorizacion[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("crm_autorizaciones_log")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("creado_en", { ascending: false })

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as EventoAutorizacion[] }
  } catch (err) {
    return fallo(err)
  }
}

// -------------------------------------------------------- Autorizaciones

/**
 * Da una de las dos firmas del pedido.
 *
 * TRES CONTROLES, en este orden:
 *
 *   1. PERMISO del usuario (crm_autorizar_contabilidad o _gerencia). Se lee de
 *      la sesion del servidor, no de lo que mande el navegador.
 *   2. CLAVE del rol. Es compartida, como pidio el negocio, y sale de un
 *      parametro en vez de estar escrita en el codigo como hacia LIPgo con
 *      "LIP123456". Que sea compartida es justo por lo que hace falta el
 *      control 1: la clave dice "alguien de gerencia", el permiso y la sesion
 *      dicen QUIEN.
 *   3. SEPARACION DE FUNCIONES: la misma persona no puede dar las dos firmas
 *      ni autorizar un pedido que creo.
 *
 * El UPDATE es condicional (... is null) para que dos peticiones simultaneas
 * no produzcan dos firmas, y TODO intento queda en la bitacora, incluidos los
 * fallidos por clave errada.
 */
export async function autorizarPedido(
  pedidoId: number,
  rol: RolAutorizacion,
  clave: string,
  nota?: string,
  empresaId = 1,
): Promise<ActionResult<Pedido>> {
  try {
    const supabase = await getSupabaseAdmin()

    // --- Identidad -------------------------------------------------------
    const user = await getCurrentUser()
    if (!user) return { success: false, error: "Sesión no válida" }

    const perfil = await getUserProfile(user.id)
    const nombreUsuario = perfil?.usuario ?? user.email ?? "desconocido"

    // --- Control 1: permiso ---------------------------------------------
    const permisos = await getUserPermissions(user.id)
    if (!permisos || permisos[PERMISO_POR_ROL[rol]] !== true) {
      return { success: false, error: `No tienes permiso para autorizar como ${ROL_LABEL[rol]}` }
    }

    // --- Pedido ----------------------------------------------------------
    const pedRes = await getPedido(pedidoId, empresaId)
    if (!pedRes.success || !pedRes.data) {
      return { success: false, error: pedRes.error ?? "El pedido no existe" }
    }
    const pedido = pedRes.data

    // --- Control 3: separación de funciones ------------------------------
    const chequeo = puedeFirmar(pedido, rol, user.id, nombreUsuario)
    if (!chequeo.puede) return { success: false, error: chequeo.motivo }

    // --- Control 2: clave del rol ----------------------------------------
    const claveEsperada = await getParam(
      rol === "contabilidad" ? PARAM.CLAVE_CONTABILIDAD : PARAM.CLAVE_GERENCIA,
      empresaId,
    )

    if (!claveEsperada) {
      return {
        success: false,
        error: `No hay clave configurada para ${ROL_LABEL[rol]}. Defínela en Parametrización.`,
      }
    }

    if (clave !== claveEsperada) {
      // El intento fallido queda registrado: si alguien está probando claves,
      // debe verse en la bitácora.
      await supabase.from("crm_autorizaciones_log").insert({
        idempresa: empresaId,
        pedido_id: pedidoId,
        rol,
        accion: "intento_fallido",
        usuario_id: user.id,
        usuario_nombre: nombreUsuario,
        total_al_momento: pedido.total,
      })
      return { success: false, error: "Clave incorrecta" }
    }

    // --- Firma -----------------------------------------------------------
    const ahora = new Date().toISOString()
    const campos =
      rol === "contabilidad"
        ? {
            auth_contabilidad_por: user.id,
            auth_contabilidad_nombre: nombreUsuario,
            auth_contabilidad_en: ahora,
            auth_contabilidad_nota: nota ?? null,
          }
        : {
            auth_gerencia_por: user.id,
            auth_gerencia_nombre: nombreUsuario,
            auth_gerencia_en: ahora,
            auth_gerencia_nota: nota ?? null,
          }

    const columnaFirma = rol === "contabilidad" ? "auth_contabilidad_en" : "auth_gerencia_en"

    // Condicional: si otra petición firmó entre la lectura y este update,
    // esta afecta cero filas y no duplica la firma.
    const { data, error } = await supabase
      .from("crm_pedidos")
      .update(campos)
      .eq("id", pedidoId)
      .eq("idempresa", empresaId)
      .is(columnaFirma, null)
      .select()
      .single()

    if (error || !data) {
      return { success: false, error: "Otra persona autorizó este pedido al mismo tiempo. Recarga la pantalla." }
    }

    // --- Estado resultante -----------------------------------------------
    const actualizado = data as Pedido
    const completo = Boolean(actualizado.auth_contabilidad_en && actualizado.auth_gerencia_en)
    const nuevoEstado: EstadoPedido = completo ? "autorizado" : "autorizado_parcial"

    await supabase.from("crm_pedidos").update({ estado: nuevoEstado }).eq("id", pedidoId)

    await supabase.from("crm_autorizaciones_log").insert({
      idempresa: empresaId,
      pedido_id: pedidoId,
      rol,
      accion: "autorizar",
      usuario_id: user.id,
      usuario_nombre: nombreUsuario,
      nota: nota ?? null,
      total_al_momento: pedido.total,
    })

    return { success: true, data: { ...actualizado, estado: nuevoEstado } }
  } catch (err) {
    return fallo(err)
  }
}

export async function rechazarPedido(
  pedidoId: number,
  rol: RolAutorizacion,
  motivo: string,
  empresaId = 1,
): Promise<ActionResult<Pedido>> {
  try {
    if (!motivo?.trim()) {
      return { success: false, error: "Escribe el motivo del rechazo" }
    }

    const supabase = await getSupabaseAdmin()

    const user = await getCurrentUser()
    if (!user) return { success: false, error: "Sesión no válida" }

    const perfil = await getUserProfile(user.id)
    const nombreUsuario = perfil?.usuario ?? user.email ?? "desconocido"

    const permisos = await getUserPermissions(user.id)
    if (!permisos || permisos[PERMISO_POR_ROL[rol]] !== true) {
      return { success: false, error: `No tienes permiso para rechazar como ${ROL_LABEL[rol]}` }
    }

    const pedRes = await getPedido(pedidoId, empresaId)
    if (!pedRes.success || !pedRes.data) return { success: false, error: "El pedido no existe" }

    if (pedRes.data.idpedido_lipgo) {
      return { success: false, error: "El pedido ya viajó a operación; hay que anularlo allí" }
    }

    // Rechazar NO requiere clave: frenar algo dudoso debe ser más fácil que
    // aprobarlo, no igual de difícil.
    const { data, error } = await supabase
      .from("crm_pedidos")
      .update({
        estado: "rechazado",
        rechazado_por: user.id,
        rechazado_nombre: nombreUsuario,
        rechazado_en: new Date().toISOString(),
        motivo_rechazo: motivo.trim(),
      })
      .eq("id", pedidoId)
      .eq("idempresa", empresaId)
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    await supabase.from("crm_autorizaciones_log").insert({
      idempresa: empresaId,
      pedido_id: pedidoId,
      rol,
      accion: "rechazar",
      usuario_id: user.id,
      usuario_nombre: nombreUsuario,
      nota: motivo.trim(),
      total_al_momento: pedRes.data.total,
    })

    return { success: true, data: data as Pedido }
  } catch (err) {
    return fallo(err)
  }
}

// ----------------------------------------------------- Puente a operación

/**
 * Proyecta el pedido a pedidoscabecera/pedidosdetalle de LIPgo.
 *
 * Delega en la funcion crm_proyectar_pedido_lipgo de la base, que hace
 * cabecera, detalle y cierre del puente EN UNA SOLA TRANSACCION y valida antes
 * que cada nombre de producto exista en el catalogo.
 *
 * POR QUE NO SE HACE DESDE AQUI: Supabase no da transacciones multi-tabla
 * desde JS. Insertando por separado, un fallo a mitad dejaria una cabecera sin
 * lineas en la tabla de produccion de LIPgo: un pedido fantasma que aparece en
 * sus tableros y que nadie sabe de donde salio.
 */
export async function enviarPedidoALipgo(
  pedidoId: number,
  empresaId = 1,
): Promise<ActionResult<{ idpedido: number; lineas: number; mensaje: string }>> {
  try {
    const supabase = await getSupabaseAdmin()

    const user = await getCurrentUser()
    if (!user) return { success: false, error: "Sesión no válida" }

    // Se comprueba aquí ADEMÁS de en la función: el error en la interfaz es
    // más claro que el de la base, y así se evita el viaje de ida y vuelta.
    const pedRes = await getPedido(pedidoId, empresaId)
    if (!pedRes.success || !pedRes.data) return { success: false, error: "El pedido no existe" }

    const pedido = pedRes.data

    if (pedido.idpedido_lipgo) {
      return { success: false, error: `Ya viajó a operación como pedido ${pedido.idpedido_lipgo}` }
    }
    if (pedido.estado !== "autorizado") {
      return {
        success: false,
        error: "Solo viaja un pedido con las dos autorizaciones completas",
      }
    }

    const exigeDoble = await getParamBool(PARAM.PEDIDO_DOBLE_AUTORIZACION, empresaId)
    if (exigeDoble && (!pedido.auth_contabilidad_en || !pedido.auth_gerencia_en)) {
      return { success: false, error: "Faltan autorizaciones" }
    }

    const { data, error } = await supabase.rpc("crm_proyectar_pedido_lipgo", {
      p_pedido_id: pedidoId,
      p_usuario_id: user.id,
    })

    if (error) return { success: false, error: error.message }

    const r = data as {
      ok: boolean
      error?: string
      idpedido?: number
      lineas?: number
      mensaje?: string
      productos_faltantes?: string[]
    }

    if (!r?.ok) {
      // El caso más frecuente: un producto cuyo nombre no existe en el
      // catálogo de LIPgo. Se nombra cuál, porque el mensaje genérico obligaría
      // a revisar el pedido línea por línea.
      const faltantes = r?.productos_faltantes?.length
        ? ` (${r.productos_faltantes.join(", ")})`
        : ""
      return { success: false, error: `${r?.error ?? "No se pudo enviar"}${faltantes}` }
    }

    // Si es a crédito, nace la cuenta por cobrar.
    if (pedido.forma_pago === "credito") {
      await crearCuentaPorCobrar(pedido, r.idpedido!, empresaId)
    }

    return {
      success: true,
      data: { idpedido: r.idpedido!, lineas: r.lineas ?? 0, mensaje: r.mensaje ?? "" },
    }
  } catch (err) {
    return fallo(err)
  }
}

/** Cartera del pedido a crédito. Nace al proyectar, no al facturar: es el
 *  momento en que el compromiso se vuelve real. */
async function crearCuentaPorCobrar(
  pedido: Pedido,
  idpedidoLipgo: number,
  empresaId: number,
): Promise<void> {
  try {
    const supabase = await getSupabaseAdmin()
    const fecha = hoyISO()

    await supabase.from("crm_cuentas_cobrar").insert({
      idempresa: empresaId,
      cliente_id: pedido.cliente_id,
      pedido_id: pedido.id,
      idpedido_lipgo: idpedidoLipgo,
      fecha_factura: fecha,
      fecha_vencimiento: sumarDias(fecha, pedido.dias_credito || 0),
      valor_original: pedido.total,
      vendedor_id: pedido.vendedor_id,
      creado_por: pedido.creado_por,
    })
  } catch (err) {
    // No se revierte la proyección por esto: el pedido ya está en operación y
    // deshacerlo sería peor. Se registra para poder crear la cartera a mano.
    console.error("[crm-pedidos] el pedido viajó pero no se creó su cartera:", err)
  }
}

/** Pedidos esperando la firma del usuario actual. Alimenta la bandeja y la
 *  alerta de la campana. */
export async function getPedidosPendientesDeMiFirma(
  empresaId = 1,
): Promise<ActionResult<{ pedidos: PedidoConDetalle[]; roles: RolAutorizacion[] }>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: "Sesión no válida" }

    const permisos = await getUserPermissions(user.id)
    const roles: RolAutorizacion[] = []
    if (permisos?.crm_autorizar_contabilidad) roles.push("contabilidad")
    if (permisos?.crm_autorizar_gerencia) roles.push("gerencia")

    if (!roles.length) return { success: true, data: { pedidos: [], roles: [] } }

    const res = await getPedidos(empresaId, { soloPendientes: true })
    if (!res.success) return { success: false, error: res.error }

    const perfil = await getUserProfile(user.id)
    const nombreUsuario = perfil?.usuario ?? ""

    // Solo los que este usuario puede firmar de verdad: si ya dio la otra
    // firma o creó el pedido, no le sirve verlo en su bandeja.
    const pendientes = (res.data ?? []).filter((p) =>
      roles.some((rol) => puedeFirmar(p, rol, user.id, nombreUsuario).puede),
    )

    return { success: true, data: { pedidos: pendientes, roles } }
  } catch (err) {
    return fallo(err)
  }
}
