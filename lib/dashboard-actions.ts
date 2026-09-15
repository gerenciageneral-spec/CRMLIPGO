"use server"

import { createClient } from "@/lib/supabase-client"
import { getCurrentEmpresaId } from "@/lib/company-filter"
import { getMetaDiaForEmpresa } from "@/lib/empresa-meta-dia"
import { esProductoPorUnidad } from "@/lib/facturacion-billed-party"
import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export interface DashboardOperacionesData {
  cliente: string | null
  ordendecargue: string | null
  placa: string | null
  tipooperacion: string | null
  pesoorden: number | null
  horavehiculo: string | null
  horasanitario: string | null
  horaorden: string | null
  horalote: string | null
  pesajeinicial: string | null
  iniciocargue: string | null
  fincargue: string | null
  pesajefinal: string | null
  tiempo_en_proceso: string | null
  estado: string | null
  /** Minutos que la orden estuvo pausada. 0 si nunca se pauso. */
  tiempo_paro_min: number
  /** Cuantas pausas tuvo la orden. */
  paros: number
  /**
   * Hay una pausa ABIERTA (sin hora de fin). Si es de hoy, los minutos de
   * arriba ya incluyen lo que lleva corriendo; si es de un dia pasado NO se
   * suma -- seria una pausa que nadie cerro, no tiempo real de paro -- y esta
   * bandera avisa que el total esta incompleto.
   */
  paro_abierto: boolean
  /**
   * true si el producto de esta orden se factura POR UNIDAD (hoy: Huevos,
   * ver esProductoPorUnidad/codigosOrdenPorUnidad) — su `pesoorden` es un
   * valor nominal sin significado real de peso. La orden sigue siendo una
   * orden normal para cualquier otro fin; solo no debe sumarse a ningun
   * total de TONELADAS (ver "Pico por hora" en dashboard-operacion-dia.tsx).
   */
  es_por_unidad: boolean
}

export interface DashboardOperacionesStats {
  tonsCargadas: number
  tonsDescargadas: number
  tonsDistribucion: number
  totalToneladasDia: number
  toneladasProgramadas: number
  /**
   * Meta de toneladas del dia para la empresa seleccionada en
   * `fechaFiltro`. Se calcula sumando la columna `Meta Dia` de la
   * vista `metadia` (la misma fuente que usa el modulo Dashboard
   * Operaciones / LIP). Sirve como referencia "objetivo" en la
   * tarjeta-medidor donde se compara contra programado y ejecutado.
   */
  metaToneladasDia: number
  vehiculosTendidos: number
  ordenesPorAsignar: number
  ordenesPorPesar: number
  ordenesEnCola: number
  ordenesEnProceso: number
  ordenesFinalizadas: number
  totalOrdenesDia: number
  vehiculosEnPatio: Array<{ placa: string; horallegada: string }>
  clientesEnProceso: Array<{ cliente: string; iniciocargue: string; tiempo_en_proceso: string }>
  /**
   * Personal asignado para la `fechaFiltro` y la empresa seleccionada,
   * tomado de la tabla `asignacionpersonal`. Sirve para que el
   * supervisor vea cuanta gente esta disponible para la operacion del
   * dia. `total` es el conteo de filas (cada fila = una asignacion de
   * persona/turno) y `porAsignacion` es el desglose por la columna
   * `asignacion` ordenado de mayor a menor.
   */
  personalDelDia: {
    total: number
    porAsignacion: Array<{ asignacion: string; total: number }>
  }
  /**
   * Productos pendientes por cargar al vehiculo. Salen de la tabla
   * `invtrans` filtrada por la empresa, por `status = "por descontar"`
   * y por la "parte de fecha" del campo `creado` (timestamptz)
   * coincidente con la `fechaFiltro` del dashboard.
   *
   * Cada item conserva su `ocargue`, `nombreproducto` y `cantidad` para
   * que la card de alerta pueda mostrar agrupado por orden de cargue
   * cuanto queda pendiente y de que productos. `total` es la cantidad
   * de items (filas) y `totalCantidad` la suma total para el badge.
   */
  pendientesPorCargar: {
    total: number
    totalCantidad: number
    items: Array<{
      ocargue: string
      nombreproducto: string
      cantidad: number
    }>
  }
}

// Keep old interfaces for backward compatibility
export interface DashboardData {
  orden: string
  peso_orden: number | null
  tipo_producto: string | null
  placa: string | null
  tipo_operacion: string | null
  hora_orden: string | null
  hora_pesaje_inicial: string | null
  hora_lote: string | null
  hora_registro_sanitario: string | null
  hora_vehiculo: string | null
  hora_inicio_cargue: string | null
  hora_fin_cargue: string | null
  hora_pesaje_final: string | null
  duracion_minutos: number | null
  estado: string | null
}

