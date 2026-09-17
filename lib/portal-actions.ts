"use server"

// Cliente admin (service_role) para BYPASEAR Row Level Security en
// `headcount` y `pagonomina`. El portal del trabajador es server-side,
// asi que es seguro usarlo aqui — y es necesario porque la anon key
// no tiene policies de SELECT en estas tablas, por lo que las queries
// del portal devolvian array vacio en silencio (sintoma: "No pudimos
// validar tu identidad" aunque el colaborador exista).
import { getSupabaseAdmin } from "@/lib/supabase-admin"

/**
 * Datos del colaborador autenticado que se comparten con el cliente
 * para persistir en el PortalContext / localStorage.
 */
export interface PortalColaborador {
  colaborador_id: number
  nombre: string
  cargo: string | null
  salario: number | null
  identificacion: string
  idempresa: number | null
  // Nombre de la empresa contratante (resuelto desde `empresas.nombre`
  // por `idempresa`). Se persiste en el contexto/localStorage para que
  // la UI del portal lo muestre en la bienvenida sin tener que volver
  // a consultarlo en cada navegacion. Puede ser null si el
  // colaborador no tiene `idempresa` asignada o si la empresa no
  // existe en la tabla.
  empresa_nombre: string | null
  // Correo del colaborador. Se muestra al trabajador despues de que su
  // anticipo es aprobado para que sepa a que cuenta llego el documento a
  // firmar. Puede ser null si el colaborador no tiene email registrado.
  email: string | null
}

export interface PortalLoginResult {
  success: boolean
  data?: PortalColaborador
  error?: string
}

/**
 * Resuelve el nombre de la empresa por `idempresa` consultando
 * `empresas_permisos` (la tabla que en esta BD mapea a `headcount.idempresa`).
 *
 * Se expone como server action separada para poder re-hidratar el
 * `PortalContext` de sesiones antiguas: cuando un colaborador inicio
 * sesion antes de que `empresa_nombre` existiera en `PortalColaborador`,
 * su objeto cacheado en `localStorage` no tiene ese campo y la UI
 * (header del portal mobile) no muestra la empresa. El cliente
 * detecta el null y llama a esta funcion una sola vez para completar
 * el dato sin obligar al usuario a re-loguearse.
 */
export async function getEmpresaNombrePortal(
  idempresa: number,
): Promise<{ nombre: string | null }> {
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("empresas_permisos")
      .select("nombre")
      .eq("id", idempresa)
      .maybeSingle()
    if (error) {
      console.log("[v0] portal getEmpresaNombre error:", error.message)
      return { nombre: null }
    }
    return { nombre: data?.nombre ? String(data.nombre) : null }
  } catch (err: any) {
    console.log("[v0] portal getEmpresaNombre exception:", err?.message)
    return { nombre: null }
  }
}

/**
 * ¿El colaborador esta ACTIVO en headcount?
 *
 * Se normaliza (trim + mayusculas) porque el valor lo teclean personas y
 * conviven variantes como "Activo", "ACTIVO" o con espacios sobrantes.
 *
 * NULL y vacio cuentan como NO activo. Es el mismo criterio con el que
 * `pagonomina` decide a quien liquidar —`upper(trim(coalesce(estado,''))) =
 * 'ACTIVO'`— y el de Tabla Asistencia, que filtra por `estado = 'Activo'`. Si
 * el portal fuera mas permisivo que la nomina, alguien sin estado veria datos
 * de un vinculo que el sistema ya no reconoce.
 */
function esHeadcountActivo(estado: unknown): boolean {
  return String(estado ?? "").trim().toUpperCase() === "ACTIVO"
}

/**
 * Revalida que la sesion abierta siga correspondiendo a alguien ACTIVO.
 *
 * El portal guarda la sesion en `localStorage`, asi que sin esto una persona
 * que inicio sesion antes de ser retirada seguiria entrando indefinidamente:
 * bloquear solo el login dejaria la regla a medias.
 *
 * FALLA-ABIERTO a proposito: ante un error de red o de base devuelve
 * `permitido: true`. Sacar a la gente de su portal por un fallo tecnico es peor
 * que dejar entrar unos minutos de mas a quien ya fue retirado.
 */
