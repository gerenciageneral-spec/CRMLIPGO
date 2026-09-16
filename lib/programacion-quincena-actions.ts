"use server"

// ---------------------------------------------------------------------------
// PROGRAMACIÓN DEL PERSONAL POR QUINCENA
//
// Lee la quincena completa de `registroasistencia` y la presenta como una
// grilla persona × día, más la cobertura por puesto y los equipos.
//
// LO QUE ESTO **NO** HACE
//  · No liquida. Las horas que muestra son las PROGRAMADAS; lo que se paga sale
//    del trigger sobre registroasistencia y de la vista pagonomina.
//  · No calcula horas nocturnas para nómina. El estimado nocturno es de
//    pantalla: hen/hef/hn los consume la nómina y la facturación, hoy valen 0
//    porque el trigger solo escribe hed/hedf, y poblarlos sube ambas de golpe.
//  · No valida el límite semanal: el sistema no calcula la jornada real.
//
// Escribir aquí es PRODUCCIÓN INMEDIATA: insertar en registroasistencia dispara
// el trigger de horas extra y la fila entra a nómina y facturación. No hay
// borrador. Por eso las escrituras piden confirmación explícita en la pantalla.
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getPuestosFromTarifas } from "@/lib/programacion-turnos-actions"
import { getCurrentUsuarioForInsert } from "@/lib/user-context"
import type {
  CeldaCobertura,
  DiaQuincena,
  FilaCobertura,
  FilaPersona,
  ProgramacionQuincenaData,
  TurnoDef,
} from "@/lib/programacion-quincena-tipos"

/**
 * Franja nocturna legal. Solo para el ESTIMADO que muestra la pantalla: no se
 * usa para liquidar nada. La reforma la corrió a las 19:00; el valor vive aquí
 * y no en la base porque nada lo consume todavía.
 */
const NOCTURNO_DESDE = 19 * 60
const NOCTURNO_HASTA = 6 * 60

const DIAS_SEMANA = ["do", "lu", "ma", "mi", "ju", "vi", "sá"]

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

function ultimoDiaDe(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate()
}