export interface DashboardStats {
  totalToneladas: number
  toneladasProcesadas: number
  totalVehiculos: number
  ordenesFinalizadas: number
}

function getColombiaDate() {
  const now = new Date()
  const colombiaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }))
  const year = colombiaTime.getFullYear()
  const month = String(colombiaTime.getMonth() + 1).padStart(2, "0")
  const day = String(colombiaTime.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export interface AccessibleEmpresa {
  id: number
  nombre: string
}

export async function getAccessibleEmpresasForDashboard(): Promise<{ success: boolean; data: AccessibleEmpresa[]; error?: string }> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    })
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error("[v0] Error getting user:", userError)
      return { success: false, data: [], error: "No se pudo obtener el usuario" }
    }

    // Get accessible empresa IDs from perfil_acceso_empresas using admin client
    const { data: accessData, error: accessError } = await supabaseAdmin
      .from("perfil_acceso_empresas")
      .select("empresa_id")
      .eq("profile_id", user.id)

    if (accessError) {
      console.error("[v0] Error fetching accessible empresas:", accessError)
      return { success: false, data: [], error: accessError.message }
    }

    if (!accessData || accessData.length === 0) {
      // If no specific access, return the user's default empresa
      const defaultEmpresaId = await getCurrentEmpresaId()
      const { data: defaultEmpresa, error: defaultError } = await supabaseAdmin
        .from("empresas")
        .select("id, nombre")
        .eq("id", defaultEmpresaId)
        .single()

      if (defaultError || !defaultEmpresa) {
        return { success: false, data: [], error: "No se encontraron empresas accesibles" }
      }

      return { success: true, data: [{ id: defaultEmpresa.id, nombre: defaultEmpresa.nombre }] }
    }

    const empresaIds = accessData.map(a => a.empresa_id)

    // Fetch empresa details using admin client
    const { data: empresasData, error: empresasError } = await supabaseAdmin
      .from("empresas")
      .select("id, nombre")
      .in("id", empresaIds)
      .order("nombre", { ascending: true })

    if (empresasError) {
      console.error("[v0] Error fetching empresas details:", empresasError)
      return { success: false, data: [], error: empresasError.message }
    }

    return { success: true, data: empresasData as AccessibleEmpresa[] }
  } catch (error) {
    console.error("[v0] Error in getAccessibleEmpresasForDashboard:", error)
    return { success: false, data: [], error: "Error al obtener empresas accesibles" }
  }
}

/**
 * Devuelve la "parte de fecha" (YYYY-MM-DD) de cualquiera de los
 * formatos en que `fechacargue` puede llegar desde Postgres:
 *   - "2026-05-08"                  (DATE puro)
 *   - "2026-05-08T12:34:56"          (TIMESTAMP local)
 *   - "2026-05-08T12:34:56.000Z"     (TIMESTAMPTZ con UTC)
 *   - "2026-05-08 12:34:56"          (TIMESTAMP con espacio)
 * Si no logra extraerla, retorna `null` para que el caller decida.
 */
function extractIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** "HH:MM:SS" o "HH:MM" -> minutos desde medianoche. null si no parsea. */
function horaAMinutos(t: string | null | undefined): number | null {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/**
 * Minutos entre dos horas del dia. `pausas` guarda HORA, no fecha y hora, asi
 * que una pausa que cruza la medianoche llega con el fin ANTES del inicio
 * (23:50 -> 00:20). En ese caso se le suman 24 h; si no, saldria negativa y
 * restaria del total en vez de sumar.
 */
function minutosEntreHoras(inicio: string | null, fin: string | null): number | null {
  const a = horaAMinutos(inicio)
  const b = horaAMinutos(fin)
  if (a == null || b == null) return null
  const d = b - a
  return d >= 0 ? d : d + 24 * 60
}

export interface ParoDeOrden {
  minutos: number
  paros: number
  abierto: boolean
}

/**
 * Tiempo total de paro por orden, desde la tabla `pausas`.
 *
 * Una pausa esta abierta mientras `fin` sea null -- mismo criterio que usan
 * `pausarOrden` y `reanudarOrden` en lib/picking-actions.ts. NO se mira la
 * columna generada `activo`.
 *
 * La pausa abierta solo se cuenta cuando la orden es de HOY: ahi el paro sigue
 * corriendo de verdad. En un dia pasado, una pausa sin cerrar es alguien que se
 * olvido de reanudar, y contarla hasta "ahora" daria cifras absurdas (dias de
 * paro); se deja fuera del total y se marca la fila como incompleta.
 *
 * Si la consulta falla no se rompe el tablero: todas las ordenes salen en 0.
 */
async function getParoPorOrden(
  supabase: any,
  ordenes: string[],
  esHoy: boolean,
): Promise<Map<string, ParoDeOrden>> {
  const mapa = new Map<string, ParoDeOrden>()
  if (ordenes.length === 0) return mapa

  const { data, error } = await supabase
    .from("pausas")
    .select("ordendecargue, inicio, fin")
    .in("ordendecargue", ordenes)

  if (error) {
    console.error("[v0] Error leyendo pausas:", error.message, error.code, error.details, error.hint)
    return mapa
  }

  const ahora = esHoy ? horaAMinutos(getColombiaTimeSync()) : null

  for (const p of data ?? []) {
    const orden = String(p.ordendecargue ?? "")
    if (!orden) continue
    const cur = mapa.get(orden) ?? { minutos: 0, paros: 0, abierto: false }
    cur.paros += 1

    if (p.fin) {
      const d = minutosEntreHoras(p.inicio, p.fin)
      if (d != null) cur.minutos += d
    } else {
      cur.abierto = true
      if (ahora != null) {
        const ini = horaAMinutos(p.inicio)
        if (ini != null) cur.minutos += ahora >= ini ? ahora - ini : ahora + 24 * 60 - ini
      }
    }
    mapa.set(orden, cur)
  }
  return mapa
}

/** Hora de pared de Colombia "HH:MM:SS", sin ir al servidor de fecha. */
function getColombiaTimeSync(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date())
}