export async function verificarAccesoPortal(
  identificacion: string,
): Promise<{ permitido: boolean }> {
  const ident = (identificacion || "").trim()
  if (!ident) return { permitido: true }
  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("headcount")
      .select("estado")
      .eq("identificacion", ident)
      .limit(1)
      .maybeSingle()
    if (error) {
      console.log("[v0] portal verificarAcceso error:", error.message)
      return { permitido: true }
    }
    // Sin fila tampoco se saca a nadie: puede ser una identificacion escrita
    // distinto en headcount, y eso lo corrige Gestion Humana, no una expulsion.
    if (!data) return { permitido: true }
    return { permitido: esHeadcountActivo(data.estado) }
  } catch (err: any) {
    console.log("[v0] portal verificarAcceso exception:", err?.message)
    return { permitido: true }
  }
}

/**
 * Autenticacion simulada para el Portal de Trabajadores.
 * No usa Supabase Auth: solo valida que la identificacion exista en headcount
 * y que el usuario haya escrito la misma identificacion como contrasena.
 *
 * Se considera una capa ligera para el portal publico; el acceso real a datos
 * sensibles debe estar protegido por la identidad persistida en localStorage.
 */
export async function loginPortalColaborador(
  identificacion: string,
  password: string,
): Promise<PortalLoginResult> {
  const ident = (identificacion || "").trim()
  const pass = (password || "").trim()

  if (!ident || !pass) {
    return { success: false, error: "Debes diligenciar ambos campos." }
  }

  // Regla de negocio: usuario y contrasena son la misma identificacion.
  if (ident !== pass) {
    return { success: false, error: "Las credenciales no coinciden." }
  }

  try {
    // Service role: bypass de RLS. Sin esto la query anon devuelve []
    // y el flujo cae en "No encontramos un colaborador con esa
    // identificacion" o, si el WAF de Supabase la rechaza, en
    // "No pudimos validar tu identidad".
    const supabase = await getSupabaseAdmin()

    // En esta BD `identificacion` es TEXT y la tabla NO tiene la
    // columna `email` (los logs del servidor confirman:
    // "column headcount.email does not exist"). La excluimos del
    // select y devolvemos `email: null` mas abajo, asi la UI que ya
    // tolera `email: string | null` sigue funcionando.
    console.log("[v0] portal login query ident:", ident)

    const { data, error } = await supabase
      .from("headcount")
      .select("id, nombre, cargo, salario, identificacion, idempresa, estado")
      .eq("identificacion", ident)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.log(
        "[v0] portal login supabase error:",
        error.message,
        error.code,
        error.details,
      )
      return {
        success: false,
        error: "No pudimos validar tu identidad, intenta nuevamente.",
      }
    }

    if (!data) {
      console.log("[v0] portal login no row for ident:", ident)
      return {
        success: false,
        error: "No encontramos un colaborador con esa identificacion.",
      }
    }

    // SOLO PERSONAL ACTIVO. Quien esta retirado o inactivo en headcount no
    // entra al portal: sus datos de nomina, anticipos y certificados dejan de
    // corresponderle. Ver `esHeadcountActivo`.
    if (!esHeadcountActivo(data.estado)) {
      console.log("[v0] portal login bloqueado por estado:", ident, data.estado)
      return {
        success: false,
        error:
          "Tu usuario no está activo. Comunícate con Gestión Humana si crees que es un error.",
      }
    }

    // Resolver el nombre de la empresa con un segundo SELECT a
    // `empresas_permisos` (idempresa -> nombre). En esta BD la tabla
    // `empresas` no contiene los registros que mapean a `idempresa`
    // de `headcount`; el nombre real esta en `empresas_permisos.nombre`
    // (con su pk `id`). Hacemos query aparte en lugar de join embebido
    // porque la FK puede no estar declarada en Supabase. Si la
    // consulta falla o no hay empresa, dejamos el nombre en null y la
    // UI lo oculta.
    let empresaNombre: string | null = null
    if (data.idempresa != null) {
      const { data: empresaRow, error: empresaError } = await supabase
        .from("empresas_permisos")
        .select("nombre")
        .eq("id", data.idempresa)
        .maybeSingle()
      if (empresaError) {
        console.log(
          "[v0] portal login empresa lookup error:",
          empresaError.message,
        )
      } else if (empresaRow?.nombre) {
        empresaNombre = String(empresaRow.nombre)
      }
    }

    return {
      success: true,
      data: {
        colaborador_id: Number(data.id),
        nombre: data.nombre || "Colaborador",
        cargo: data.cargo ?? null,
        salario: data.salario != null ? Number(data.salario) : null,
        identificacion: String(data.identificacion),
        idempresa: data.idempresa != null ? Number(data.idempresa) : null,
        empresa_nombre: empresaNombre,
        // `headcount` no tiene columna `email` en esta BD (ver
        // comentario del select arriba). Devolvemos null para
        // mantener el contrato de `PortalColaborador.email`.
        email: null,
      },
    }
  } catch (err: any) {
    console.log("[v0] portal login exception:", err?.message)
    return { success: false, error: "Ocurrio un error inesperado." }
  }
}

