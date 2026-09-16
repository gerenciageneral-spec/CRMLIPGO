"use server"

/**
 * Server actions de "Asignación de apoyo en cargue" (Compensación).
 *
 * Picking/Packing solo permiten asignar personal de los puestos operativos de
 * cargue (`PUESTOS_PICKING`, lib/picking-actions.ts). Este módulo aparte deja
 * AGREGAR (nunca reemplazar) personas de fuera de ese grupo — típicamente
 * personal de turno fijo (`especialidad=true`) — a una orden de Cargue o
 * Descargue ya existente, para que también entren en el reparto de toneladas
 * de esa orden vía `cabeceraoc.auxiliares`.
 *
 * El reparto por persona replica EXACTAMENTE el de `pagonomina`
 * (peso_base_calculo ÷ cantidad_auxiliares × tarifa vigente en
 * `tarifaspersonal`), mismo patrón que lib/ajuste-proyeccion-actions.ts.
 *
 * Cada persona agregada desde aquí queda registrada en
 * `apoyo_cargue_asignaciones` (scripts/127_add_apoyo_cargue.sql) — es el rastro
 * que usa la vista `pagonomina` para permitirle el bono de toneladas a un
 * especialidad=true SOLO ese día/orden, sin relajar la regla en general.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getCurrentEmpresaId } from "@/lib/company-filter"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
import { getColombiaDateTime } from "@/lib/date-utils"

const num = (v: any) => Number(v || 0)

/** Réplica de `peso_base_calculo` de 053_pagonomina_reemplazo.sql (líneas 85-87). */
function pesoBaseCalculo(idempresa: number, tipooperacion: string, pesovascula: number, pesoorden: number): number {
  const cedis = idempresa === 3 || idempresa === 4
  if (cedis && tipooperacion === "Descargue") {
    if (pesovascula <= 0) return pesoorden
    const norm = pesoorden > 0 && pesovascula / pesoorden > 50 ? pesovascula / 1000 : pesovascula
    if (pesoorden > 0) {
      const r = norm / pesoorden
      if (r < 0.1 || r > 10) return pesoorden
    }
    return norm
  }
  if (cedis) return pesoorden
  return pesovascula
}

function esEspecialidad(v: any): boolean {
  return v === true || String(v).toLowerCase() === "true"
}