/** Campos que el dashboard necesita de la vista. Compartido entre la consulta
 *  del día y la de los descargues pendientes, para que no puedan divergir. */
const CAMPOS_OPERACIONES =
  "cliente, ordendecargue, placa, tipooperacion, pesoorden, fechacargue, horavehiculo, horasanitario, horaorden, horalote, pesajeinicial, iniciocargue, fincargue, pesajefinal, tiempo_en_proceso, estado"

/**
 * Códigos de las órdenes de DESCARGUE del día que todavía NO tienen `fechacargue`.
 *
 * Un descargue nacido de un traslado entre bodegas (`lib/transfer-actions.ts`, que
 * ni siquiera escribe la columna) o del clon automático a un CEDI
 * (`lib/orders-actions.tsx`, que la pone en null a proposito porque nace
 * pendiente) no tiene esa fecha. Como el dashboard filtra el día por ella, esos
 * descargues quedaban INVISIBLES: solo se veian los creados desde "Generar
 * Órdenes de Descargue", que si la guardan.
 *
 * Se ubican por `fechaorden` contra `cabeceraoc` y NO contra la vista: la vista
 * `dashboardoperaciones` no expone `fechaorden`, asi que el rango de fechas se
 * resuelve aqui y despues se le piden las filas por codigo.
 */
async function codigosDescarguePendientes(
  supabase: any,
  empresaId: number | null,
  desde: string,
  hasta: string,
): Promise<string[]> {
  if (!empresaId) return []
  const { data, error } = await supabase
    .from("cabeceraoc")
    .select("ordendecargue")
    .eq("idempresa", empresaId)
    .eq("tipooperacion", "Descargue")
    .is("fechacargue", null)
    .gte("fechaorden", desde)
    .lt("fechaorden", hasta)

  if (error) {
    // Falla-abierto: el dashboard sigue mostrando lo de siempre.
    console.error("[v0] Error buscando descargues sin fechacargue:", error)
    return []
  }
  return Array.from(
    new Set((data ?? []).map((r: any) => String(r.ordendecargue ?? "").trim()).filter(Boolean)),
  )
}

/**
 * `ordendecargue` de las órdenes cuyo producto se factura POR UNIDAD (hoy:
 * Huevos, ver esProductoPorUnidad en facturacion-billed-party.ts) — su
 * `pesoorden` es un valor nominal (cantidad × peso_unitkg) sin significado
 * real de peso, así que sumarlo al total de TONELADAS del día mezclaría dos
 * unidades de medida distintas.
 *
 * Solo se usa para EXCLUIR esas órdenes de las sumas de peso del dashboard
 * (tonsCargadas/tonsDescargadas/tonsDistribucion/totalToneladasDia/
 * toneladasProgramadas) — siguen contando como órdenes/vehículos normales
 * en el resto de KPIs (conteos, estados, etc.), es solo el peso el que
 * queda fuera. Confirmado por el usuario 2026-08-28.
 */