/**
 * Una fila de `toneladasauxiliares` proyectada para la vista del
 * portal. Cada fila representa la participacion del colaborador en
 * una orden de cargue (la misma vista que el admin tiene en
 * "Detalle Toneladas" de `components/nominapersonal.tsx`).
 */
export interface PortalToneladaRow {
  fechacargue: string | null
  ordendecargue: string | null
  tipooperacion: string | null
  peso_total_operacion: number | null
  cantidad_auxiliares: number | null
  toneladas_auxiliar: number | null
}

/**
 * Una fila de `registroasistencia` con las horas extra registradas en
 * el dia para el colaborador. Aunque las columnas viven en una tabla
 * distinta a `toneladasauxiliares`, las llevamos juntas a la UI
 * porque el balance del trabajador combina toneladas + horas extra
 * por dia.
 */
export interface PortalHorasExtraRow {
  fecha: string | null
  hed: number | null
  hedf: number | null
  hen: number | null
  hef: number | null
  hn: number | null
}

/**
 * Resumen de un dia para la vista mobile/desktop del portal:
 *   - `fecha`: dia en formato "YYYY-MM-DD"
 *   - `total_toneladas`: suma de `toneladas_auxiliar` de todas las
 *     ordenes en las que el colaborador participo ese dia.
 *   - `ordenes`: detalle por orden de cargue (lo que se ve al
 *     expandir la tarjeta).
 *   - `hed/hedf/hen/hef/hn`: horas extra del dia, tomadas tal cual de
 *     `registroasistencia` (no estan en `toneladasauxiliares`). Si no
 *     hay registro de asistencia ese dia, todas son 0.
 *   - `total_horas_extra`: suma de los 5 conceptos para mostrar como
 *     KPI rapido en el header colapsado.
 */
export interface PortalBalanceDia {
  fecha: string
  total_toneladas: number
  ordenes: PortalToneladaRow[]
  hed: number
  hedf: number
  hen: number
  hef: number
  hn: number
  total_horas_extra: number
}

export interface PortalBalanceResult {
  success: boolean
  data: PortalBalanceDia[]
  error?: string
}

/**
 * Trae el balance diario del colaborador combinando dos fuentes:
 *
 *   1) `toneladasauxiliares` filtrada por `nombre_auxiliar = nombre`
 *      e `idempresa`, que es la misma fuente del modulo admin
 *      "Detalle Toneladas". Cada fila aqui es la participacion del
 *      colaborador en una orden de cargue, asi que agrupamos por dia
 *      y dentro de cada dia listamos las ordenes.
 *
 *   2) `registroasistencia` filtrada por `nombre` e `idempresa`, de
 *      donde extraemos las horas extra (hed/hedf/hen/hef/hn). Estas
 *      columnas NO viven en `toneladasauxiliares` — son del modulo
 *      de asistencia y se cruzan por fecha para construir el resumen
 *      diario.
 *
 * Implementa paginacion en bloques de 1000 filas para no perder
 * registros con historicos largos (PostgREST corta a 1000 por
 * defecto).
 */
