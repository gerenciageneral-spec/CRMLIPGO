"use server"

// Agenda: los compromisos futuros del equipo comercial.
//
// Separada de crm_actividades a proposito: una es FUTURO (se cumple, se
// reprograma o se cancela) y la otra PASADO (hecho consumado, no se edita).
// Mezclarlas obliga a filtrar por fecha en todas partes y deja sin forma de
// registrar que se agendo una visita y el cliente no asistio.

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { hoyISO, sumarDias } from "@/lib/crm-fechas"
import {
  exigirPermiso, asegurarClienteVisible, mensajeError,
  type ContextoCrm,
} from "@/lib/crm-auth"
import type { EstadoCita, Cita } from "@/lib/crm-agenda"
// Se reexportan para no romper a quien ya los importaba desde aqui.
export type { EstadoCita, Cita } from "@/lib/crm-agenda"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

function fallo(err: unknown): ActionResult<never> {
  const msg = mensajeError(err)
  console.error("[crm-agenda]", msg)
  return { success: false, error: msg }
}

// La agenda la usan el modulo propio y la ficha del prospecto (proximo
// contacto): cualquiera de los dos permisos basta.
const PERM_AGENDA = ["crm_agenda", "crm_prospectos"] as const

type FiltrosCitas = {
  desde?: string
  hasta?: string
  vendedorId?: number
  /** true = solo las del usuario en sesión. Para "Mi agenda". */
  soloMias?: boolean
  estado?: EstadoCita
}

/**
 * Alcance de la agenda para un vendedor: sus citas por vendedor_id Y las que
 * tiene asignadas como usuario.
 *
 * No basta `filtrarPorVendedor`: hay citas con vendedor_id vacio (las creadas
 * antes de que se asignara por defecto) cuyo dueno real es `usuario_asignado`.
 * Filtrar solo por vendedor se las esconderia a quien las tiene que cumplir.
 */
function alcanceCitas<Q extends { or: (filtro: string) => Q }>(q: Q, ctx: ContextoCrm): Q {
  if (ctx.alcance === "propios" && ctx.vendedorId != null) {
    return q.or(`vendedor_id.eq.${ctx.vendedorId},usuario_asignado.eq.${ctx.userId}`)
  }
  return q
}

/**
 * La cita, si existe y el usuario la puede ver; null si no.
 *
 * Toda escritura pasa por aqui: un vendedor no debe cumplir, reprogramar ni
 * cancelar la cita de otro adivinando su id.
 */
async function buscarCita(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  ctx: ContextoCrm,
  citaId: number,
  empresaId: number,
) {
  let q = supabase.from("crm_agenda").select("*").eq("id", citaId).eq("idempresa", empresaId)
  q = alcanceCitas(q, ctx)
  const { data } = await q.maybeSingle()
  return data
}

/**
 * Lectura de citas sin validar permiso. La validacion la hace quien la llama:
 * getAgendaDelDia la reutiliza, y si llamara a getCitas el permiso se
 * validaria (y se registraria en la bitacora) dos veces.
 */