async function codigosOrdenPorUnidad(supabase: any, ordenes: string[]): Promise<Set<string>> {
  const codigos = Array.from(new Set(ordenes.map((o) => String(o ?? "").trim()).filter(Boolean)))
  if (codigos.length === 0) return new Set()

  const { data: detalle, error } = await supabase
    .from("detalleoc")
    .select("numeroorden, producto")
    .in("numeroorden", codigos)
  if (error) {
    // Falla-abierto: si esta consulta falla, el dashboard sigue sumando
    // toneladas como siempre (comportamiento previo), en vez de romperse.
    console.error("[v0] Error buscando productos por orden (exclusión por unidad):", error)
    return new Set()
  }

  const productosPorOrden = new Map<string, Set<string>>()
  for (const d of detalle ?? []) {
    const on = String(d.numeroorden ?? "").trim()
    const prod = String(d.producto ?? "").trim()
    if (!on || !prod) continue
    if (!productosPorOrden.has(on)) productosPorOrden.set(on, new Set())
    productosPorOrden.get(on)!.add(prod)
  }

  const nombresProductos = Array.from(
    new Set(Array.from(productosPorOrden.values()).flatMap((s) => Array.from(s))),
  )
  if (nombresProductos.length === 0) return new Set()

  const { data: prods } = await supabase
    .from("productos")
    .select("nombre, subcategoria")
    .in("nombre", nombresProductos)
  const subcategoriaPorNombre = new Map<string, string | null>()
  for (const p of prods ?? []) subcategoriaPorNombre.set(String(p.nombre ?? "").trim(), p.subcategoria)

  const resultado = new Set<string>()
  for (const [on, productosOrden] of productosPorOrden) {
    for (const prod of productosOrden) {
      if (esProductoPorUnidad(subcategoriaPorNombre.get(prod))) {
        resultado.add(on)
        break
      }
    }
  }
  return resultado
}

export async function getDashboardOperacionesData(
  selectedEmpresaId?: number,
  /**
   * Fecha (YYYY-MM-DD) que se aplica como filtro sobre `fechacargue`.
   * Si no se pasa, se asume el dia de hoy en timezone Colombia.
   */
  fecha?: string,
) {
  try {
    const supabase = await createClient()
    const empresaId = selectedEmpresaId || await getCurrentEmpresaId()
    const fechaFiltro = fecha || getColombiaDate()

    // FILTRO DE FECHA EN SQL — mismo motivo que en getDashboardOperacionesStats.
    // Sin él se pedía toda la historia de la empresa (2.803 filas en Indupan) y
    // Supabase la cortaba en 1000. Aquí el `.order(ordendecargue DESC)` disimulaba
    // el problema —se quedaba con las más recientes—, pero igual es una bomba de
    // tiempo: en cuanto un solo día quede fuera de esas 1000 filas, la tabla
    // empieza a mentir igual que las tarjetas.
    // Rango [fecha, fecha+1) para tolerar DATE y TIMESTAMP. El filtro en JS de
    // abajo se conserva como red de seguridad.
    const finDiaTabla = new Date(`${fechaFiltro}T00:00:00Z`)
    finDiaTabla.setUTCDate(finDiaTabla.getUTCDate() + 1)
    const diaSiguienteTabla = finDiaTabla.toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from("dashboardoperaciones")
      .select(CAMPOS_OPERACIONES)
      .eq("idempresa", empresaId)
      .neq("tipooperacion", "Tolva")
      .neq("tipooperacion", "Tolva f")
      .neq("tipooperacion", "proyeccion")
      .gte("fechacargue", fechaFiltro)
      .lt("fechacargue", diaSiguienteTabla)
      .order("ordendecargue", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching dashboardoperaciones data:", error)
      throw error
    }

    const filtered = (data || []).filter((row: { fechacargue?: string | null }) => {
      const iso = extractIsoDate(row.fechacargue)
      return iso === fechaFiltro
    })

    // DESCARGUES PENDIENTES: los que aún no tienen `fechacargue` no los pudo
    // traer la consulta de arriba (ver `codigosDescarguePendientes`). Se agregan
    // aqui, ANTES del respaldo de cliente, para que tambien se les resuelva el
    // cliente desde `detalleoc`.
    const codigosPendientes = await codigosDescarguePendientes(
      supabase,
      empresaId,
      fechaFiltro,
      diaSiguienteTabla,
    )
    if (codigosPendientes.length > 0) {
      const yaPresentes = new Set(filtered.map((r: any) => r.ordendecargue))
      const faltantes = codigosPendientes.filter((c) => !yaPresentes.has(c))
      if (faltantes.length > 0) {
        const { data: extra, error: errExtra } = await supabase
          .from("dashboardoperaciones")
          .select(CAMPOS_OPERACIONES)
          .eq("idempresa", empresaId)
          .in("ordendecargue", faltantes)
        if (errExtra) console.error("[v0] Error trayendo descargues pendientes:", errExtra)
        else for (const r of extra ?? []) filtered.push(r as any)
      }
    }

    // Se reordena porque los pendientes se anexaron al final y el `.order()` de
    // la consulta ya no aplica al conjunto completo.
    filtered.sort((a: any, b: any) =>
      String(b.ordendecargue ?? "").localeCompare(String(a.ordendecargue ?? "")),
    )

    // RESPALDO DE CLIENTE. El view `dashboardoperaciones` toma el cliente del
    // PEDIDO (por `ocargue`, que se asigna al crear la orden en Gestionar Orden
    // de Cargue). Los CLONES de distribución (código …D) NO tienen pedido con ese
    // código, así que el view los deja SIN cliente. Pero el clon SÍ tiene el
    // cliente en `detalleoc` (copiado del original). Aquí lo resolvemos desde
    // `detalleoc` (por `numeroorden = ordendecargue`) para las filas sin cliente.
    const sinCliente = filtered.filter(
      (r: any) => !r.cliente || String(r.cliente).trim() === "",
    )
    if (sinCliente.length > 0) {
      const codigos = Array.from(
        new Set(sinCliente.map((r: any) => r.ordendecargue).filter(Boolean)),
      )
      const { data: det } = await supabase
        .from("detalleoc")
        .select("numeroorden, cliente")
        .in("numeroorden", codigos as string[])
      const mapCli = new Map<string, string>()
      for (const d of det || []) {
        const cli = (d as any).cliente
        const num = (d as any).numeroorden
        if (cli && num && !mapCli.has(num)) mapCli.set(num, cli)
      }
      for (const r of filtered as any[]) {
        if ((!r.cliente || String(r.cliente).trim() === "") && mapCli.has(r.ordendecargue)) {
          r.cliente = mapCli.get(r.ordendecargue)
        }
      }
    }

    // TIEMPO DE PARO. Las pausas viven en su propia tabla (`pausas`), no en la
    // vista, asi que se resuelven aparte y se pegan por numero de orden.
    const paroPorOrden = await getParoPorOrden(
      supabase,
      Array.from(new Set(filtered.map((r: any) => r.ordendecargue).filter(Boolean))) as string[],
      fechaFiltro === getColombiaDate(),
    )
    for (const r of filtered as any[]) {
      const paro = paroPorOrden.get(String(r.ordendecargue ?? ""))
      r.tiempo_paro_min = paro?.minutos ?? 0
      r.paros = paro?.paros ?? 0
      r.paro_abierto = paro?.abierto ?? false
    }

    // Huevos (y cualquier producto por unidad): se marca la fila para que el
    // "Pico por hora" del cliente (que suma `pesoorden` el mismo, no via
    // stats) no lo cuente como toneladas. Ver getDashboardOperacionesStats.
    const codigosPorUnidadTabla = await codigosOrdenPorUnidad(
      supabase,
      filtered.map((r: any) => r.ordendecargue),
    )
    for (const r of filtered as any[]) {
      r.es_por_unidad = codigosPorUnidadTabla.has(String(r.ordendecargue ?? "").trim())
    }

    return { success: true, data: filtered as unknown as DashboardOperacionesData[] }
  } catch (error) {
    console.error("[v0] Error in getDashboardOperacionesData:", error)
    return { success: false, error: "Error al cargar datos del dashboard", data: [] }
  }
}