function aMinutos(hhmm: string | null): number | null {
  if (!hhmm) return null
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Minutos de un turno, contemplando que cruce la medianoche. */
function minutosTurno(ini: number, fin: number): number {
  return fin > ini ? fin - ini : 24 * 60 - ini + fin
}

/**
 * Minutos del turno que caen en la franja nocturna.
 *
 * Se recorre minuto a minuto en vez de intersectar intervalos: el turno puede
 * cruzar la medianoche Y la franja nocturna también, y con intervalos hay
 * cuatro casos que es fácil equivocar. Son 1440 iteraciones como mucho.
 */
function minutosNocturnos(ini: number, fin: number): number {
  const total = minutosTurno(ini, fin)
  let n = 0
  for (let i = 0; i < total; i++) {
    const m = (ini + i) % (24 * 60)
    if (m >= NOCTURNO_DESDE || m < NOCTURNO_HASTA) n++
  }
  return n
}

function faltaTabla(msg: string | undefined): boolean {
  const m = String(msg ?? "").toLowerCase()
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation")
}

/** Todas las filas, paginando: Supabase corta en 1000. */
async function traerTodo(construir: (d: number, h: number) => any): Promise<any[]> {
  const out: any[] = []
  for (let off = 0; off < 60000; off += 1000) {
    const { data, error } = await construir(off, off + 999)
    if (error) throw new Error(error.message)
    const lote = data ?? []
    out.push(...lote)
    if (lote.length < 1000) break
  }
  return out
}

/**
 * Toda la quincena en una llamada.
 *
 * Si falta el script de esta entrega, devuelve `faltaMigracion: true` y la
 * pantalla lo dice en vez de mostrar una grilla vacía como si no hubiera gente.
 */
export async function getProgramacionQuincena(
  empresaId: number | null | undefined,
  anio: number,
  mes: number,
  quincena: 1 | 2,
): Promise<{ success: boolean; data?: ProgramacionQuincenaData; message?: string }> {
  if (!empresaId) return { success: false, message: "Selecciona una empresa en el selector de arriba." }

  const p = (n: number) => String(n).padStart(2, "0")
  const diaIni = quincena === 1 ? 1 : 16
  const diaFin = quincena === 1 ? 15 : ultimoDiaDe(anio, mes)
  const desde = `${anio}-${p(mes)}-${p(diaIni)}`
  const hasta = `${anio}-${p(mes)}-${p(diaFin)}`
  const avisos: string[] = []

  try {
    const sb: any = await getSupabaseAdmin()

    // --- TURNOS DEFINIDOS -------------------------------------------------
    let turnos: TurnoDef[] = []
    let faltaMigracion = false
    {
      const { data, error } = await sb
        .from("turnos_definicion")
        .select("id, codigo, nombre, hora_inicio, hora_fin, descanso_min, color, es_administrativo, orden")
        .eq("idempresa", empresaId)
        .eq("activo", true)
        .order("orden", { ascending: true })
      if (error) {
        if (faltaTabla(error.message)) faltaMigracion = true
        else avisos.push("No se pudieron leer los turnos definidos.")
      } else {
        turnos = (data ?? []).map((t: any) => {
          const ini = aMinutos(t.hora_inicio) ?? 0
          const fin = aMinutos(t.hora_fin) ?? 0
          const brutos = minutosTurno(ini, fin)
          return {
            id: Number(t.id),
            codigo: t.codigo,
            nombre: t.nombre,
            horaInicio: fmt(ini),
            horaFin: fmt(fin),
            descansoMin: Number(t.descanso_min) || 0,
            color: t.color ?? null,
            esAdministrativo: !!t.es_administrativo,
            orden: Number(t.orden) || 0,
            horas: Math.round(((brutos - (Number(t.descanso_min) || 0)) / 60) * 10) / 10,
            horasNocturnas: Math.round((minutosNocturnos(ini, fin) / 60) * 10) / 10,
          }
        })
      }
    }

    // --- DÍAS DE LA QUINCENA, CON FESTIVOS --------------------------------
    const festivos = new Set<string>()
    try {
      const { data } = await sb.from("festivos").select("fecha").gte("fecha", desde).lte("fecha", hasta)
      for (const f of data ?? []) festivos.add(String(f.fecha).slice(0, 10))
    } catch {
      avisos.push("No se pudieron leer los festivos: la grilla marcará solo los domingos.")
    }

    const dias: DiaQuincena[] = []
    for (let d = diaIni; d <= diaFin; d++) {
      const fecha = `${anio}-${p(mes)}-${p(d)}`
      // Se construye a mediodía UTC: con T00:00:00Z, en UTC-5 el día retrocede.
      const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay()
      dias.push({
        fecha,
        diaMes: d,
        diaSemana: DIAS_SEMANA[dow],
        esDomingo: dow === 0,
        esFestivo: festivos.has(fecha),
      })
    }

    // --- PERSONAL ACTIVO --------------------------------------------------
    // Se incluye al administrativo: la maqueta tiene un turno AD y hoy el
    // selector de programación lo excluye. Se marca con su cargo para que se
    // vea quién es quién.
    let personasBase: any[] = []
    try {
      personasBase = await traerTodo((d, h) =>
        sb
          .from("headcount")
          .select("identificacion, nombre, cargo, admin")
          .eq("idempresa", empresaId)
          .eq("estado", "Activo")
          .order("nombre", { ascending: true })
          .range(d, h),
      )
      personasBase = personasBase.filter((r) => !/prueba/i.test(String(r.nombre ?? "")))
    } catch (e: any) {
      avisos.push("No se pudo leer el personal activo.")
      console.error("[v0] getProgramacionQuincena headcount:", e?.message ?? e)
    }

    // --- EQUIPOS ----------------------------------------------------------
    const equipoPorIdent = new Map<string, { id: number; nombre: string }>()
    const equipos: ProgramacionQuincenaData["equipos"] = []
    const patrones: ProgramacionQuincenaData["patrones"] = []
    if (!faltaMigracion) {
      try {
        const [eqRes, patRes, intRes] = await Promise.all([
          sb.from("equipos_trabajo").select("id, nombre, area, color, patron_id").eq("idempresa", empresaId).eq("activo", true),
          sb.from("patrones_rotacion").select("id, nombre, descripcion, secuencia, horas_semana").eq("idempresa", empresaId).eq("activo", true).order("nombre"),
          sb.from("equipos_integrantes").select("equipo_id, identificacion"),
        ])
        const patMap = new Map<number, any>((patRes.data ?? []).map((x: any) => [Number(x.id), x]))
        for (const x of patRes.data ?? []) {
          patrones.push({
            id: Number(x.id),
            nombre: x.nombre,
            descripcion: x.descripcion ?? null,
            secuencia: (x.secuencia ?? []) as string[],
            horasSemana: x.horas_semana == null ? null : Number(x.horas_semana),
          })
        }
        const porEquipo = new Map<number, number>()
        for (const i of intRes.data ?? []) {
          porEquipo.set(Number(i.equipo_id), (porEquipo.get(Number(i.equipo_id)) ?? 0) + 1)
        }
        for (const e of eqRes.data ?? []) {
          const pat = e.patron_id ? patMap.get(Number(e.patron_id)) : null
          equipos.push({
            id: Number(e.id),
            nombre: e.nombre,
            area: e.area ?? null,
            color: e.color ?? null,
            patronId: e.patron_id ? Number(e.patron_id) : null,
            patronNombre: pat?.nombre ?? null,
            integrantes: porEquipo.get(Number(e.id)) ?? 0,
            horasSemana: pat?.horas_semana == null ? null : Number(pat.horas_semana),
          })
        }
        const idsEmpresa = new Set(equipos.map((e) => e.id))
        for (const i of intRes.data ?? []) {
          const eid = Number(i.equipo_id)
          if (!idsEmpresa.has(eid)) continue
          const eq = equipos.find((e) => e.id === eid)
          if (eq) equipoPorIdent.set(String(i.identificacion).trim(), { id: eq.id, nombre: eq.nombre })
        }
      } catch (e: any) {
        console.error("[v0] getProgramacionQuincena equipos:", e?.message ?? e)
      }
    }

    // --- LO PROGRAMADO EN LA QUINCENA -------------------------------------
    let filasRA: any[] = []
    try {
      filasRA = await traerTodo((d, h) =>
        sb
          .from("registroasistencia")
          .select("id, fecha, nombre, identificacion, puesto, asistencia, horaentradaprogramada, horasalidaprogramada, horaingreso, turno")
          .eq("idempresa", empresaId)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .range(d, h),
      )
    } catch (e: any) {
      avisos.push("No se pudo leer la programación de la quincena.")
      console.error("[v0] getProgramacionQuincena registroasistencia:", e?.message ?? e)
    }

    // Reconocer el turno por su horario: registroasistencia guarda horas, no
    // códigos. Si las horas no coinciden con ningún turno definido, la celda se
    // muestra igual con su horario en vez de descartarla.
    const porHorario = new Map<string, string>()
    for (const t of turnos) porHorario.set(`${t.horaInicio}|${t.horaFin}`, t.codigo)
    const horasPorCodigo = new Map(turnos.map((t) => [t.codigo, t.horas]))
    const nocturnasPorCodigo = new Map(turnos.map((t) => [t.codigo, t.horasNocturnas]))

    const personas: FilaPersona[] = personasBase.map((per) => {
      const ident = String(per.identificacion ?? "").trim()
      const eq = equipoPorIdent.get(ident) ?? null
      return {
        identificacion: ident,
        nombre: per.nombre ?? "",
        cargo: per.cargo ?? null,
        equipoId: eq?.id ?? null,
        equipoNombre: eq?.nombre ?? null,
        dias: {},
        horasQuincena: 0,
        diasConTurno: 0,
      }
    })
    const porIdent = new Map(personas.map((x) => [x.identificacion, x]))

    let horasProgramadas = 0
    let horasNocturnasEstimadas = 0
    let diasProgramados = 0

    for (const r of filasRA) {
      const ident = String(r.identificacion ?? "").trim()
      const fila = porIdent.get(ident)
      if (!fila) continue // alguien ya retirado, o de otra empresa
      const fecha = String(r.fecha).slice(0, 10)
      const ini = aMinutos(r.horaentradaprogramada)
      const fin = aMinutos(r.horasalidaprogramada)
      const codigo =
        ini != null && fin != null ? porHorario.get(`${fmt(ini)}|${fmt(fin)}`) ?? null : null

      fila.dias[fecha] = {
        id: Number(r.id),
        turnoCodigo: codigo,
        puesto: r.puesto ?? null,
        horaEntrada: ini != null ? fmt(ini) : null,
        horaSalida: fin != null ? fmt(fin) : null,
        novedad: r.asistencia ?? null,
        marco: !!r.horaingreso,
      }

      if (r.puesto != null && r.asistencia == null) {
        fila.diasConTurno++
        diasProgramados++
        // Si el turno se reconoció, se usan sus horas netas; si no, se calcula
        // del horario de la fila. Nunca se asume 8.
        const hs =
          codigo != null
            ? horasPorCodigo.get(codigo) ?? 0
            : ini != null && fin != null
              ? Math.round((minutosTurno(ini, fin) / 60) * 10) / 10
              : 0
        fila.horasQuincena += hs
        horasProgramadas += hs
        horasNocturnasEstimadas +=
          codigo != null
            ? nocturnasPorCodigo.get(codigo) ?? 0
            : ini != null && fin != null
              ? Math.round((minutosNocturnos(ini, fin) / 60) * 10) / 10
              : 0
      }
    }

    for (const x of personas) x.horasQuincena = Math.round(x.horasQuincena * 10) / 10

    // --- COBERTURA: REQUERIDO VS ASIGNADO ---------------------------------
    // Catalogo de puestos: el mismo que ofrece la programacion diaria.
    let puestos: string[] = []
    try {
      const catalogo = await getPuestosFromTarifas(empresaId)
      puestos = Array.from(new Set(catalogo.map((p: any) => String(p.puesto || "").trim())))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es"))
    } catch (e: any) {
      avisos.push("No se pudo leer el catálogo de puestos.")
      console.error("[v0] getProgramacionQuincena puestos:", e?.message ?? e)
    }

    const cobertura: FilaCobertura[] = []
    if (!faltaMigracion) {
      try {
        const { data: dem } = await sb
          .from("demanda_puesto")
          .select("puesto, turno_codigo, fecha, requeridos")
          .eq("idempresa", empresaId)

        // Base (fecha null) + excepciones por día.
        const base = new Map<string, number>()
        const excep = new Map<string, number>()
        for (const d of dem ?? []) {
          const k = `${d.puesto}|${d.turno_codigo}`
          if (d.fecha == null) base.set(k, Number(d.requeridos) || 0)
          else excep.set(`${k}|${String(d.fecha).slice(0, 10)}`, Number(d.requeridos) || 0)
        }

        // Asignados reales por (puesto, turno, fecha).
        const asignados = new Map<string, number>()
        for (const r of filasRA) {
          if (r.puesto == null || r.asistencia != null) continue
          const ini = aMinutos(r.horaentradaprogramada)
          const fin = aMinutos(r.horasalidaprogramada)
          const cod = ini != null && fin != null ? porHorario.get(`${fmt(ini)}|${fmt(fin)}`) : null
          if (!cod) continue
          const k = `${r.puesto}|${cod}|${String(r.fecha).slice(0, 10)}`
          asignados.set(k, (asignados.get(k) ?? 0) + 1)
        }

        const nombreTurno = new Map(turnos.map((t) => [t.codigo, t.nombre]))
        for (const [k, req] of base) {
          const [puesto, cod] = k.split("|")
          const celdas: CeldaCobertura[] = dias.map((d) => {
            const requeridos = excep.get(`${k}|${d.fecha}`) ?? req
            const asig = asignados.get(`${puesto}|${cod}|${d.fecha}`) ?? 0
            let estado: CeldaCobertura["estado"] = "sin_demanda"
            if (requeridos > 0) {
              estado = asig >= requeridos ? "cubierto" : asig === 0 ? "deficit" : asig >= requeridos * 0.85 ? "parcial" : "deficit"
            }
            return { fecha: d.fecha, requeridos, asignados: asig, estado }
          })
          cobertura.push({
            puesto,
            turnoCodigo: cod,
            turnoNombre: nombreTurno.get(cod) ?? cod,
            requeridosBase: req,
            dias: celdas,
          })
        }
        cobertura.sort((a, b) => a.puesto.localeCompare(b.puesto) || a.turnoCodigo.localeCompare(b.turnoCodigo))
      } catch (e: any) {
        console.error("[v0] getProgramacionQuincena demanda:", e?.message ?? e)
      }
    }

    if (!faltaMigracion && turnos.length === 0) {
      avisos.push("No hay turnos definidos para esta empresa: la grilla no puede reconocer los horarios.")
    }

    return {
      success: true,
      data: {
        quincena: {
          anio, mes, numero: quincena, desde, hasta,
          etiqueta: `${diaIni} – ${diaFin} de ${MESES[mes - 1]}`,
        },
        dias,
        turnos,
        personas,
        equipos,
        patrones,
        cobertura,
        puestos,
        totales: {
          personas: personas.length,
          diasProgramados,
          horasProgramadas: Math.round(horasProgramadas * 10) / 10,
          horasNocturnasEstimadas: Math.round(horasNocturnasEstimadas * 10) / 10,
        },
        avisos,
        faltaMigracion,
      },
    }
  } catch (e: any) {
    console.error("[v0] getProgramacionQuincena excepción:", e?.message ?? e)
    return { success: false, message: e?.message || "No se pudo cargar la programación." }
  }
}

/** Crea o actualiza un turno con nombre. */
export async function guardarTurnoDef(payload: {
  empresaId: number
  id?: number
  codigo: string
  nombre: string
  horaInicio: string
  horaFin: string
  descansoMin: number
  color?: string | null
  esAdministrativo?: boolean
  orden?: number
}): Promise<{ success: boolean; message?: string }> {
  try {
    const sb: any = await getSupabaseAdmin()
    const fila = {
      idempresa: payload.empresaId,
      codigo: payload.codigo.trim().toUpperCase(),
      nombre: payload.nombre.trim(),
      hora_inicio: `${payload.horaInicio}:00`,
      hora_fin: `${payload.horaFin}:00`,
      descanso_min: Math.max(0, Number(payload.descansoMin) || 0),
      color: payload.color ?? null,
      es_administrativo: !!payload.esAdministrativo,
      orden: Number(payload.orden) || 0,
    }
    if (!fila.codigo || !fila.nombre) return { success: false, message: "Código y nombre son obligatorios." }

    const { error } = payload.id
      ? await sb.from("turnos_definicion").update(fila).eq("id", payload.id)
      : await sb.from("turnos_definicion").insert(fila)
    if (error) {
      if (faltaTabla(error.message)) {
        return { success: false, message: "Falta correr scripts/add_programacion_turnos_quincena.sql." }
      }
      return { success: false, message: error.message }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo guardar el turno." }
  }
}

/** Define cuántas personas requiere un puesto en un turno. */
export async function guardarDemanda(payload: {
  empresaId: number
  puesto: string
  turnoCodigo: string
  requeridos: number
  /** null = demanda base de todos los días. */
  fecha?: string | null
}): Promise<{ success: boolean; message?: string }> {
  try {
    if (!payload.puesto?.trim() || !payload.turnoCodigo?.trim()) {
      return { success: false, message: "Falta el puesto o el turno." }
    }
    const sb: any = await getSupabaseAdmin()
    const usuario = await getCurrentUsuarioForInsert().catch(() => null)
    const req = Math.max(0, Number(payload.requeridos) || 0)

    // En Postgres NULL <> NULL: un .eq("fecha", null) no encontraría la fila
    // base --el caso mayoritario-- y se duplicaría en cada guardado.
    let q = sb
      .from("demanda_puesto")
      .select("id")
      .eq("idempresa", payload.empresaId)
      .eq("puesto", payload.puesto.trim())
      .eq("turno_codigo", payload.turnoCodigo.trim())
    q = payload.fecha ? q.eq("fecha", payload.fecha) : q.is("fecha", null)
    const { data: ya } = await q.maybeSingle()

    const fila = {
      idempresa: payload.empresaId,
      puesto: payload.puesto.trim(),
      turno_codigo: payload.turnoCodigo.trim(),
      fecha: payload.fecha ?? null,
      requeridos: req,
      actualizado_por: usuario,
      updated_at: new Date().toISOString(),
    }
    const { error } = ya?.id
      ? await sb.from("demanda_puesto").update(fila).eq("id", ya.id)
      : await sb.from("demanda_puesto").insert(fila)
    if (error) {
      if (faltaTabla(error.message)) {
        return { success: false, message: "Falta correr scripts/add_programacion_turnos_quincena.sql." }
      }
      return { success: false, message: error.message }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo guardar la demanda." }
  }
}

/** Crea un equipo y le asigna integrantes. */
export async function guardarEquipo(payload: {
  empresaId: number
  id?: number
  nombre: string
  area?: string | null
  patronId?: number | null
  integrantes?: string[]
}): Promise<{ success: boolean; message?: string }> {
  try {
    if (!payload.nombre?.trim()) return { success: false, message: "El equipo necesita un nombre." }
    const sb: any = await getSupabaseAdmin()
    const fila = {
      idempresa: payload.empresaId,
      nombre: payload.nombre.trim(),
      area: payload.area?.trim() || null,
      patron_id: payload.patronId ?? null,
    }

    let equipoId = payload.id
    if (equipoId) {
      const { error } = await sb.from("equipos_trabajo").update(fila).eq("id", equipoId)
      if (error) return { success: false, message: error.message }
    } else {
      const { data, error } = await sb.from("equipos_trabajo").insert(fila).select("id").single()
      if (error) {
        if (faltaTabla(error.message)) {
          return { success: false, message: "Falta correr scripts/add_programacion_turnos_quincena.sql." }
        }
        return { success: false, message: error.message }
      }
      equipoId = Number(data.id)
    }

    if (payload.integrantes) {
      // Se reemplaza la lista completa: es lo que espera quien edita el equipo.
      await sb.from("equipos_integrantes").delete().eq("equipo_id", equipoId)
      const nuevos = payload.integrantes
        .map((i) => String(i).trim())
        .filter(Boolean)
        .map((identificacion) => ({ equipo_id: equipoId, identificacion }))
      if (nuevos.length) {
        const { error } = await sb.from("equipos_integrantes").insert(nuevos)
        if (error) return { success: false, message: error.message }
      }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo guardar el equipo." }
  }
}

/** Quita un turno programado. Es la única marcha atrás que existe. */
export async function borrarAsignacion(
  empresaId: number,
  id: number,
): Promise<{ success: boolean; message?: string }> {
  if (!empresaId || !id) return { success: false, message: "Falta la asignación." }
  try {
    const sb: any = await getSupabaseAdmin()
    const { error } = await sb.from("registroasistencia").delete().eq("id", id).eq("idempresa", empresaId)
    if (error) return { success: false, message: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || "No se pudo quitar." }
  }
}