export async function getBalanceToneladasYHoras(params: {
  idempresa: number | null
  nombre: string
}): Promise<PortalBalanceResult> {
  const { idempresa, nombre } = params
  const persona = (nombre || "").trim()

  if (!persona) {
    return { success: false, data: [], error: "Falta el nombre del colaborador." }
  }
  if (idempresa == null) {
    return { success: false, data: [], error: "El colaborador no tiene empresa asignada." }
  }

  try {
    const supabase = await getSupabaseAdmin()

    // 1) Toneladas (paginadas).
    let toneladas: PortalToneladaRow[] = []
    let offset = 0
    const pageSize = 1000
    let hasMore = true
    while (hasMore) {
      const { data, error } = await supabase
        .from("toneladasauxiliares")
        .select(
          "fechacargue, ordendecargue, tipooperacion, peso_total_operacion, cantidad_auxiliares, toneladas_auxiliar",
        )
        .eq("idempresa", idempresa)
        .eq("nombre_auxiliar", persona)
        .order("fechacargue", { ascending: false })
        .range(offset, offset + pageSize - 1)

      if (error) {
        console.log("[v0] portal balance toneladas error:", error.message)
        return { success: false, data: [], error: "No se pudo cargar tus toneladas." }
      }
      if (!data || data.length === 0) {
        hasMore = false
      } else {
        toneladas = toneladas.concat(data as PortalToneladaRow[])
        if (data.length < pageSize) hasMore = false
        else offset += pageSize
      }
    }

    // 2) Horas extra desde registroasistencia. La asistencia se
    //    consulta por `nombre` e `idempresa`. No paginamos aqui
    //    porque por persona/empresa rara vez excede 1000 dias, pero
    //    aplicamos el mismo patron por seguridad.
    let asistencias: PortalHorasExtraRow[] = []
    offset = 0
    hasMore = true
    while (hasMore) {
      const { data, error } = await supabase
        .from("registroasistencia")
        .select("fecha, hed, hedf, hen, hef, hn")
        .eq("idempresa", idempresa)
        .eq("nombre", persona)
        .order("fecha", { ascending: false })
        .range(offset, offset + pageSize - 1)

      if (error) {
        console.log("[v0] portal balance asistencia error:", error.message)
        // No abortamos: si la asistencia falla podemos seguir
        // mostrando solo toneladas. Pero dejamos el array vacio.
        break
      }
      if (!data || data.length === 0) {
        hasMore = false
      } else {
        asistencias = asistencias.concat(data as PortalHorasExtraRow[])
        if (data.length < pageSize) hasMore = false
        else offset += pageSize
      }
    }

    // Mapa fecha -> horas extra para el cruce O(1) al agrupar.
    const horasMap = new Map<string, PortalHorasExtraRow>()
    for (const a of asistencias) {
      if (a.fecha) horasMap.set(a.fecha, a)
    }

    // 3) Agrupar toneladas por fecha. Tambien recordamos las fechas
    //    que tienen solo asistencia (sin toneladas) para que el
    //    trabajador pueda ver dias donde solo hubo horas extra y
    //    ningun cargue.
    const diasMap = new Map<string, PortalBalanceDia>()
    const ensureDia = (fecha: string): PortalBalanceDia => {
      let d = diasMap.get(fecha)
      if (!d) {
        d = {
          fecha,
          total_toneladas: 0,
          ordenes: [],
          hed: 0,
          hedf: 0,
          hen: 0,
          hef: 0,
          hn: 0,
          total_horas_extra: 0,
        }
        diasMap.set(fecha, d)
      }
      return d
    }

    for (const t of toneladas) {
      if (!t.fechacargue) continue
      const dia = ensureDia(t.fechacargue)
      dia.ordenes.push(t)
      dia.total_toneladas += Number(t.toneladas_auxiliar) || 0
    }

    for (const a of asistencias) {
      if (!a.fecha) continue
      const dia = ensureDia(a.fecha)
      dia.hed = Number(a.hed) || 0
      dia.hedf = Number(a.hedf) || 0
      dia.hen = Number(a.hen) || 0
      dia.hef = Number(a.hef) || 0
      dia.hn = Number(a.hn) || 0
      dia.total_horas_extra =
        dia.hed + dia.hedf + dia.hen + dia.hef + dia.hn
    }

    // Para los dias que tenian toneladas pero la asistencia NO trajo
    // horas extra, el cruce queda en 0 (estado por defecto). No hay
    // que hacer nada extra aqui.

    // Ordenar dias de mas reciente a mas antiguo (lexicografico
    // funciona bien con "YYYY-MM-DD").
    const dias = Array.from(diasMap.values()).sort((a, b) =>
      a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0,
    )

    // Y dentro de cada dia, ordenar las ordenes por nombre asc para
    // que la lista expandida sea estable entre cargas.
    for (const d of dias) {
      d.ordenes.sort((a, b) =>
        (a.ordendecargue || "").localeCompare(b.ordendecargue || ""),
      )
    }

    return { success: true, data: dias }
  } catch (err: any) {
    console.log("[v0] portal balance exception:", err?.message)
    return { success: false, data: [], error: "Ocurrio un error inesperado." }
  }
}