export async function getDashboardOperacionesStats(
  selectedEmpresaId?: number,
  /** Misma semantica que en `getDashboardOperacionesData`. */
  fecha?: string,
) {
  try {
    const supabase = await createClient()
    const empresaId = selectedEmpresaId || await getCurrentEmpresaId()
    const fechaFiltro = fecha || getColombiaDate()
    const hoy = getColombiaDate()
    // `vehiculosEnPatio` y `clientesEnProceso` reflejan el estado vivo
    // del patio, por lo que solo tienen sentido cuando el usuario esta
    // mirando el dia actual. En fechas pasadas/futuras los suprimimos.
    const esHoy = fechaFiltro === hoy

    // FILTRO DE FECHA EN SQL — obligatorio, no es una optimización.
    //
    // Antes esta consulta pedía TODA la historia de la empresa y filtraba el día
    // en JS. Supabase corta cualquier respuesta en 1000 filas y aquí no había ni
    // `.order()`, así que PostgREST devolvía las 1000 MÁS ANTIGUAS: las órdenes
    // del día quedaban fuera y las TARJETAS DE TONELADAS Y METAS se congelaban
    // con datos viejos. Medido el 31-jul-2026: Indupan tiene 2.803 filas en la
    // vista y esta consulta veía 0 de las 18 órdenes del día; Avimol, 0 de 14.
    // (La tabla de abajo sí se veía bien porque su consulta ordena por
    // ordendecargue DESC y se queda con las más recientes.)
    //
    // El comentario anterior justificaba filtrar en JS por "formatos heterogéneos
    // DATE vs TIMESTAMP". Verificado contra la base: `fechacargue` es hoy un DATE
    // limpio y el filtro en SQL devuelve exactamente las filas del día. Se usa un
    // RANGO [fecha, fecha+1) en vez de `.eq` para que siga sirviendo si la
    // columna vuelve a ser TIMESTAMP. El filtro en JS de más abajo se conserva
    // como red de seguridad.
    const finDiaStats = new Date(`${fechaFiltro}T00:00:00Z`)
    finDiaStats.setUTCDate(finDiaStats.getUTCDate() + 1)
    const diaSiguienteStats = finDiaStats.toISOString().slice(0, 10)

    const { data: rawData, error } = await supabase
      .from("dashboardoperaciones")
      .select("ordendecargue, pesoorden, tipooperacion, fincargue, placa, estado, fechacargue")
      .eq("idempresa", empresaId)
      .neq("tipooperacion", "Tolva")
      .neq("tipooperacion", "Tolva f")
      .neq("tipooperacion", "proyeccion")
      .gte("fechacargue", fechaFiltro)
      .lt("fechacargue", diaSiguienteStats)

    if (error) {
      console.error("[v0] Error fetching stats from dashboardoperaciones:", error)
      throw error
    }

    // Filtrado JS por la parte de fecha (ver comentario arriba en la
    // funcion de data). Asignamos a `data` para mantener el resto del
    // bloque sin cambios.
    const data = (rawData || []).filter((row: { fechacargue?: string | null }) => {
      const iso = extractIsoDate(row.fechacargue)
      return iso === fechaFiltro
    })

    // Mismos descargues pendientes que agrega la tabla, para que las tarjetas
    // cuenten lo mismo que se ve abajo. No mueven las toneladas CARGADAS /
    // DESCARGADAS (esas solo suman con estado finalizado, y un pendiente no lo
    // esta), pero si las PROGRAMADAS y los conteos de ordenes.
    const codigosPendientesStats = await codigosDescarguePendientes(
      supabase,
      empresaId,
      fechaFiltro,
      diaSiguienteStats,
    )
    if (codigosPendientesStats.length > 0) {
      const { data: extra, error: errExtra } = await supabase
        .from("dashboardoperaciones")
        .select("ordendecargue, pesoorden, tipooperacion, fincargue, placa, estado, fechacargue")
        .eq("idempresa", empresaId)
        .in("ordendecargue", codigosPendientesStats)
      if (errExtra) console.error("[v0] Error trayendo descargues pendientes (stats):", errExtra)
      else for (const r of extra ?? []) data.push(r as any)
    }

    // Calculate tonnage stats based on tipooperacion and estado filters
    // Only sum when estado is "Fin Operación" or "Finalizado LIP"
    const isFinalized = (estado: string | null) => estado === "Fin Operación" || estado === "Finalizado LIP"

    // Huevos (y cualquier producto por unidad) se excluye SOLO de las sumas
    // de peso de abajo — sigue contando como orden/vehículo normal en el
    // resto del dashboard (ordenesFinalizadas, vehiculosAtendidos, etc.).
    // Ver codigosOrdenPorUnidad.
    const codigosPorUnidad = await codigosOrdenPorUnidad(
      supabase,
      (data ?? []).map((row: any) => row.ordendecargue),
    )
    const esPesable = (row: { ordendecargue?: string | null }) =>
      !codigosPorUnidad.has(String(row.ordendecargue ?? "").trim())

    const tonsCargadas =
      data
        ?.filter((row) => row.tipooperacion === "Cargue" && isFinalized(row.estado) && esPesable(row))
        .reduce((sum, row) => sum + (row.pesoorden || 0), 0) || 0

    const tonsDescargadas =
      data
        ?.filter((row) => row.tipooperacion === "Descargue" && isFinalized(row.estado) && esPesable(row))
        .reduce((sum, row) => sum + (row.pesoorden || 0), 0) || 0

    const tonsDistribucion =
      data
        ?.filter((row) => row.tipooperacion === "Distribucion" && isFinalized(row.estado) && esPesable(row))
        .reduce((sum, row) => sum + (row.pesoorden || 0), 0) || 0

    const totalToneladasDia =
      data
        ?.filter((row) => isFinalized(row.estado) && esPesable(row))
        .reduce((sum, row) => sum + (row.pesoorden || 0), 0) || 0

    const toneladasProgramadas =
      data?.filter(esPesable).reduce((sum, row) => sum + (row.pesoorden || 0), 0) || 0

    const ordenesPorAsignar = data?.filter((row) => row.estado === "Sin lote").length || 0
    const ordenesPorPesar = data?.filter((row) => row.estado === "Por Pesar").length || 0
    const ordenesEnCola = data?.filter((row) => row.estado === "En cola").length || 0
    const ordenesEnProceso = data?.filter((row) => row.estado === "En proceso").length || 0
    const ordenesFinalizadas =
      data?.filter((row) => row.estado === "Finalizado LIP" || row.estado === "Fin Operación").length || 0

    // Datos que solo tienen sentido en tiempo real (vehiculos en patio
    // y clientes en proceso). Para fechas distintas a hoy devolvemos
    // arrays vacios — la UI muestra el estado "vacio" sin riesgo de
    // confundir al usuario con datos del momento actual.
    let vehiculosEnPatio: { placa: string; horallegada: string }[] = []
    let clientesEnProceso: { cliente: string; iniciocargue: string; tiempo_en_proceso: string }[] = []

    if (esHoy) {
      const { data: vehiculosData, error: vehiculosError } = await supabase
        .from("citasvehiculos")
        .select("placa, horallegada")
        .eq("idempresa", empresaId)
        .is("estatus", null)
        .order("horallegada", { ascending: true })

      if (vehiculosError) {
        console.error("[v0] Error fetching vehicles in yard:", vehiculosError)
      }

      vehiculosEnPatio = vehiculosData
        ? vehiculosData.map((v) => ({
            placa: v.placa || "",
            horallegada: v.horallegada || "",
          }))
        : []

      const { data: clientesData, error: clientesError } = await supabase
        .from("dashboardoperaciones")
        .select("cliente, iniciocargue, tiempo_en_proceso, ordendecargue")
        .eq("idempresa", empresaId)
        .eq("estado", "En proceso")
        .order("iniciocargue", { ascending: true })

      if (clientesError) {
        console.error("[v0] Error fetching clientes en proceso:", clientesError)
      }

      // Respaldo de cliente desde detalleoc para clones …D (ver nota en
      // getDashboardOperacionesData): el view no trae cliente para el clon.
      const mapCliProc = new Map<string, string>()
      const codigosProc = Array.from(
        new Set(
          (clientesData || [])
            .filter((c: any) => !c.cliente || String(c.cliente).trim() === "")
            .map((c: any) => c.ordendecargue)
            .filter(Boolean),
        ),
      )
      if (codigosProc.length > 0) {
        const { data: detProc } = await supabase
          .from("detalleoc")
          .select("numeroorden, cliente")
          .in("numeroorden", codigosProc as string[])
        for (const d of detProc || []) {
          const cli = (d as any).cliente
          const num = (d as any).numeroorden
          if (cli && num && !mapCliProc.has(num)) mapCliProc.set(num, cli)
        }
      }

      clientesEnProceso = clientesData
        ? clientesData.map((c: any) => ({
            cliente: c.cliente || mapCliProc.get(c.ordendecargue) || "Sin cliente",
            iniciocargue: c.iniciocargue || "",
            tiempo_en_proceso: c.tiempo_en_proceso || "",
          }))
        : []
    }

    const vehiculosAtendidos = data?.length || 0

    // Personal del dia (tabla `asignacionpersonal`). Se aplica SIEMPRE
    // el filtro de empresa para no mezclar personal entre empresas y se
    // filtra por `fecha = fechaFiltro` para que respete el selector de
    // fecha del dashboard. Ojo: a diferencia de `vehiculosEnPatio` y
    // `clientesEnProceso`, este KPI SI tiene sentido en fechas
    // historicas (saber quien estuvo asignado ese dia), por lo que NO
    // lo gateamos detras de `esHoy`.
    const { data: personalRows, error: personalError } = await supabase
      .from("asignacionpersonal")
      .select("asignacion")
      .eq("idempresa", empresaId)
      .eq("fecha", fechaFiltro)

    if (personalError) {
      console.error("[v0] Error fetching personal del dia:", personalError)
    }

    const personalAgregado = new Map<string, number>()
    for (const r of personalRows || []) {
      const key = (r.asignacion || "Sin asignación").trim() || "Sin asignación"
      personalAgregado.set(key, (personalAgregado.get(key) || 0) + 1)
    }
    const porAsignacion = Array.from(personalAgregado.entries())
      .map(([asignacion, total]) => ({ asignacion, total }))
      .sort((a, b) => b.total - a.total)

    // Meta del dia: se sustituye la antigua suma de la vista
    // `metadia` por una constante por empresa centralizada en
    // `lib/empresa-meta-dia.ts`. Es la unica fuente de verdad de
    // meta diaria para todos los dashboards (Operacion del dia +
    // LIP), asi que cambios futuros se hacen en un solo lugar.
    const metaToneladasDia = getMetaDiaForEmpresa(empresaId)

    // Productos pendientes por cargar (alerta operativa). Filtramos
    // `invtrans` por empresa, status "por descontar" y por la fecha
    // del campo `creado` (timestamptz). Para que el filtro funcione
    // sin importar timezone usamos un rango [fechaFiltro, fechaSig)
    // de 24h en lugar de un `eq` sobre un cast de fecha.
    const fechaInicio = `${fechaFiltro}T00:00:00`
    // Calculamos el dia siguiente sumando 86_400_000 ms a partir del
    // mediodia (evita el salto por DST aunque Colombia no tenga).
    const dt = new Date(`${fechaFiltro}T12:00:00Z`)
    dt.setUTCDate(dt.getUTCDate() + 1)
    const fechaSiguiente = `${dt.toISOString().slice(0, 10)}T00:00:00`

    const { data: pendientesRows, error: pendientesError } = await supabase
      .from("invtrans")
      .select("ocargue, nombreproducto, cantidad")
      .eq("idempresa", empresaId)
      .eq("status", "por descontar")
      .gte("creado", fechaInicio)
      .lt("creado", fechaSiguiente)
      .order("ocargue", { ascending: true })

    if (pendientesError) {
      console.error("[v0] Error fetching pendientes por cargar:", pendientesError)
    }

    const pendientesItems = (pendientesRows || []).map((r) => ({
      ocargue: (r.ocargue || "").toString(),
      nombreproducto: (r.nombreproducto || "Sin producto").toString(),
      cantidad: Number(r.cantidad) || 0,
    }))
    const pendientesTotalCantidad = pendientesItems.reduce(
      (sum, it) => sum + it.cantidad,
      0,
    )

    const stats: DashboardOperacionesStats = {
      tonsCargadas,
      tonsDescargadas,
      tonsDistribucion,
      totalToneladasDia,
      toneladasProgramadas,
      metaToneladasDia,
      vehiculosTendidos: vehiculosAtendidos,
      ordenesPorAsignar,
      ordenesPorPesar,
      ordenesEnCola,
      ordenesEnProceso,
      ordenesFinalizadas,
      totalOrdenesDia: data?.length || 0,
      vehiculosEnPatio,
      clientesEnProceso,
      personalDelDia: {
        total: personalRows?.length || 0,
        porAsignacion,
      },
      pendientesPorCargar: {
        total: pendientesItems.length,
        totalCantidad: pendientesTotalCantidad,
        items: pendientesItems,
      },
    }

    return { success: true, data: stats }
  } catch (error) {
    console.error("[v0] Error in getDashboardOperacionesStats:", error)
    return { success: false, error: "Error al cargar estadísticas", data: null }
  }
}