/** Suma horas ENTERAS a una hora "HH:MM" (envuelve pasada medianoche). */
function sumarHoras(hora: string, horas: number): string {
  const [h, m] = hora.split(":").map(Number)
  const total = (h + horas) % 24
  return `${String(total).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export interface PersonaPago {
  persona: string
  toneladas: number
  pago: number
}

export interface OrdenApoyo {
  id: number
  ordendecargue: string
  tipooperacion: string
  placa: string | null
  fechacargue: string
  pesoBase: number
  tarifa: number
  auxiliares: string[]
  pagoActualPorPersona: PersonaPago[]
}

/** Órdenes de Cargue/Descargue de un día, con toneladas/auxiliares/pago actual por persona. */
export async function getOrdenesApoyoDelDia(
  fecha: string,
  idempresaOpcional?: number | null,
): Promise<{ success: boolean; data: OrdenApoyo[]; message?: string }> {
  try {
    const admin = await getSupabaseAdmin()
    const idempresa = idempresaOpcional ?? (await getCurrentEmpresaId())

    let q = admin
      .from("cabeceraoc")
      .select("id, ordendecargue, idempresa, tipooperacion, placa, fechacargue, pesovascula, pesoorden, auxiliares")
      .in("tipooperacion", ["Cargue", "Descargue"])
      .eq("fechacargue", fecha)
    if (idempresa) q = q.eq("idempresa", idempresa)
    const { data: ordenes, error } = await q.order("id", { ascending: false })
    if (error) throw new Error(error.message)

    const empresasEnJuego = Array.from(new Set((ordenes || []).map((o: any) => Number(o.idempresa))))
    const { data: tarifas } = await admin
      .from("tarifaspersonal")
      .select("empresaid, operacion, tarifa, fechaini, fechafin")
      .in("empresaid", empresasEnJuego.length ? empresasEnJuego : [0])

    const tarifaDe = (empresaId: number, operacion: string, fechaStr: string): number => {
      for (const t of tarifas || []) {
        if (Number(t.empresaid) !== empresaId) continue
        if (String(t.operacion) !== operacion) continue
        if (String(t.fechaini).slice(0, 10) <= fechaStr && fechaStr <= String(t.fechafin).slice(0, 10)) return num(t.tarifa)
      }
      return 0
    }

    const out: OrdenApoyo[] = (ordenes || []).map((o: any) => {
      const emp = Number(o.idempresa)
      const tipo = String(o.tipooperacion || "").trim()
      const fechaStr = String(o.fechacargue).slice(0, 10)
      const pesoBase = pesoBaseCalculo(emp, tipo, num(o.pesovascula), num(o.pesoorden))
      const aux = String(o.auxiliares || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
      const tarifa = tarifaDe(emp, tipo, fechaStr)
      const porPersona = aux.length > 0 ? pesoBase / aux.length : 0

      return {
        id: o.id,
        ordendecargue: o.ordendecargue,
        tipooperacion: tipo,
        placa: o.placa ?? null,
        fechacargue: fechaStr,
        pesoBase,
        tarifa,
        auxiliares: aux,
        pagoActualPorPersona: aux.map((persona: string) => ({
          persona,
          toneladas: porPersona,
          pago: porPersona * tarifa,
        })),
      }
    })

    return { success: true, data: out }
  } catch (e: any) {
    console.error("[apoyo-cargue] getOrdenesApoyoDelDia:", e)
    return { success: false, data: [], message: e?.message || "Error al cargar las órdenes" }
  }
}

export interface PersonalApoyoDisponible {
  id: number
  nombre: string
  puesto: string | null
  especialidad: boolean
}

/**
 * Personal presente ese día (registroasistencia), SIN restricción de puesto
 * — a diferencia de getCarguDescarguePersonnel (Picking/Packing), que solo
 * ofrece PUESTOS_PICKING. Aquí el objetivo es justamente poder ofrecer
 * también al personal de turno fijo (especialidad=true).
 *
 * Reglas de disponibilidad (confirmadas por el usuario 2026-09-07, mismo
 * criterio ya validado en lib/picking-actions.ts para Personal disponible):
 *   - Quien ya marcó salida (`horasalida`) ya no está en el proyecto: no
 *     disponible, sin importar la especialidad.
 *   - Si `especialidad=true` (puesto fijo/especializado), SOLO puede aparecer
 *     disponible para apoyar cargue una vez TERMINE su propio turno programado
 *     (`horasalidaprogramada`) -- de lo contrario estaría apoyando cargue
 *     mientras debería estar en su puesto de origen. Esta comparación de hora
 *     solo aplica si la fecha consultada es HOY (para una fecha pasada su
 *     turno ya terminó por definición; ver DatePickerField en el componente).
 *   - `especialidad=false` no tiene esa restricción de horario -- son puestos
 *     ya flexibles de cargue/descargue, igual que en Picking.
 */
export async function getPersonalApoyoDisponible(
  fecha: string,
  idempresaOpcional?: number | null,
): Promise<{ success: boolean; data: PersonalApoyoDisponible[]; message?: string }> {
  try {
    const admin = await getSupabaseAdmin()
    const idempresa = idempresaOpcional ?? (await getCurrentEmpresaId())

    let q = admin
      .from("registroasistencia")
      .select("id, nombre, identificacion, puesto, especialidad, horasalidaprogramada")
      .eq("fecha", fecha)
      .is("asistencia", null) // excluye Ausentes
      .not("horaingreso", "is", null) // excluye programados que no han confirmado llegada (ver picking-actions.ts)
      .is("horasalida", null) // excluye a quien ya marcó salida real: ya salió del proyecto hoy
      .order("nombre", { ascending: true })
    if (idempresa) q = q.eq("idempresa", idempresa)
    const { data, error } = await q
    if (error) throw new Error(error.message)

    // Horas Extra APROBADAS ese mismo día (Servicios Adicionales → Aprobar
    // Turnos) EXTIENDEN el turno programado -- sin esto, alguien con una
    // extensión aprobada aparecía "disponible para apoyo" desde su hora
    // original, mientras en realidad seguía comprometido en su propio
    // puesto. Cruce por cédula primero (más confiable), con caída a nombre
    // para solicitudes viejas sin cédula guardada (mismo criterio que
    // app/api/extra-hours/route.ts). Usuario 2026-09-14.
    const horasExtraPorPersona = new Map<string, number>()
    if ((data || []).some((r: any) => esEspecialidad(r.especialidad))) {
      const { data: extras } = await admin
        .from("solicitud_horas_extras")
        .select("nombre_empleado, identificacion_empleado, cantidad")
        .eq("fecharequerida", fecha)
        .eq("idempresa", idempresa)
      for (const ex of extras || []) {
        const key = String(ex.identificacion_empleado || "").trim() || `nombre:${String(ex.nombre_empleado || "").trim().toUpperCase()}`
        horasExtraPorPersona.set(key, (horasExtraPorPersona.get(key) || 0) + (Number(ex.cantidad) || 0))
      }
    }

    const colombiaDate = await getColombiaDateTime()
    const esHoy = fecha === colombiaDate.toLocaleDateString("en-CA")
    const horaActual = colombiaDate.toTimeString().slice(0, 5)

    const disponibles = (data || []).filter((r: any) => {
      if (!esEspecialidad(r.especialidad)) return true
      if (!esHoy) return true // fecha pasada: su turno ya terminó
      const horaSalidaProgramada = (r.horasalidaprogramada || "").toString().slice(0, 5)
      if (!horaSalidaProgramada) return true // sin dato programado: se deja disponible (dato incompleto, no regla de negocio)
      const cedula = String(r.identificacion || "").trim()
      const horasExtra =
        horasExtraPorPersona.get(cedula) ??
        horasExtraPorPersona.get(`nombre:${String(r.nombre || "").trim().toUpperCase()}`) ??
        0
      const horaEfectiva = horasExtra > 0 ? sumarHoras(horaSalidaProgramada, horasExtra) : horaSalidaProgramada
      return horaActual >= horaEfectiva
    })

    const out: PersonalApoyoDisponible[] = disponibles.map((r: any) => ({
      id: r.id,
      nombre: r.nombre,
      puesto: r.puesto ?? null,
      especialidad: esEspecialidad(r.especialidad),
    }))

    return { success: true, data: out }
  } catch (e: any) {
    console.error("[apoyo-cargue] getPersonalApoyoDisponible:", e)
    return { success: false, data: [], message: e?.message || "Error al cargar el personal" }
  }
}

export interface PreviewPersona {
  persona: string
  antes: number | null // null = persona nueva, no tenía pago antes
  despues: number
}

export interface PreviewApoyo {
  pesoBase: number
  tarifa: number
  cantidadAntes: number
  cantidadDespues: number
  personas: PreviewPersona[]
}

/** Previsualiza cómo queda el pago por persona de una orden si se agregan nombresNuevos. No escribe nada. */
export async function previsualizarApoyo(
  idorden: number,
  nombresNuevos: string[],
): Promise<{ success: boolean; data?: PreviewApoyo; message?: string }> {
  try {
    const admin = await getSupabaseAdmin()
    const { data: o, error } = await admin
      .from("cabeceraoc")
      .select("id, idempresa, tipooperacion, fechacargue, pesovascula, pesoorden, auxiliares")
      .eq("id", idorden)
      .single()
    if (error || !o) throw new Error(error?.message || "Orden no encontrada")

    const emp = Number(o.idempresa)
    const tipo = String(o.tipooperacion || "").trim()
    const fechaStr = String(o.fechacargue).slice(0, 10)
    const pesoBase = pesoBaseCalculo(emp, tipo, num(o.pesovascula), num(o.pesoorden))
    const actuales = String(o.auxiliares || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
    const nuevosLimpios = Array.from(new Set(nombresNuevos.map((s) => s.trim()).filter(Boolean))).filter(
      (n) => !actuales.some((a) => a.toUpperCase() === n.toUpperCase()),
    )

    const { data: tarifas } = await admin
      .from("tarifaspersonal")
      .select("tarifa, fechaini, fechafin")
      .eq("empresaid", emp)
      .eq("operacion", tipo)
    let tarifa = 0
    for (const t of tarifas || []) {
      if (String(t.fechaini).slice(0, 10) <= fechaStr && fechaStr <= String(t.fechafin).slice(0, 10)) {
        tarifa = num(t.tarifa)
        break
      }
    }

    const cantidadAntes = actuales.length
    const cantidadDespues = actuales.length + nuevosLimpios.length
    const porPersonaAntes = cantidadAntes > 0 ? pesoBase / cantidadAntes : 0
    const porPersonaDespues = cantidadDespues > 0 ? pesoBase / cantidadDespues : 0

    const personas: PreviewPersona[] = [
      ...actuales.map((persona) => ({
        persona,
        antes: porPersonaAntes * tarifa,
        despues: porPersonaDespues * tarifa,
      })),
      ...nuevosLimpios.map((persona) => ({
        persona,
        antes: null,
        despues: porPersonaDespues * tarifa,
      })),
    ]

    return {
      success: true,
      data: { pesoBase, tarifa, cantidadAntes, cantidadDespues, personas },
    }
  } catch (e: any) {
    console.error("[apoyo-cargue] previsualizarApoyo:", e)
    return { success: false, message: e?.message || "Error al previsualizar" }
  }
}

/** Agrega (nunca reemplaza) personas a cabeceraoc.auxiliares y las rastrea en apoyo_cargue_asignaciones. */
export async function agregarApoyoAOrden(
  idorden: number,
  nombresNuevos: string[],
): Promise<{ success: boolean; message?: string }> {
  try {
    const admin = await getSupabaseAdmin()
    const usuarioActual = await getCurrentUsuarioForInsert()

    const { data: o, error } = await admin
      .from("cabeceraoc")
      .select("id, idempresa, fechacargue, auxiliares")
      .eq("id", idorden)
      .single()
    if (error || !o) throw new Error(error?.message || "Orden no encontrada")

    const actuales = String(o.auxiliares || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
    const nuevosLimpios = Array.from(new Set(nombresNuevos.map((s) => s.trim()).filter(Boolean))).filter(
      (n) => !actuales.some((a) => a.toUpperCase() === n.toUpperCase()),
    )
    if (nuevosLimpios.length === 0) {
      return { success: false, message: "No hay personas nuevas para agregar" }
    }

    const combinados = [...actuales, ...nuevosLimpios]
    const { error: errUpd } = await admin
      .from("cabeceraoc")
      .update({ auxiliares: combinados.join(",") })
      .eq("id", idorden)
    if (errUpd) throw new Error(errUpd.message)

    const fecha = String(o.fechacargue).slice(0, 10)
    const filas = nuevosLimpios.map((persona) => ({
      idorden,
      idempresa: Number(o.idempresa),
      fecha,
      persona,
      asignado_por: usuarioActual,
    }))
    const { error: errIns } = await admin.from("apoyo_cargue_asignaciones").insert(filas)
    if (errIns) throw new Error(errIns.message)

    return { success: true }
  } catch (e: any) {
    console.error("[apoyo-cargue] agregarApoyoAOrden:", e)
    return { success: false, message: e?.message || "Error al agregar el apoyo" }
  }
}

/** Retira a alguien agregado por este módulo (nunca a un auxiliar original de Picking/Packing). */
export async function quitarApoyoDeOrden(idorden: number, persona: string): Promise<{ success: boolean; message?: string }> {
  try {
    const admin = await getSupabaseAdmin()

    const { data: rastro } = await admin
      .from("apoyo_cargue_asignaciones")
      .select("id")
      .eq("idorden", idorden)
      .ilike("persona", persona)
      .limit(1)
    if (!rastro || rastro.length === 0) {
      return { success: false, message: "Esta persona no fue agregada desde este módulo" }
    }

    const { data: o, error } = await admin.from("cabeceraoc").select("id, auxiliares").eq("id", idorden).single()
    if (error || !o) throw new Error(error?.message || "Orden no encontrada")

    const actuales = String(o.auxiliares || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
    const restantes = actuales.filter((a) => a.toUpperCase() !== persona.trim().toUpperCase())
    const { error: errUpd } = await admin
      .from("cabeceraoc")
      .update({ auxiliares: restantes.join(",") })
      .eq("id", idorden)
    if (errUpd) throw new Error(errUpd.message)

    await admin.from("apoyo_cargue_asignaciones").delete().eq("idorden", idorden).ilike("persona", persona)

    return { success: true }
  } catch (e: any) {
    console.error("[apoyo-cargue] quitarApoyoDeOrden:", e)
    return { success: false, message: e?.message || "Error al quitar el apoyo" }
  }
}