async function leerCitas(
  ctx: ContextoCrm,
  empresaId: number,
  filtros?: FiltrosCitas,
): Promise<ActionResult<Cita[]>> {
  try {
    const supabase = await getSupabaseAdmin()
    let q = supabase.from("crm_agenda").select("*").eq("idempresa", empresaId)

    if (filtros?.desde) q = q.gte("fecha", filtros.desde)
    if (filtros?.hasta) q = q.lte("fecha", filtros.hasta)
    if (filtros?.vendedorId) q = q.eq("vendedor_id", filtros.vendedorId)
    if (filtros?.estado) q = q.eq("estado", filtros.estado)

    if (filtros?.soloMias) q = q.eq("usuario_asignado", ctx.userId)

    // El vendedor ve solo su agenda, pida el filtro que pida.
    q = alcanceCitas(q, ctx)

    const { data, error } = await q
      .order("fecha")
      .order("hora_inicio", { nullsFirst: false })
      .limit(500)

    if (error) return { success: false, error: error.message }

    const citas = (data ?? []) as Cita[]
    if (!citas.length) return { success: true, data: [] }

    // Nombres en dos consultas, no una por cita.
    const idsProspecto = [...new Set(citas.map((c) => c.prospecto_id).filter(Boolean))] as number[]
    const idsCliente = [...new Set(citas.map((c) => c.cliente_id).filter(Boolean))] as number[]

    const [prospRes, cliRes] = await Promise.all([
      idsProspecto.length
        ? supabase.from("crm_prospectos").select("id, razon_social").in("id", idsProspecto)
        : Promise.resolve({ data: [] as any[] }),
      idsCliente.length
        ? supabase.from("clientes").select("id, nombre").in("id", idsCliente)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const nombreProsp = new Map((prospRes.data ?? []).map((p: any) => [p.id, p.razon_social]))
    const nombreCli = new Map((cliRes.data ?? []).map((c: any) => [c.id, c.nombre]))

    return {
      success: true,
      data: citas.map((c) => ({
        ...c,
        prospecto_nombre: c.prospecto_id ? nombreProsp.get(c.prospecto_id) ?? null : null,
        cliente_nombre: c.cliente_id ? nombreCli.get(c.cliente_id) ?? null : null,
      })),
    }
  } catch (err) {
    return fallo(err)
  }
}

export async function getCitas(
  empresaId = 1,
  filtros?: FiltrosCitas,
): Promise<ActionResult<Cita[]>> {
  try {
    const ctx = await exigirPermiso("getCitas", ...PERM_AGENDA)
    return await leerCitas(ctx, empresaId, filtros)
  } catch (err) {
    return fallo(err)
  }
}

export async function crearCita(
  cita: {
    titulo: string
    descripcion?: string
    tipo?: string
    fecha: string
    hora_inicio?: string | null
    hora_fin?: string | null
    prospecto_id?: number | null
    cliente_id?: number | null
    vendedor_id?: number | null
    direccion?: string | null
    recordatorio_dias?: number
  },
  // Se ignora: quien crea sale de la sesion, no de lo que mande el navegador.
  _usuario: string,
  empresaId = 1,
): Promise<ActionResult<Cita>> {
  try {
    const ctx = await exigirPermiso("crearCita", ...PERM_AGENDA)
    if (!cita.titulo?.trim()) return { success: false, error: "La cita necesita un título" }
    if (!cita.fecha) return { success: false, error: "Falta la fecha" }
    if (cita.cliente_id) await asegurarClienteVisible(ctx, cita.cliente_id)

    const supabase = await getSupabaseAdmin()

    const { data, error } = await supabase
      .from("crm_agenda")
      .insert({
        idempresa: empresaId,
        titulo: cita.titulo.trim(),
        descripcion: cita.descripcion?.trim() || null,
        tipo: cita.tipo ?? "visita",
        fecha: cita.fecha,
        hora_inicio: cita.hora_inicio || null,
        hora_fin: cita.hora_fin || null,
        prospecto_id: cita.prospecto_id ?? null,
        cliente_id: cita.cliente_id ?? null,
        // Sin vendedor explicito, la cita es del vendedor que la crea: si no,
        // quedaria fuera de su propia agenda.
        vendedor_id: cita.vendedor_id ?? ctx.vendedorId,
        // Se asigna a quien la crea: es el caso normal, y si hay que
        // reasignarla se hace después.
        usuario_asignado: ctx.userId,
        direccion: cita.direccion?.trim() || null,
        recordatorio_dias: cita.recordatorio_dias ?? 1,
        creado_por: ctx.nombre,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as Cita }
  } catch (err) {
    return fallo(err)
  }
}

/**
 * Marca una cita como cumplida y deja la evidencia en la bitacora.
 *
 * El compromiso queda amarrado a la actividad que lo documenta: sin eso,
 * "cumplida" seria solo una afirmacion.
 */
export async function cumplirCita(
  citaId: number,
  detalle: { resultado?: string; notas?: string; latitud?: number; longitud?: number; precision_m?: number },
  // Se ignora: la bitacora firma con el usuario de la sesion.
  _usuario: string,
  empresaId = 1,
): Promise<ActionResult<Cita>> {
  try {
    const ctx = await exigirPermiso("cumplirCita", ...PERM_AGENDA)
    const supabase = await getSupabaseAdmin()

    const cita = await buscarCita(supabase, ctx, citaId, empresaId)

    if (!cita) return { success: false, error: "La cita no existe" }

    const { data: actividad } = await supabase
      .from("crm_actividades")
      .insert({
        idempresa: empresaId,
        prospecto_id: cita.prospecto_id,
        cliente_id: cita.cliente_id,
        tipo: cita.tipo === "cobro" ? "llamada" : cita.tipo,
        asunto: cita.titulo,
        detalle: detalle.notas ?? cita.descripcion ?? null,
        resultado: detalle.resultado ?? "exitoso",
        fecha_hora: new Date().toISOString(),
        latitud: detalle.latitud ?? null,
        longitud: detalle.longitud ?? null,
        gps_precision_m: detalle.precision_m ?? null,
        vendedor_id: cita.vendedor_id,
        usuario: ctx.nombre,
      })
      .select()
      .single()

    const { data, error } = await supabase
      .from("crm_agenda")
      .update({ estado: "cumplida", actividad_id: actividad?.id ?? null })
      .eq("id", citaId)
      .eq("idempresa", empresaId)
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    // Si era de un prospecto, se limpia su próximo contacto: ya se atendió.
    if (cita.prospecto_id) {
      await supabase
        .from("crm_prospectos")
        .update({ proxima_fecha: null, proxima_accion: null, proxima_hora: null })
        .eq("id", cita.prospecto_id)
    }

    return { success: true, data: data as Cita }
  } catch (err) {
    return fallo(err)
  }
}

/**
 * Reprograma: cierra la cita actual y abre una nueva en la fecha nueva.
 *
 * No se mueve la fecha de la misma fila a proposito. Que una visita se haya
 * aplazado tres veces es informacion comercial valiosa, y editando la fecha se
 * perderia sin dejar rastro.
 */
export async function reprogramarCita(
  citaId: number,
  nuevaFecha: string,
  motivo: string,
  // Se ignora: quien reprograma sale de la sesion.
  _usuario: string,
  empresaId = 1,
): Promise<ActionResult<Cita>> {
  try {
    const ctx = await exigirPermiso("reprogramarCita", ...PERM_AGENDA)
    const supabase = await getSupabaseAdmin()

    const original = await buscarCita(supabase, ctx, citaId, empresaId)

    if (!original) return { success: false, error: "La cita no existe" }

    await supabase
      .from("crm_agenda")
      .update({
        estado: "reprogramada",
        descripcion: [original.descripcion, `Reprogramada: ${motivo}`].filter(Boolean).join(" · "),
      })
      .eq("id", citaId)

    const { id, creado_en, actividad_id, ...resto } = original as any
    const { data, error } = await supabase
      .from("crm_agenda")
      .insert({
        ...resto,
        fecha: nuevaFecha,
        estado: "pendiente",
        actividad_id: null,
        creado_por: ctx.nombre,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as Cita }
  } catch (err) {
    return fallo(err)
  }
}

export async function cancelarCita(
  citaId: number,
  motivo: string,
  empresaId = 1,
): Promise<ActionResult<null>> {
  try {
    const ctx = await exigirPermiso("cancelarCita", ...PERM_AGENDA)
    const supabase = await getSupabaseAdmin()
    if (!(await buscarCita(supabase, ctx, citaId, empresaId))) {
      return { success: false, error: "La cita no existe" }
    }
    const { error } = await supabase
      .from("crm_agenda")
      .update({ estado: "cancelada", descripcion: motivo })
      .eq("id", citaId)
      .eq("idempresa", empresaId)

    if (error) return { success: false, error: error.message }
    return { success: true, data: null }
  } catch (err) {
    return fallo(err)
  }
}

/**
 * Lo del día y lo vencido, para el tablero y la alerta.
 *
 * Las vencidas van PRIMERO: una visita que debía hacerse ayer y sigue
 * pendiente es más urgente que la de hoy.
 */
export async function getAgendaDelDia(
  empresaId = 1,
  soloMias = true,
): Promise<ActionResult<{ vencidas: Cita[]; hoy: Cita[]; manana: Cita[]; proximas: Cita[] }>> {
  try {
    const ctx = await exigirPermiso("getAgendaDelDia", ...PERM_AGENDA)
    const hoy = hoyISO()
    const manana = sumarDias(hoy, 1)

    const res = await leerCitas(ctx, empresaId, {
      hasta: sumarDias(hoy, 7),
      estado: "pendiente",
      soloMias,
    })

    if (!res.success) return { success: false, error: res.error }

    const citas = res.data ?? []
    return {
      success: true,
      data: {
        vencidas: citas.filter((c) => c.fecha < hoy),
        hoy: citas.filter((c) => c.fecha === hoy),
        manana: citas.filter((c) => c.fecha === manana),
        proximas: citas.filter((c) => c.fecha > manana),
      },
    }
  } catch (err) {
    return fallo(err)
  }
}