// Keep old functions for backward compatibility
export async function getDashboardData() {
  try {
    const supabase = await createClient()
    const empresaId = await getCurrentEmpresaId()
    const today = getColombiaDate()

    const { data, error } = await supabase
      .from("cabeceraoc")
      .select("*")
      .eq("idempresa", empresaId)
      .eq("fechacargue", today)
      .order("id", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching dashboard data:", error)
      throw error
    }

    const mappedData: DashboardData[] = data.map((row) => ({
      orden: row.ordendecargue || "",
      peso_orden: row.pesoorden || null,
      tipo_producto: row.tipoproducto || null,
      placa: row.placa || null,
      tipo_operacion: row.tipooperacion || null,
      hora_orden: row.horaorden || null,
      hora_pesaje_inicial: row.pesajeinicial || null,
      hora_lote: row.horalote || null,
      hora_registro_sanitario: row.horaregistrosanitario || null,
      hora_vehiculo: row.horavehiculo || null,
      hora_inicio_cargue: row.iniciocargue || null,
      hora_fin_cargue: row.fincargue || null,
      hora_pesaje_final: row.pesajefinal || null,
      duracion_minutos: row.duracion || null,
      estado: row.status || null,
    }))

    return { success: true, data: mappedData }
  } catch (error) {
    console.error("[v0] Error in getDashboardData:", error)
    return { success: false, error: "Error al cargar datos del dashboard" }
  }
}

export async function getDashboardStats() {
  try {
    const supabase = await createClient()
    const empresaId = await getCurrentEmpresaId()
    const today = getColombiaDate()

    const { data, error } = await supabase
      .from("cabeceraoc")
      .select("pesoorden, status, placa")
      .eq("idempresa", empresaId)
      .eq("fechacargue", today)

    if (error) {
      console.error("[v0] Error fetching dashboard stats:", error)
      throw error
    }

    const totalToneladas = data.reduce((sum, item) => sum + (item.pesoorden || 0), 0)
    const toneladasProcesadas = data
      .filter((item) => item.status === "finalizado")
      .reduce((sum, item) => sum + (item.pesoorden || 0), 0)

    const uniquePlacas = new Set(data.filter((item) => item.placa).map((item) => item.placa))
    const totalVehiculos = uniquePlacas.size

    const ordenesFinalizadas = data.filter((item) => item.status === "finalizado").length

    const stats: DashboardStats = {
      totalToneladas,
      toneladasProcesadas,
      totalVehiculos,
      ordenesFinalizadas,
    }

    return { success: true, data: stats }
  } catch (error) {
    console.error("[v0] Error in getDashboardStats:", error)
    return { success: false, error: "Error al cargar estadísticas del dashboard" }
  }
}