// ===========================================================================
// NOVEDADES DE ASISTENCIA
// ===========================================================================

/**
 * Una novedad de asistencia individual del trabajador. Solo incluimos las
 * filas de `registroasistencia` donde el campo `asistencia` no es null/vacio,
 * porque la novedad ES ese campo (ej: "Incapacidad", "Permiso", "No asistio").
 */
export interface PortalNovedadAsistencia {
  id: number
  fecha: string
  asistencia: string
}

/**
 * Devuelve las novedades de asistencia del colaborador, filtrando por su
 * `identificacion` (no por id porque la tabla `registroasistencia` indexa
 * por cedula segun el schema en scripts/034_create_registroasistencia_table.sql).
 *
 * Filtramos `asistencia not null` y tambien excluimos strings vacios para que
 * el listado solo muestre filas que realmente tienen una novedad. Ordenamos
 * por fecha descendente para que las novedades recientes aparezcan primero.
 *
 * Igual que el resto del portal usamos el cliente admin (service_role) para
 * bypassear RLS — el portal corre server-side y la identificacion la
 * recibimos solo despues de que el colaborador se autentico via login.
 */
export async function getNovedadesAsistenciaPortal(
  identificacion: string,
): Promise<{
  success: boolean
  data: PortalNovedadAsistencia[]
  error?: string
}> {
  try {
    if (!identificacion) {
      return { success: false, data: [], error: "Identificacion requerida" }
    }
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("registroasistencia")
      .select("id, fecha, asistencia")
      .eq("identificacion", identificacion)
      .not("asistencia", "is", null)
      .neq("asistencia", "")
      .order("fecha", { ascending: false })

    if (error) {
      console.log("[v0] portal novedades error:", error.message)
      return {
        success: false,
        data: [],
        error: "No pudimos cargar tus novedades.",
      }
    }
    return { success: true, data: (data || []) as PortalNovedadAsistencia[] }
  } catch (err: any) {
    console.log("[v0] portal novedades exception:", err?.message)
    return { success: false, data: [], error: "Ocurrio un error inesperado." }
  }
}

/**
 * Novedades de asistencia que NO descalifican para pedir anticipo.
 *
 * El criterio: son DESCANSOS PROGRAMADOS, no fallas de asistencia. Quien los
 * toma sigue vinculado, cobrando y con la misma capacidad de pago, asi que no
 * es lo que la regla busca castigar. Antes contaban como novedad y dejaban a la
 * persona sin poder pedir anticipo durante el mes siguiente a volver.
 *
 *   · %vacacion%    -> "31- Vacaciones disfrutadas".
 *   · %descanso%    -> "Descanso" y "Descanso compensatorio domingo anterior".
 *   · %incapacidad% -> "13- Incapacidad por enfermedad general al 100%",
 *                      "14- Incapacidad por enfermedad general al 50",
 *                      "15- Incapacidad por enfermedad general al 66%- ingreso"
 *                      y las de origen laboral.
 *
 * Se comparan por PATRON y no por el codigo exacto para tolerar variantes
 * historicas del texto sin tener que enumerarlas.
 *
 * POR QUE LA INCAPACIDAD DEJO DE BLOQUEAR (2026-09): estar incapacitado no es
 * una falta. La regla existe para que no pida anticipo quien viene faltando,
 * pero a alguien que se enfermo se lo estaba castigando doble --deja de
 * percibir parte del salario Y ademas no podia pedir el anticipo-- que es justo
 * cuando mas lo necesita. Reportado por un usuario cuyo unico registro de los
 * ultimos 30 dias era una incapacidad.
 *
 * SIGUEN BLOQUEANDO, que es el proposito de la regla: licencias (remuneradas y
 * no remuneradas), ausencias y retiro.
 */
const NOVEDADES_NO_BLOQUEAN_ANTICIPO = ["%vacacion%", "%descanso%", "%incapacidad%"]

/**
 * Indica si el colaborador tiene al menos UNA novedad de asistencia en los
 * ultimos 30 dias contados desde hoy. Se usa como bloqueo para solicitar
 * anticipos: la regla de negocio dice que si el trabajador ha venido faltando
 * (permiso, licencia, ausencia) no puede solicitar anticipo. Las vacaciones,
 * los descansos y las incapacidades quedan FUERA; ver
 * NOVEDADES_NO_BLOQUEAN_ANTICIPO.
 *
 * Filtramos en SQL por:
 *   - identificacion = X
 *   - asistencia not null y distinto de ""
 *   - asistencia que no sea vacaciones, descanso ni incapacidad
 *   - fecha >= (hoy - 30 dias)
 *
 * Usamos `head: true` + `count: "exact"` para no traer filas; solo
 * necesitamos saber si existe al menos una. Si la consulta falla
 * devolvemos `tieneNovedades: false` para no bloquear al usuario por un
 * error tecnico — el formulario solo bloquea cuando confirmamos que SI
 * existen novedades.
 */
export async function tieneNovedadesUltimos30Dias(
  identificacion: string,
): Promise<{ tieneNovedades: boolean; cantidad: number }> {
  try {
    if (!identificacion) return { tieneNovedades: false, cantidad: 0 }
    const supabase = await getSupabaseAdmin()
    // Calculamos la fecha umbral en formato YYYY-MM-DD para comparar
    // contra la columna `fecha` de `registroasistencia`, que es DATE.
    const hace30 = new Date()
    hace30.setDate(hace30.getDate() - 30)
    const fechaIso = hace30.toISOString().slice(0, 10)

    let query = supabase
      .from("registroasistencia")
      .select("id", { count: "exact", head: true })
      .eq("identificacion", identificacion)
      .not("asistencia", "is", null)
      .neq("asistencia", "")
      .gte("fecha", fechaIso)

    // Los descansos programados y las incapacidades no descalifican. Cada `not`
    // es un filtro independiente y PostgREST los une con AND, que es justo lo
    // que se quiere: la fila cuenta solo si NO coincide con NINGUNO de los
    // patrones. Van despues del `is null` de arriba, que ya dejo fuera las
    // filas sin novedad.
    for (const patron of NOVEDADES_NO_BLOQUEAN_ANTICIPO) {
      query = query.not("asistencia", "ilike", patron)
    }

    const { count, error } = await query

    if (error) {
      console.log("[v0] portal novedades30 error:", error.message)
      return { tieneNovedades: false, cantidad: 0 }
    }
    const c = count ?? 0
    return { tieneNovedades: c > 0, cantidad: c }
  } catch (err: any) {
    console.log("[v0] portal novedades30 exception:", err?.message)
    return { tieneNovedades: false, cantidad: 0 }
  }
}

/**
 * Devuelve el valor actual de `reglamentocheck` para el colaborador
 * (identificado por su `identificacion`). Si esta poblado, significa
 * que el trabajador ya confirmo haber leido y comprendido el
 * Reglamento Interno de Trabajo (guardamos la fecha/hora de Colombia).
 */
export async function getReglamentoCheck(
  identificacion: string,
): Promise<{ confirmado: boolean }> {
  const ident = (identificacion || "").trim()
  if (!ident) return { confirmado: false }

  try {
    const supabase = await getSupabaseAdmin()
    const { data, error } = await supabase
      .from("headcount")
      .select("reglamentocheck")
      .eq("identificacion", ident)
      .maybeSingle()

    if (error) {
      console.log("[v0] portal getReglamentoCheck error:", error.message)
      return { confirmado: false }
    }
    // `reglamentocheck` es una columna boolean en `headcount`.
    return { confirmado: data?.reglamentocheck === true }
  } catch (err: any) {
    console.log("[v0] portal getReglamentoCheck exception:", err?.message)
    return { confirmado: false }
  }
}

/**
 * Marca que el colaborador leyo y comprendio el Reglamento Interno de
 * Trabajo, poniendo en `true` la columna boolean
 * `headcount.reglamentocheck`.
 */
export async function confirmarReglamentoLeido(
  identificacion: string,
): Promise<{ success: boolean; error?: string }> {
  const ident = (identificacion || "").trim()
  if (!ident) return { success: false, error: "Falta la identificacion." }

  try {
    const supabase = await getSupabaseAdmin()

    const { error } = await supabase
      .from("headcount")
      .update({ reglamentocheck: true })
      .eq("identificacion", ident)

    if (error) {
      console.log("[v0] portal confirmarReglamento error:", error.message)
      return { success: false, error: "No se pudo guardar la confirmacion." }
    }
    return { success: true }
  } catch (err: any) {
    console.log("[v0] portal confirmarReglamento exception:", err?.message)
    return { success: false, error: "Ocurrio un error inesperado." }
  }
}
